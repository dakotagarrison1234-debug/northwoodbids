/**
 * Proxy bid resolution engine.
 *
 * Edge cases handled:
 *  1. Race conditions — all bid state is re-read inside a transaction
 *  2. Increment consistency — all auto-bids use getNextValidBid / getIncrement
 *  3. Popcorn extension — auto-bids trigger the same 2:00 extension logic
 *  4. Two competing proxies — resolved to final state in one pass (not incrementally)
 *  5. Tie at same max — earliest createdAt wins
 *  6. Proxy already holds the lead (no competition) — no unnecessary re-bid
 *  7. Beaten proxies — deactivated so badge clears
 *  8. GHL webhooks — fired for both outbid and bid confirmation on auto-bids
 *  9. Pusher events — new-bid (with isProxy + hasActiveProxy) + proxy-update
 * 10. Orphaned proxies — deactivated by closeAuction / closeExpiredItems
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getIncrement, getNextValidBid } from "@/lib/bidIncrements";
import { getPusherServer } from "@/lib/pusherServer";
import { POPCORN_WINDOW_MS, POPCORN_EXTENSION_MS } from "@/lib/constants";

type ItemContext = {
  id: string;
  currentBid: Prisma.Decimal;
  startingBid: Prisma.Decimal;
  itemEndAt: Date | null;
  title: string;
  auction: {
    id: string;
    title: string;
    slug: string;
    endAt: Date;
    status: string;
  } | null;
  organization: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

type ProxyRecord = {
  id: string;
  clerkUserId: string;
  maxAmount: Prisma.Decimal;
  createdAt: Date;
};

/**
 * Low-level: place a single proxy auto-bid.
 * Handles DB transaction, popcorn extension, Pusher, and GHL webhooks.
 * `displacedBidderId` is the person who is outbid by this auto-bid (for GHL notification).
 */
async function placeProxyBid(
  item: ItemContext,
  proxy: ProxyRecord,
  amount: number,
  displacedBidderId: string | null
): Promise<{ newAmount: number; newEndAt: string | null }> {
  // Popcorn: extend end time if bid lands inside last 2:00
  const effectiveEndAt = item.itemEndAt ?? item.auction?.endAt;
  let newItemEndAt: Date | null = null;
  if (effectiveEndAt) {
    const timeLeft = effectiveEndAt.getTime() - Date.now();
    if (timeLeft < POPCORN_WINDOW_MS) {
      newItemEndAt = new Date(Date.now() + POPCORN_EXTENSION_MS);
    }
  }

  // Fetch profiles before transaction (avoid slow I/O inside the transaction)
  const [displacedProfile, proxyOwnerProfile] = await Promise.all([
    displacedBidderId && displacedBidderId !== proxy.clerkUserId
      ? prisma.bidderProfile.findUnique({ where: { clerkUserId: displacedBidderId } })
      : Promise.resolve(null),
    prisma.bidderProfile.findUnique({ where: { clerkUserId: proxy.clerkUserId } }),
  ]);

  // Atomic: optimistic-lock guard + mark existing ACTIVE bid OUTBID + create proxy auto-bid
  const newBid = await prisma.$transaction(async (tx) => {
    const guard = await tx.item.updateMany({
      where: {
        id: item.id,
        status: "ACTIVE",
        currentBid: { lt: amount },
        OR: [{ itemEndAt: null }, { itemEndAt: { gt: new Date() } }],
      },
      data: {
        currentBid: amount,
        ...(newItemEndAt ? { itemEndAt: newItemEndAt } : {}),
      },
    });
    if (guard.count === 0) throw new Error("STALE_BID");
    await tx.bid.updateMany({
      where: { itemId: item.id, status: "ACTIVE" },
      data: { status: "OUTBID" },
    });
    return tx.bid.create({
      data: {
        itemId: item.id,
        clerkUserId: proxy.clerkUserId,
        amount,
        status: "ACTIVE",
        isProxy: true,
      },
    });
  });

  // Pusher: broadcast the auto-bid.
  // Privacy: never put a raw/truncated Clerk id on the wire. The client
  // increments its own "Bidder N" counter per event, so no user id is needed.
  await getPusherServer().trigger(`item-${item.id}`, "new-bid", {
    amount,
    bidId: newBid.id,
    placedAt: newBid.placedAt,
    isProxy: true,
    hasActiveProxy: true,
    ...(newItemEndAt ? { newEndAt: newItemEndAt.toISOString() } : {}),
  });

  const itemUrl =
    item.organization && item.auction
      ? `${process.env.NEXT_PUBLIC_APP_URL}/${item.organization.slug}/${item.auction.slug}/item/${item.id}`
      : process.env.NEXT_PUBLIC_APP_URL ?? "";

  // GHL: outbid notification to the displaced bidder
  if (displacedBidderId && displacedBidderId !== proxy.clerkUserId && displacedProfile && process.env.GHL_OUTBID_WEBHOOK) {
    const email = displacedProfile.email ?? "";
    const phone = displacedProfile.phone ?? "";
    const name = displacedProfile.name ?? "Bidder";
    fetch(process.env.GHL_OUTBID_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email, phone, name,
        firstName: name.split(" ")[0] || name,
        lastName: name.split(" ").slice(1).join(" ") || "",
        event: "outbid",
        bidderEmail: email,
        bidderPhone: phone,
        bidderName: name,
        itemTitle: item.title,
        itemUrl,
        newBidAmount: amount,
        auctionName: item.auction?.title ?? "Auction",
        orgName: item.organization?.name ?? "Organization",
      }),
    }).catch((e) => console.error("GHL outbid (proxy) failed:", e));
  }

  // GHL: bid confirmation to the proxy owner
  if (proxyOwnerProfile && process.env.GHL_BID_CONFIRM_WEBHOOK) {
    const email = proxyOwnerProfile.email ?? "";
    const phone = proxyOwnerProfile.phone ?? "";
    const name = proxyOwnerProfile.name ?? "Bidder";
    fetch(process.env.GHL_BID_CONFIRM_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email, phone, name,
        firstName: name.split(" ")[0] || name,
        lastName: name.split(" ").slice(1).join(" ") || "",
        event: "bid_confirmed",
        bidderEmail: email,
        bidderPhone: phone,
        bidderName: name,
        itemTitle: item.title,
        itemUrl,
        bidAmount: amount,
        isProxy: true,
        auctionName: item.auction?.title ?? "Auction",
        orgName: item.organization?.name ?? "Organization",
      }),
    }).catch((e) => console.error("GHL bid confirm (proxy) failed:", e));
  }

  return { newAmount: amount, newEndAt: newItemEndAt?.toISOString() ?? null };
}

