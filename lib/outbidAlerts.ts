import { after } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Outbid alerts — fast, but not spammy.
 *
 * We advertise INSTANT outbid alerts, so the first time a bidder is outbid they get a
 * text within a second or two: the bid path queues the alert and schedules an
 * immediate send with Next's `after()` (runs after the response, so it never slows the
 * bid). Vercel crons can't fire sub-minute, so this is how "instant" actually happens.
 *
 * The only thing we still guard against is the proxy-war firehose — a $50 max getting
 * nibbled $1 at a time could otherwise text 49 times. So after we text a bidder, a
 * short COOLDOWN suppresses further instant sends to them; anything they're outbid on
 * during that window is coalesced and swept up by the once-a-minute cron in ONE text.
 *
 * At send time we always re-check each item: if they've retaken the lead (their own max
 * fired back) or the item has closed, that alert is dropped silently.
 */

const COOLDOWN_MS = 45_000;      // after texting a bidder, hold further instant sends this long
const QUIET_MS = 5_000;          // cron backstop: let a burst settle a few seconds first
const MAX_HOLD_MS = 60_000;      // …but never sit on a coalesced alert longer than a minute
const MAX_USERS_PER_RUN = 200;

/**
 * Called from the bid path. Records that the bidder is now losing, then schedules an
 * immediate (post-response) send. Never sends inline — never worth slowing/failing a bid.
 */
export async function queueOutbidAlert(clerkUserId: string, itemId: string): Promise<void> {
  try {
    // Outbid again on an item they're already queued for? Just restart the row's clock —
    // it's still one alert, not two.
    const bumped = await prisma.outbidAlert.updateMany({
      where: { clerkUserId, itemId, sentAt: null },
      data: { createdAt: new Date() },
    });
    if (bumped.count === 0) {
      await prisma.outbidAlert.create({ data: { clerkUserId, itemId } });
    }
  } catch (err) {
    console.error("queueOutbidAlert failed:", err);
    return;
  }

  // Fire the text right after the response goes out. If we're somehow not in a request
  // context (`after` throws), the per-minute cron still covers it.
  try {
    after(async () => {
      try {
        await sendOutbidNow(clerkUserId);
      } catch (e) {
        console.error("instant outbid send failed:", e);
      }
    });
  } catch {
    /* no request context — cron backstop will handle it */
  }
}

