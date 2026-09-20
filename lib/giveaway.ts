import { prisma } from "@/lib/prisma";
import { autoAttachPaidItems } from "@/lib/pickup";
import type { Giveaway } from "@prisma/client";
import { createHmac, randomInt, timingSafeEqual } from "crypto";

export type Entrant = { clerkUserId: string; name: string; tickets: number };

/** Where a giveaway is in its life, as shown to humans. */
export type GiveawayPhase = "draft" | "scheduled" | "live" | "ended" | "complete";

/** "Sarah M." — what the public sees on winner walls and cards. */
export function publicName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Bidder";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function phaseOf(
  g: Pick<Giveaway, "status" | "startsAt" | "endsAt">,
  now: Date = new Date()
): GiveawayPhase {
  if (g.status === "DRAFT") return "draft";
  if (g.status === "DRAWN") return "complete";
  if (g.status === "ENDED") return "ended";
  if (g.startsAt && g.startsAt > now) return "scheduled";
  if (g.endsAt && g.endsAt <= now) return "ended"; // window passed, sweep hasn't flipped it yet
  return "live";
}

/** Is the entry window open right now? (tickets only count while this is true) */
export function windowOpen(g: Pick<Giveaway, "status" | "startsAt" | "endsAt">, now: Date = new Date()): boolean {
  return phaseOf(g, now) === "live";
}

/**
 * Flip any published giveaway whose window has passed to ENDED. Cheap + idempotent —
 * called on every public/admin read so "ended, waiting to pull winners" shows within
 * the same request the deadline passes, no cron needed.
 */
export async function sweepEndedGiveaways(organizationId?: string): Promise<number> {
  const now = new Date();
  // One-time migration for giveaways created before entry modes existed: anything
  // that asked a question was tap-to-enter, not "everyone's in". Cheap no-op after.
  await prisma.giveaway.updateMany({
    where: { ...(organizationId ? { organizationId } : {}), entryMode: "AUTO", requirement: { not: "NONE" } },
    data: { entryMode: "CLICK" },
  });
  const r = await prisma.giveaway.updateMany({
    where: { ...(organizationId ? { organizationId } : {}), status: "ACTIVE", endsAt: { lte: now } },
    data: { status: "ENDED", endedAt: now },
  });
  return r.count;
}

/**
 * Title of a live bid-to-enter giveaway this bid just earned a ticket in (or null).
 * Cheap: one indexed query; used on the bid response for the "+1 ticket" nudge.
 */
export async function liveBidGiveawayTitle(organizationId: string, amount: number): Promise<string | null> {
  const now = new Date();
  const g = await prisma.giveaway.findFirst({
    where: {
      organizationId, status: "ACTIVE", archived: false, entryMode: "BID",
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    },
    orderBy: { createdAt: "desc" },
    select: { title: true, minBidAmount: true },
  });
  if (!g) return null;
  if (g.minBidAmount != null && amount < Number(g.minBidAmount)) return null;
  return g.title;
}

/** Explicit "End now" — closes the window immediately. */
export async function endGiveawayNow(id: string): Promise<void> {
  await prisma.giveaway.updateMany({
    where: { id, status: "ACTIVE" },
    data: { status: "ENDED", endedAt: new Date() },
  });
}

/**
 * Who is allowed to hold a ticket at all: a registered bidder (phone + email), not
 * blocked, and — only when the giveaway says so — a payment card on file. Accounts
 * that share a phone number are collapsed to ONE (the oldest) so nobody can stack
 * tickets with duplicate accounts.
 */
export type Eligibility = {
  ok: Set<string>; // clerkUserIds allowed to hold tickets
  name: Map<string, string>;
  duplicateOf: Map<string, string>; // dupe account → the account that counts
  ineligible: Map<string, IneligibleReason>;
};
export type IneligibleReason = "blocked" | "incomplete" | "no_card" | "duplicate";

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D+/g, "");

