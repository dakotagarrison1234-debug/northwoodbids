export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { eligibility, getEligibleEntrants, phaseOf, publicName, sweepEndedGiveaways } from "@/lib/giveaway";

/**
 * GET /api/giveaways/active?all=1
 *
 * Published giveaways for the public: live, scheduled (counting down to open) and
 * ended-waiting-to-draw, newest first. The home page shows the first two; the
 * /giveaways portal passes all=1 and also gets recently completed ones with winners.
 * Includes the signed-in viewer's ticket count per giveaway.
 */
// The public part of the payload (pools, totals, prizes) is identical for every
// visitor, so it's memoised for a few seconds per instance. The signed-in viewer's
// own standing is layered on top per request from the cached pool — never stale
// for them, and the home page stops running full profile scans per visitor.
const CACHE_MS = 10_000;
type Cached = { at: number; rows: unknown; pools: unknown; eligs: unknown; nameById: unknown };
const cacheByView = new Map<string, Cached>(); // "home" | "all"

export async function GET(request: NextRequest) {
  const all = request.nextUrl.searchParams.get("all") === "1";
  const now = new Date();

  type Rows = Awaited<ReturnType<typeof loadRows>>;
  async function loadRows() {
    await sweepEndedGiveaways();
    return prisma.giveaway.findMany({
    where: {
      archived: false,
      OR: [
        { status: { in: ["ACTIVE", "ENDED"] } },
        // Completed ones stay on the portal for two weeks so people can see who won.
        ...(all ? [{ status: "DRAWN" as const, updatedAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } }] : []),
      ],
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          retailValue: true,
          photos: { where: { isPrimary: true }, take: 1, select: { url: true } },
        },
      },
      entries: { where: { won: true }, select: { clerkUserId: true, wonItemId: true } },
    },
  });
  }

  let rows: Rows;
  let pools: Map<string, Awaited<ReturnType<typeof getEligibleEntrants>>>;
  let eligs: Map<string, Awaited<ReturnType<typeof eligibility>>>;
  let nameById: Map<string, string>;
  const cache = cacheByView.get(all ? "all" : "home") ?? null;
  const fresh = cache && now.getTime() - cache.at < CACHE_MS;
  if (fresh && cache) {
    rows = cache.rows as Rows;
    pools = cache.pools as typeof pools;
    eligs = cache.eligs as typeof eligs;
    nameById = cache.nameById as typeof nameById;
  } else {
  rows = await loadRows();

  // Ticket totals from the SAME pool the draw uses — never an approximation, so the
  // number on the card is exactly what's in the drum.
  // One eligibility pass per rule (card required or not), shared across giveaways.
  const eligByRule = new Map<string, Awaited<ReturnType<typeof eligibility>>>();
  const eligFor = async (g: (typeof rows)[number]) => {
    const key = g.requireCard ? "card" : "open";
    let e = eligByRule.get(key);
    if (!e) { e = await eligibility(g.organizationId, { requireCard: g.requireCard }); eligByRule.set(key, e); }
    return e;
  };
  pools = new Map();
  eligs = new Map();
  for (const g of rows) {
    const e = await eligFor(g);
    eligs.set(g.id, e);
    pools.set(g.id, await getEligibleEntrants(g.id, e));
  }

  // Winner names for completed giveaways.
  const winnerIds = [...new Set(rows.flatMap((g) => g.entries.map((e) => e.clerkUserId)))];
  const profiles = winnerIds.length
    ? await prisma.bidderProfile.findMany({ where: { clerkUserId: { in: winnerIds } }, select: { clerkUserId: true, name: true } })
    : [];
  nameById = new Map(profiles.map((p) => [p.clerkUserId, publicName(p.name)]));
  cacheByView.set(all ? "all" : "home", { at: now.getTime(), rows, pools, eligs, nameById });
  }

  const { userId } = await auth();
  const signedIn = !!userId;
  // The viewer's own entry rows are read fresh (cheap, indexed) so a tap they just
  // made shows as "You're in" even while the shared pool is still cached.
  const myEntries = userId && rows.length
    ? await prisma.giveawayEntry.findMany({
        where: { clerkUserId: userId, giveawayId: { in: rows.map((r) => r.id) } },
        select: { giveawayId: true, won: true, removed: true, bonusTickets: true },
      })
    : [];
  const myWon = new Set(myEntries.filter((e) => e.won).map((e) => e.giveawayId));
  const myTapped = new Set(myEntries.filter((e) => !e.removed && !e.won).map((e) => e.giveawayId));

  const giveaways = [];
  for (const g of rows) {
    const prizes = g.items.map((it) => ({
      id: it.id,
      title: it.title,
      retailValue: it.retailValue ? Number(it.retailValue) : null,
      photo: it.photos[0]?.url ?? null,
    }));
    const totalValue = prizes.reduce((s, p) => s + (p.retailValue ?? 0), 0);
    const pool = pools.get(g.id) ?? [];
    const elig = eligs.get(g.id) ?? null;
    const meRow = userId ? pool.find((e) => e.clerkUserId === userId) : undefined;
    const tappedSinceCache = !!userId && !meRow && g.entryMode === "CLICK" && myTapped.has(g.id) && !!elig?.ok.has(userId);
    const mine = meRow
      ? { tickets: meRow.tickets, entered: true, eligible: true, reason: null as string | null }
      : tappedSinceCache
        ? { tickets: 1, entered: true, eligible: true, reason: null as string | null }
        : {
          tickets: 0,
          entered: !!userId && myWon.has(g.id),
          eligible: !!userId && !!elig?.ok.has(userId),
          // No BidderProfile yet (signed up, never finished /register) = incomplete.
          reason: userId && elig ? (elig.ineligible.get(userId) ?? (elig.name.has(userId) ? null : "incomplete")) : null,
        };
    giveaways.push({
      id: g.id,
      title: g.title,
      description: g.description,
      phase: phaseOf(g, now),
      entryMode: g.entryMode,
      drawStyle: g.drawStyle,
      requirement: g.requirement,
      requirementPrompt: g.requirementPrompt,
      startsAt: g.startsAt,
      endsAt: g.endsAt,
      minBidAmount: g.minBidAmount != null ? Number(g.minBidAmount) : null,
      maxTicketsPerUser: g.maxTicketsPerUser,
      requireCard: g.requireCard,
      winners: prizes.length,
      totalValue,
      totalTickets: pool.reduce((s, e) => s + e.tickets, 0),
      totalPeople: pool.length,
      prizes,
      me: { entered: mine.entered, tickets: mine.tickets, eligible: mine.eligible, reason: mine.reason, won: !!userId && myWon.has(g.id) },
      wonBy: g.entries.map((e) => ({
        name: nameById.get(e.clerkUserId) ?? "Bidder",
        prize: prizes.find((p) => p.id === e.wonItemId)?.title ?? "Prize",
      })),
    });
  }

  // Order for display: live first, then ended (waiting), then scheduled, then complete.
  const rank: Record<string, number> = { live: 0, ended: 1, scheduled: 2, complete: 3, draft: 9 };
  giveaways.sort((a, b) => rank[a.phase] - rank[b.phase]);

  const visible = all ? giveaways : giveaways.filter((g) => g.phase !== "complete").slice(0, 2);
  const first = visible[0] ?? null;

  return NextResponse.json({
    giveaways: visible,
    // Back-compat for anything still reading the single-giveaway shape.
    giveaway: first,
    signedIn,
    entered: first?.me.entered ?? false,
  });
}
