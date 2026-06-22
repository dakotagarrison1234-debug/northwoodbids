import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getNextValidBid } from "@/lib/bidIncrements";
import { resolveProxiesAfterBid } from "@/lib/proxyBidResolver";
import { getPusherServer, triggerAuctionUpdated } from "@/lib/pusherServer";
import { POPCORN_WINDOW_MS, POPCORN_EXTENSION_MS } from "@/lib/constants";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { itemId, amount: rawAmount } = await request.json();
    const amount = Number(rawAmount);
    if (!itemId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Item and a valid amount are required" }, { status: 400 });
    }
    if (amount > 1_000_000) {
      return NextResponse.json({ error: "Bid exceeds the maximum allowed amount" }, { status: 400 });
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        bids: { where: { status: "ACTIVE" } },
        auction: true,
        organization: true,
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Validate item and auction status
    if (item.status !== "ACTIVE") {
      return NextResponse.json({ error: "This item is not currently accepting bids" }, { status: 400 });
    }
    if (!item.auction || (item.auction.status !== "OPEN" && item.auction.status !== "CLOSING")) {
      return NextResponse.json({ error: "This auction is not currently open" }, { status: 400 });
    }

    // Enforce per-item end time (popcorn-aware)
    const effectiveEndAt = item.itemEndAt ?? item.auction.endAt;
    if (new Date() > effectiveEndAt) {
      return NextResponse.json({ error: "Bidding for this item has ended" }, { status: 400 });
    }

    // Require a completed bidder profile
    const profile = await prisma.bidderProfile.findUnique({ where: { clerkUserId: userId } });
    if (profile?.blocked) {
      return NextResponse.json(
        { error: "Your account is blocked from bidding. Please contact the auction house." },
        { status: 403 }
      );
    }
    if (!profile?.phone || !profile?.email) {
      return NextResponse.json(
        { error: "You must complete registration before bidding", requiresRegistration: true },
        { status: 403 }
      );
    }

    // Require a card on file (server-side gate — client gate is in the item page)
    const bidderCustomer = await prisma.bidderStripeCustomer.findUnique({
      where: {
        clerkUserId_organizationId: {
          clerkUserId: userId,
          organizationId: item.organizationId,
        },
      },
      select: { defaultPaymentMethodId: true },
    });
    if (!bidderCustomer?.defaultPaymentMethodId) {
      return NextResponse.json(
        { error: "A payment card is required to place bids", requiresPaymentMethod: true },
        { status: 403 }
      );
    }

    // Use the real increment table (not hardcoded +5).
    // First bid floor is $1 even when startingBid is 0.
    const minBid = Number(item.currentBid) > 0
      ? getNextValidBid(Number(item.currentBid))
      : Math.max(Number(item.startingBid), 1);
    if (amount < minBid) {
      return NextResponse.json({ error: `Minimum bid is $${minBid}` }, { status: 400 });
    }

    const previousActiveBid = item.bids[0];
    const outbidProfile = previousActiveBid
      ? await prisma.bidderProfile.findUnique({ where: { clerkUserId: previousActiveBid.clerkUserId } })
      : null;

    // Popcorn bidding: extend item end time if bid placed in last 2:00
    let newItemEndAt: Date | null = null;
    const timeLeft = effectiveEndAt.getTime() - Date.now();
    if (timeLeft < POPCORN_WINDOW_MS) {
      newItemEndAt = new Date(Date.now() + POPCORN_EXTENSION_MS);
    }

    // Record the manual bid atomically with optimistic-lock guard.
    // Guard on status ACTIVE so a bid can't land on an item the cron is concurrently
    // closing, and guard on itemEndAt so an expired item rejects the bid.
    const bid = await prisma.$transaction(async (tx) => {
      const guard = await tx.item.updateMany({
        where: {
          id: itemId,
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
      await tx.bid.updateMany({ where: { itemId, status: "ACTIVE" }, data: { status: "OUTBID" } });
      return tx.bid.create({
        data: { itemId, clerkUserId: userId, amount, status: "ACTIVE", isProxy: false },
      });
    });

    // After the manual bid is saved, check if any proxy should fire back
    const proxyResult = await resolveProxiesAfterBid(itemId, amount, userId);

    // If a proxy fired, the Pusher event is already sent by resolveProxiesAfterBid.
    // Only broadcast the manual bid event if no proxy fired (otherwise the proxy event supersedes it).
    if (!proxyResult.proxyFired) {
      // Privacy: never put a raw/truncated Clerk id on the wire. The client
      // increments its own "Bidder N" counter per event, so no user id is needed.
      await getPusherServer().trigger(`item-${itemId}`, "new-bid", {
        amount,
        bidId: bid.id,
        placedAt: bid.placedAt,
        isProxy: false,
        hasActiveProxy: proxyResult.hasActiveProxy,
        ...(newItemEndAt ? { newEndAt: newItemEndAt.toISOString() } : {}),
      });
    }

    // GHL outbid alert (only fire if the proxy didn't already outbid the previous holder)
    if (
      !proxyResult.proxyFired &&
      previousActiveBid &&
      previousActiveBid.clerkUserId !== userId &&
      process.env.GHL_OUTBID_WEBHOOK
    ) {
      const outbidEmail = outbidProfile?.email || "";
      const outbidPhone = outbidProfile?.phone || "";
      const outbidName = outbidProfile?.name || "Bidder";
      const itemUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${item.organization?.slug}/${item.auction?.slug}/item/${item.id}`;
      fetch(process.env.GHL_OUTBID_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: outbidEmail,
          phone: outbidPhone,
          name: outbidName,
          firstName: outbidName.split(" ")[0] || outbidName,
          lastName: outbidName.split(" ").slice(1).join(" ") || "",
          event: "outbid",
          bidderEmail: outbidEmail,
          bidderPhone: outbidPhone,
          bidderName: outbidName,
          itemTitle: item.title,
          itemUrl,
          outbidAmount: previousActiveBid.amount,
          newBidAmount: amount,
          auctionName: item.auction?.title || "Auction",
          orgName: item.organization?.name || "Organization",
        }),
      }).catch((err) => console.error("GHL outbid webhook failed:", err));
    }

    // GHL bid confirmation (for the manual bidder — only if they're still the winner)
    // If a proxy fired back, the proxy owner's confirmation is handled by the resolver.
    // The manual bidder was outbid — we skip their "bid confirmed" (they get "outbid" instead).
    if (!proxyResult.proxyFired && process.env.GHL_BID_CONFIRM_WEBHOOK) {
      const confirmEmail = profile.email || "";
      const confirmPhone = profile.phone || "";
      const confirmName = profile.name || "Bidder";
      const itemUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${item.organization?.slug}/${item.auction?.slug}/item/${item.id}`;
      fetch(process.env.GHL_BID_CONFIRM_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: confirmEmail,
          phone: confirmPhone,
          name: confirmName,
          firstName: confirmName.split(" ")[0] || confirmName,
          lastName: confirmName.split(" ").slice(1).join(" ") || "",
          event: "bid_confirmed",
          bidderEmail: confirmEmail,
          bidderPhone: confirmPhone,
          bidderName: confirmName,
          itemTitle: item.title,
          itemUrl,
          bidAmount: amount,
          auctionName: item.auction?.title || "Auction",
          orgName: item.organization?.name || "Organization",
        }),
      }).catch((err) => console.error("GHL bid confirm webhook failed:", err));
    }

    // Refresh browse grids (auction page, /auctions, org page) so prices update live
    triggerAuctionUpdated(item.organization?.slug).catch(() => {});

    // If proxy fired, the new effective amount and end time come from the proxy resolution
    const finalAmount = proxyResult.proxyFired ? proxyResult.newAmount : amount;
    const finalEndAt = proxyResult.proxyFired
      ? (proxyResult.newEndAt ?? newItemEndAt?.toISOString() ?? null)
      : (newItemEndAt?.toISOString() ?? null);

    return NextResponse.json({
      success: true,
      bid,
      proxyFired: proxyResult.proxyFired,
      newEndAt: finalEndAt,
      currentBid: finalAmount,
    });
  } catch (error) {
    if ((error as Error).message === "STALE_BID") {
      return NextResponse.json({ error: "Another bid just beat yours — refresh and try again" }, { status: 409 });
    }
    console.error("Bid error:", error);
    return NextResponse.json({ error: "Failed to place bid" }, { status: 500 });
  }
}