export async function eligibility(organizationId: string, opts: { requireCard?: boolean } = {}): Promise<Eligibility> {
  const [profiles, cards] = await Promise.all([
    prisma.bidderProfile.findMany({
      select: { clerkUserId: true, name: true, phone: true, email: true, blocked: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.bidderStripeCustomer.findMany({
      where: { organizationId, defaultPaymentMethodId: { not: null } },
      select: { clerkUserId: true },
    }),
  ]);
  const hasCard = new Set(cards.map((c) => c.clerkUserId));
  const ok = new Set<string>();
  const name = new Map<string, string>();
  const duplicateOf = new Map<string, string>();
  const ineligible = new Map<string, IneligibleReason>();
  const seenPhone = new Map<string, string>();
  for (const p of profiles) {
    name.set(p.clerkUserId, p.name || "Bidder");
    // Phone is claimed by the OLDEST account that used it — even a blocked or
    // card-less one — so re-registering with the same number never earns a fresh
    // eligible account.
    const ph = digits(p.phone).slice(-10);
    let dupeOf: string | null = null;
    if (ph.length >= 7) {
      const first = seenPhone.get(ph);
      if (first) dupeOf = first;
      else seenPhone.set(ph, p.clerkUserId);
    }
    if (p.blocked) { ineligible.set(p.clerkUserId, "blocked"); continue; }
    if (dupeOf) { duplicateOf.set(p.clerkUserId, dupeOf); ineligible.set(p.clerkUserId, "duplicate"); continue; }
    if (!p.phone || !p.email) { ineligible.set(p.clerkUserId, "incomplete"); continue; }
    if (opts.requireCard && !hasCard.has(p.clerkUserId)) { ineligible.set(p.clerkUserId, "no_card"); continue; }
    ok.add(p.clerkUserId);
  }
  return { ok, name, duplicateOf, ineligible };
}

/** Bid window for a BID giveaway: from open (or publish) until it closed / closes. */
function bidWindow(g: Giveaway) {
  // The window closes at the EARLIER of the scheduled close and the actual close.
  // (The sweep stamps endedAt with the time it ran, which can be minutes after
  // endsAt — bids in that gap must never count.)
  const closes = [g.endedAt, g.endsAt].filter((d): d is Date => d != null);
  const to = closes.length ? new Date(Math.min(...closes.map((d) => d.getTime()))) : new Date();
  return { from: g.startsAt ?? g.createdAt, to };
}

/**
 * Tickets per bidder for a BID-mode giveaway. A ticket is a bid the person actually
 * PLACED inside the window: a hand-placed bid (win or lose), or setting a max bid on
 * a lot. Auto-bids the system fires on their behalf do NOT stack (otherwise a big
 * max bid would farm tickets off other people's bidding). Cancelled bids don't count.
 * Optional minimum amount and per-person cap. Counted live, never snapshotted.
 */
async function bidTickets(g: Giveaway): Promise<Map<string, number>> {
  const { from, to } = bidWindow(g);
  const [manual, proxies] = await Promise.all([
    prisma.bid.groupBy({
      by: ["clerkUserId"],
      where: {
        item: { organizationId: g.organizationId },
        isProxy: false,
        status: { not: "CANCELLED" },
        placedAt: { gte: from, lte: to },
        ...(g.minBidAmount != null ? { amount: { gte: g.minBidAmount } } : {}),
      },
      _count: { _all: true },
    }),
    prisma.proxyBid.groupBy({
      by: ["clerkUserId"],
      where: {
        item: { organizationId: g.organizationId },
        createdAt: { gte: from, lte: to },
        ...(g.minBidAmount != null ? { maxAmount: { gte: g.minBidAmount } } : {}),
      },
      _count: { _all: true },
    }),
  ]);
  const out = new Map<string, number>();
  for (const r of manual) out.set(r.clerkUserId, (out.get(r.clerkUserId) ?? 0) + r._count._all);
  for (const r of proxies) out.set(r.clerkUserId, (out.get(r.clerkUserId) ?? 0) + r._count._all);
  const cap = g.maxTicketsPerUser ?? Infinity;
  for (const [id, n] of out) out.set(id, Math.min(n, cap));
  return out;
}

/**
 * The live pool: everyone holding at least one ticket, minus removed + prior winners,
 * filtered by eligibility (card on file, not blocked, no duplicate accounts).
 *
 *  - AUTO:  every eligible bidder, 1 ticket each.
 *  - CLICK: eligible bidders with an accepted entry row (tap, or tap + answer), 1 each.
 *  - BID:   eligible bidders with ≥1 placed bid in the window, tickets = bid count.
 *  Admin hand-adds (manual) are always in with 1 ticket; bonusTickets stack on top.
 */
export async function getEligibleEntrants(giveawayId: string, preloaded?: Eligibility): Promise<Entrant[]> {
  const g = await prisma.giveaway.findUnique({ where: { id: giveawayId } });
  if (!g) return [];

  const [entries, elig] = await Promise.all([
    prisma.giveawayEntry.findMany({
      where: { giveawayId },
      select: { clerkUserId: true, removed: true, won: true, manual: true, bonusTickets: true },
    }),
    preloaded ?? eligibility(g.organizationId, { requireCard: g.requireCard }),
  ]);
  const byUser = new Map(entries.map((e) => [e.clerkUserId, e]));
  const blocked = (id: string) => {
    const e = byUser.get(id);
    return !!(e?.removed || e?.won);
  };

  const tickets = new Map<string, number>();
  if (g.entryMode === "AUTO") {
    for (const id of elig.ok) tickets.set(id, 1);
  } else if (g.entryMode === "BID") {
    for (const [id, n] of await bidTickets(g)) if (n > 0) tickets.set(id, n);
  } else {
    for (const e of entries) if (!e.removed) tickets.set(e.clerkUserId, 1);
  }

  // Manual adds always count; bonus tickets stack (admin decisions, on purpose).
  for (const e of entries) {
    if (e.manual && !e.removed && !tickets.has(e.clerkUserId)) tickets.set(e.clerkUserId, 1);
    if (e.bonusTickets > 0 && tickets.has(e.clerkUserId)) {
      tickets.set(e.clerkUserId, (tickets.get(e.clerkUserId) ?? 0) + e.bonusTickets);
    }
  }

  return [...tickets.keys()]
    // Eligibility is the floor for everyone — even a hand-added name needs a real,
    // card-backed, non-duplicate account, or the prize can't be awarded to it.
    .filter((id) => elig.ok.has(id) && !blocked(id))
    .map((id) => ({ clerkUserId: id, name: elig.name.get(id) ?? "Bidder", tickets: tickets.get(id) ?? 1 }))
    .sort((a, b) => b.tickets - a.tickets || a.name.localeCompare(b.name));
}

/** Weighted random pick — every ticket is one chance. Crypto-grade randomness. */
export function pickWeighted(pool: Entrant[]): Entrant | null {
  const total = pool.reduce((s, e) => s + Math.max(0, e.tickets), 0);
  if (total <= 0) return null;
  let r = randomInt(total); // 0 … total-1, uniform
  for (const e of pool) {
    r -= Math.max(0, e.tickets);
    if (r < 0) return e;
  }
  return pool[pool.length - 1] ?? null;
}

/**
 * Draw receipt: /draw hands the client a signed token naming exactly who was drawn
 * for which prize; /award only accepts a matching token. So the only thing that can
 * ever be awarded is what the machine actually pulled — not a hand-picked name.
 */
const DRAW_TTL_MS = 30 * 60_000;
function drawSecret() {
  return process.env.GIVEAWAY_DRAW_SECRET || process.env.CLERK_SECRET_KEY || process.env.DATABASE_URL || "northwood-draw";
}
export function signDraw(giveawayId: string, clerkUserId: string, itemId: string): { token: string; exp: number } {
  const exp = Date.now() + DRAW_TTL_MS;
  const mac = createHmac("sha256", drawSecret()).update(`${giveawayId}|${clerkUserId}|${itemId}|${exp}`).digest("hex");
  return { token: `${exp}.${mac}`, exp };
}
export function verifyDraw(token: string | undefined, giveawayId: string, clerkUserId: string, itemId: string): boolean {
  if (!token) return false;
  const [expStr, mac] = token.split(".");
  const exp = Number(expStr);
  if (!exp || !mac || exp < Date.now()) return false;
  const want = createHmac("sha256", drawSecret()).update(`${giveawayId}|${clerkUserId}|${itemId}|${exp}`).digest("hex");
  if (want.length !== mac.length) return false;
  return timingSafeEqual(Buffer.from(want), Buffer.from(mac));
}

/**
 * Award a giveaway prize to a winner, recorded so every downstream system — pickups,
 * transfers, the bidder's dashboard — treats it EXACTLY like an auction win:
 *   - a WON Bid (amount $0) so the pickup engine (which keys off WON bids) picks it up,
 *   - a comped $0 PAID Payment so it reads as paid and stays out of sales revenue
 *     (no Stripe fee, no tax — it was free), and
 *   - item → PENDING_PICKUP with its source location snapshotted, then auto-attached
 *     to the winner's pickup/transfer flow.
 *
 * Idempotent: a prize already awarded (has a WON bid) is left untouched.
 */
export async function awardGiveawayItem(clerkUserId: string, itemId: string): Promise<void> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { id: true, organizationId: true, locationId: true },
  });
  if (!item) throw new Error("Prize item not found");

  const already = await prisma.bid.findFirst({ where: { itemId, status: "WON" }, select: { id: true } });
  if (already) return; // already awarded

  const now = new Date();
  await prisma.$transaction([
    prisma.bid.create({ data: { itemId, clerkUserId, amount: 0, status: "WON", isProxy: false } }),
    prisma.payment.upsert({
      where: { itemId_clerkUserId: { itemId, clerkUserId } },
      update: {
        status: "PAID",
        comped: true,
        amount: 0,
        applicationFeeAmount: 0,
        taxAmount: 0,
        autoChargeAttemptedAt: now,
        failureReason: null,
      },
      create: {
        clerkUserId,
        itemId,
        amount: 0,
        applicationFeeAmount: 0,
        taxAmount: 0,
        status: "PAID",
        comped: true,
        autoChargeAttemptedAt: now,
      },
    }),
    prisma.item.update({
      where: { id: itemId },
      data: { status: "PENDING_PICKUP", soldLocationId: item.locationId },
    }),
  ]);

  // Fold the prize into the winner's pickup appointment / preferred-location transfer.
  await autoAttachPaidItems(clerkUserId, item.organizationId, { notifyTeam: false });
}