/**
 * Called after a MANUAL bid is saved.
 * Checks if any competing proxy should fire back at the manual bidder.
 * Also deactivates proxies that are now permanently beaten.
 *
 * Returns { proxyFired, newAmount, newEndAt, hasActiveProxy }
 */
export async function resolveProxiesAfterBid(
  itemId: string,
  manualBidAmount: number,
  manualBidderId: string
): Promise<{
  proxyFired: boolean;
  newAmount?: number;
  newEndAt?: string | null;
  hasActiveProxy: boolean;
}> {
  // Get all active proxies for this item, excluding the manual bidder's own proxy
  const proxies = await prisma.proxyBid.findMany({
    where: { itemId, isActive: true, clerkUserId: { not: manualBidderId } },
    orderBy: [{ maxAmount: "desc" }, { createdAt: "asc" }],
  });

  if (proxies.length === 0) {
    return { proxyFired: false, hasActiveProxy: false };
  }

  const nextBid = getNextValidBid(manualBidAmount);

  // Deactivate proxies that are beaten and can't make a valid next bid
  const beaten = proxies.filter((p: ProxyRecord) => Number(p.maxAmount) < nextBid);
  const counters = proxies.filter((p: ProxyRecord) => Number(p.maxAmount) >= nextBid);

  if (beaten.length > 0) {
    await prisma.proxyBid.updateMany({
      where: { id: { in: beaten.map((p: ProxyRecord) => p.id) } },
      data: { isActive: false },
    });
  }

  if (counters.length === 0) {
    // No proxy can counter — all beaten/cleared
    return { proxyFired: false, hasActiveProxy: false };
  }

  const bestProxy = counters[0];

  // Fetch item context for placeProxyBid
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: {
      auction: { select: { id: true, title: true, slug: true, endAt: true, status: true } },
      organization: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!item) return { proxyFired: false, hasActiveProxy: counters.length > 0 };

  // Proxy fires: bids exactly 1 increment above the manual bid (capped at proxy max)
  const proxyBidAmount = Math.min(Number(bestProxy.maxAmount), nextBid);

  try {
    const result = await placeProxyBid(item, bestProxy, proxyBidAmount, manualBidderId);
    return { proxyFired: true, hasActiveProxy: true, ...result };
  } catch (e) {
    if ((e as Error).message === "STALE_BID") {
      // Race condition — another bid landed first; proxy is still active but didn't fire this time
      return { proxyFired: false, hasActiveProxy: true };
    }
    throw e;
  }
}