/** Send immediately unless we've texted this bidder within the cooldown window. */
async function sendOutbidNow(clerkUserId: string): Promise<void> {
  const recent = await prisma.outbidAlert.findFirst({
    where: { clerkUserId, sentAt: { not: null } },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  if (recent?.sentAt && Date.now() - recent.sentAt.getTime() < COOLDOWN_MS) {
    return; // within cooldown — leave it queued; the cron coalesces and sends it
  }
  await sendOutbidForUser(clerkUserId);
}

/**
 * Send one bidder's pending outbid alert(s) as a single text. Self-contained and
 * concurrency-safe: it CLAIMS the rows (stamps sentAt) before hitting the webhook, so a
 * simultaneous instant + cron pass can't double-text; on webhook failure it un-claims so
 * the next run retries. Returns whether a text actually went out.
 */
async function sendOutbidForUser(clerkUserId: string): Promise<boolean> {
  const now = new Date();
  const rows = await prisma.outbidAlert.findMany({
    where: { clerkUserId, sentAt: null },
    include: {
      item: {
        select: {
          id: true,
          title: true,
          status: true,
          currentBid: true,
          auction: { select: { slug: true, title: true } },
          organization: { select: { slug: true, name: true } },
        },
      },
    },
  });
  if (rows.length === 0) return false;

  // Which are they STILL losing? Retaken or closed lots are dropped (closing sends its
  // own won/lost message).
  const stillLosing: typeof rows = [];
  const stale: string[] = [];
  for (const row of rows) {
    if (row.item.status !== "ACTIVE") { stale.push(row.id); continue; }
    const top = await prisma.bid.findFirst({
      where: { itemId: row.itemId, status: "ACTIVE" },
      orderBy: { amount: "desc" },
      select: { clerkUserId: true },
    });
    if (!top || top.clerkUserId === clerkUserId) stale.push(row.id);
    else stillLosing.push(row);
  }
  if (stale.length) {
    await prisma.outbidAlert.updateMany({ where: { id: { in: stale } }, data: { sentAt: now } });
  }
  if (stillLosing.length === 0) return false;

  const ids = stillLosing.map((r) => r.id);

  // CLAIM before sending so a concurrent pass can't also send these.
  const claim = await prisma.outbidAlert.updateMany({
    where: { id: { in: ids }, sentAt: null },
    data: { sentAt: now },
  });
  if (claim.count === 0) return false; // another pass beat us to it

  const profile = await prisma.bidderProfile.findUnique({
    where: { clerkUserId },
    select: { email: true, phone: true, name: true },
  });
  // No contact details or no webhook — the rows stay claimed (sentAt set) so they don't pile up.
  if (!profile || (!profile.phone && !profile.email) || !process.env.GHL_OUTBID_WEBHOOK) {
    return false;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const email = profile.email ?? "";
  const phone = profile.phone ?? "";
  const name = profile.name ?? "Bidder";
  const count = stillLosing.length;
  const first = stillLosing[0].item;
  const itemUrl =
    first.organization && first.auction
      ? `${appUrl}/${first.organization.slug}/${first.auction.slug}/item/${first.id}`
      : appUrl;
  const myBidsUrl = `${appUrl}/dashboard#outbid`;

  const smsMessage =
    count === 1
      ? `Northwood Bids: You've been outbid on ${first.title} — now $${Number(first.currentBid).toLocaleString()}. Jump back in: ${itemUrl}`
      : `Northwood Bids: You've been outbid on ${count} items. See them all and bid again: ${myBidsUrl}`;

  try {
    const res = await fetch(process.env.GHL_OUTBID_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email, phone, name,
        firstName: name.split(" ")[0] || name,
        lastName: name.split(" ").slice(1).join(" ") || "",
        event: "outbid",
        smsMessage,
        bidderEmail: email,
        bidderPhone: phone,
        bidderName: name,
        itemCount: count,
        itemTitle: count === 1 ? first.title : `${count} items`,
        itemUrl: count === 1 ? itemUrl : myBidsUrl,
        myBidsUrl,
        newBidAmount: Number(first.currentBid),
        auctionName: first.auction?.title ?? "Auction",
        orgName: first.organization?.name ?? "Northwood Bids",
      }),
    });
    if (!res.ok) {
      console.error("GHL outbid webhook rejected:", res.status);
      // Un-claim so the next run retries.
      await prisma.outbidAlert.updateMany({ where: { id: { in: ids } }, data: { sentAt: null } });
      return false;
    }
    return true;
  } catch (err) {
    console.error("GHL outbid webhook failed:", err);
    await prisma.outbidAlert.updateMany({ where: { id: { in: ids } }, data: { sentAt: null } });
    return false;
  }
}

/**
 * Backstop sweep — runs every minute from the cron. Catches alerts that were coalesced
 * during a bidder's cooldown, or whose instant send didn't fire. Sends at most one text
 * per bidder. Returns how many bidders were texted.
 */
export async function flushOutbidAlerts(): Promise<{ notified: number }> {
  const now = Date.now();
  const quietBefore = now - QUIET_MS;
  const holdSince = now - MAX_HOLD_MS;

  // Distinct bidders with something pending, plus their newest/oldest queue times.
  const pending = await prisma.outbidAlert.findMany({
    where: { sentAt: null },
    select: { clerkUserId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  if (pending.length === 0) return { notified: 0 };

  const times = new Map<string, { newest: number; oldest: number }>();
  for (const r of pending) {
    const t = r.createdAt.getTime();
    const cur = times.get(r.clerkUserId);
    if (!cur) times.set(r.clerkUserId, { newest: t, oldest: t });
    else { cur.newest = Math.max(cur.newest, t); cur.oldest = Math.min(cur.oldest, t); }
  }

  let notified = 0;
  let handled = 0;
  for (const [clerkUserId, { newest, oldest }] of times) {
    if (handled >= MAX_USERS_PER_RUN) break;
    // Let a live burst settle a few seconds, but never hold longer than the max.
    if (newest > quietBefore && oldest > holdSince) continue;
    handled++;
    if (await sendOutbidForUser(clerkUserId)) notified++;
  }

  return { notified };
}
