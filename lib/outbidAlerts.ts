import { prisma } from "@/lib/prisma";

/**
 * Outbid alerts, coalesced.
 *
 * The problem: outbid texts used to fire straight from the bid path, one per event.
 * Someone holding a $50 max bid getting nibbled at $1 a time would send the other
 * bidder 49 separate texts — and a bidder watching several lots in a busy auction
 * could get a dozen more. That's not an alert, that's a denial-of-service on your
 * own customer.
 *
 * The fix: the bid path only ever QUEUES an alert. A cron pass (every minute) groups
 * them per bidder and sends at most one message:
 *
 *   • Quiet window — we hold an alert until the bidder has gone QUIET_MS with no new
 *     outbids. A bidding war stops mid-flight rather than texting on every volley.
 *   • Max hold — but we never sit on one longer than MAX_HOLD_MS, so someone in a
 *     genuinely long war still hears about it in time to respond.
 *   • Still-losing check — at send time we re-check every item. If they've retaken
 *     the lead (their own max bid fired back), or the item has closed, the alert is
 *     dropped silently. No "you've been outbid" for a lot you're currently winning.
 *   • One item → deep link to that item. Several → one text to the outbid section of
 *     My Bids.
 */

const QUIET_MS = 30_000;        // stop texting until they've been left alone 30s
const MAX_HOLD_MS = 3 * 60_000; // …but never hold an alert longer than 3 minutes
const MAX_USERS_PER_RUN = 200;

/** Called from the bid path. Never sends — just records that they're now losing. */
export async function queueOutbidAlert(clerkUserId: string, itemId: string): Promise<void> {
  try {
    // Outbid again on an item they're already queued for? Just restart their quiet
    // window — it's still one alert, not two.
    const bumped = await prisma.outbidAlert.updateMany({
      where: { clerkUserId, itemId, sentAt: null },
      data: { createdAt: new Date() },
    });
    if (bumped.count === 0) {
      await prisma.outbidAlert.create({ data: { clerkUserId, itemId } });
    }
  } catch (err) {
    // An alert is never worth failing a bid over.
    console.error("queueOutbidAlert failed:", err);
  }
}

/**
 * Flush pending alerts. Safe to call every minute from the cron.
 * Returns how many bidders were texted.
 */
export async function flushOutbidAlerts(): Promise<{ notified: number }> {
  const now = new Date();
  const quietBefore = new Date(now.getTime() - QUIET_MS);
  const holdSince = new Date(now.getTime() - MAX_HOLD_MS);

  const pending = await prisma.outbidAlert.findMany({
    where: { sentAt: null },
    orderBy: { createdAt: "asc" },
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
  if (pending.length === 0) return { notified: 0 };

  // Group by bidder.
  const byUser = new Map<string, typeof pending>();
  for (const row of pending) {
    const list = byUser.get(row.clerkUserId) ?? [];
    list.push(row);
    byUser.set(row.clerkUserId, list);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  let notified = 0;
  let handled = 0;

  for (const [clerkUserId, rows] of byUser) {
    if (handled >= MAX_USERS_PER_RUN) break;

    const newest = rows.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)).createdAt;
    const oldest = rows.reduce((a, b) => (a.createdAt < b.createdAt ? a : b)).createdAt;

    // Still being bid against, and we haven't been holding long? Let it settle.
    const settled = newest <= quietBefore;
    const heldTooLong = oldest <= holdSince;
    if (!settled && !heldTooLong) continue;

    handled++;

    // Which of these are they STILL losing? Anything they've retaken, or that has
    // closed, gets dropped — closing sends its own won/lost message.
    const stillLosing: typeof rows = [];
    const stale: string[] = [];
    for (const row of rows) {
      if (row.item.status !== "ACTIVE") {
        stale.push(row.id);
        continue;
      }
      const top = await prisma.bid.findFirst({
        where: { itemId: row.itemId, status: "ACTIVE" },
        orderBy: { amount: "desc" },
        select: { clerkUserId: true },
      });
      if (!top || top.clerkUserId === clerkUserId) stale.push(row.id);
      else stillLosing.push(row);
    }

    // Retire the ones we're not texting about.
    if (stale.length) {
      await prisma.outbidAlert.updateMany({
        where: { id: { in: stale } },
        data: { sentAt: now },
      });
    }
    if (stillLosing.length === 0) continue;

    const profile = await prisma.bidderProfile.findUnique({
      where: { clerkUserId },
      select: { email: true, phone: true, name: true },
    });

    const ids = stillLosing.map((r) => r.id);

    // No contact details or no webhook configured — retire them so they don't pile up.
    if (!profile || (!profile.phone && !profile.email) || !process.env.GHL_OUTBID_WEBHOOK) {
      await prisma.outbidAlert.updateMany({ where: { id: { in: ids } }, data: { sentAt: now } });
      continue;
    }

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

    // One item → straight to the item. Several → the outbid list on My Bids.
    const smsMessage =
      count === 1
        ? `Northwood Bids: You've been outbid on ${first.title} — now $${Number(first.currentBid).toLocaleString()}. Jump back in: ${itemUrl}`
        : `Northwood Bids: You've been outbid on ${count} items. See them all and bid again: ${myBidsUrl}`;

    try {
      const res = await fetch(process.env.GHL_OUTBID_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          phone,
          name,
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
        continue; // leave pending — next run retries
      }
      notified++;
      await prisma.outbidAlert.updateMany({ where: { id: { in: ids } }, data: { sentAt: now } });
    } catch (err) {
      console.error("GHL outbid webhook failed:", err);
      // leave pending — next run retries
    }
  }

  return { notified };
}