/**
 * Called after a new proxy is SET or UPDATED.
 * Resolves all competing proxies to their final state in one pass.
 *
 * Returns { proxyFired, newAmount, newEndAt }
 */
export async function resolveNewProxy(
  itemId: string,
  newProxyOwnerId: string
): Promise<{
  proxyFired: boolean;
  newAmount?: number;
  newEndAt?: string | null;
}> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: {
      bids: { where: { status: "ACTIVE" }, orderBy: { amount: "desc" }, take: 1 },
      auction: { select: { id: true, title: true, slug: true, endAt: true, status: true } },
      organization: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!item) return { proxyFired: false };

  const proxies = await prisma.proxyBid.findMany({
    where: { itemId, isActive: true },
    orderBy: [{ maxAmount: "desc" }, { createdAt: "asc" }],
  });

  if (proxies.length === 0) return { proxyFired: false };

  const winner = proxies[0];
  const loser = proxies[1] ?? null;
  const currentBid = Number(item.currentBid);
  const currentBidder = item.bids[0]?.clerkUserId ?? null;
  const winnerMax = Number(winner.maxAmount);
  const loserMax = loser ? Number(loser.maxAmount) : null;

  // Don't auto-raise the current leader against a LOWER (or equal) competing proxy:
  // if the winner already holds the lead and their max is at least the loser's max,
  // they already lead — just deactivate the loser proxy so users don't bid against
  // themselves and overpay.
  if (
    winner.clerkUserId === currentBidder &&
    (!loser || winnerMax >= (loserMax as number))
  ) {
    if (loser) {
      await prisma.proxyBid.update({
        where: { id: loser.id },
        data: { isActive: false },
      });
    }
    return { proxyFired: false };
  }

  // Floor = the minimum amount that takes the lead above the current price.
  const floor =
    currentBid > 0
      ? getNextValidBid(currentBid)
      : (Number(item.startingBid) > 0 ? Number(item.startingBid) : 1);

  // Settle price: a higher max always leads to at least the next valid bid above the
  // current price. Against a competing proxy, pay 1 increment above the loser's max
  // (but never below the floor); with no competing proxy, pay the floor. Capped at the
  // winner's max so they never exceed their own limit.
  const target =
    loserMax !== null
      ? Math.max(loserMax + getIncrement(loserMax), floor)
      : floor;
  const winningAmount = Math.min(winnerMax, target);

  // Displaced bidder is the ACTUAL current high bidder when they differ from the new
  // winner; fall back to the loser proxy owner otherwise.
  const displacedBidderId: string | null =
    currentBidder && currentBidder !== winner.clerkUserId
      ? currentBidder
      : (loser ? loser.clerkUserId : null);

  // Deactivate the loser's proxy (it has been fully resolved and lost)
  if (loser) {
    await prisma.proxyBid.update({
      where: { id: loser.id },
      data: { isActive: false },
    });
  }

  // Guard: should never happen with proper API validation, but be safe
  if (winningAmount <= currentBid) return { proxyFired: false };

  try {
    const result = await placeProxyBid(item, winner, winningAmount, displacedBidderId);
    return { proxyFired: true, ...result };
  } catch (e) {
    if ((e as Error).message === "STALE_BID") {
      return { proxyFired: false };
    }
    throw e;
  }
}

/**
 * Broadcasts a proxy-update Pusher event so all page visitors see
 * the badge appear or disappear in real time.
 */
export async function broadcastProxyUpdate(
  itemId: string,
  hasActiveProxy: boolean
): Promise<void> {
  await getPusherServer().trigger(`item-${itemId}`, "proxy-update", { hasActiveProxy });
}
