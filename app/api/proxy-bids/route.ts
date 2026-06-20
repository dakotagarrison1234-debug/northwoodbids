import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getNextValidBid } from "@/lib/bidIncrements";
import { resolveNewProxy, broadcastProxyUpdate } from "@/lib/proxyBidResolver";
import { triggerAuctionUpdated } from "@/lib/pusherServer";

/**
 * POST /api/proxy-bids
 * Body: { itemId: string; maxAmount: number }
 *
 * Sets or updates the authenticated user's proxy bid for an item.
 * Immediately resolves against any competing proxy and places an auto-bid if needed.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { itemId, maxAmount } = await request.json();
    if (!itemId || maxAmount === undefined || maxAmount === null) {
      return NextResponse.json({ error: "itemId and maxAmount required" }, { status: 400 });
    }

    const amount = parseFloat(maxAmount);
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid maxAmount" }, { status: 400 });
    }
    if (amount > 1_000_000) {
      return NextResponse.json({ error: "Proxy max exceeds the maximum allowed amount" }, { status: 400 });
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { auction: true },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Item / auction must be open
    if (item.status !== "ACTIVE") {
      return NextResponse.json({ error: "This item is not currently accepting bids" }, { status: 400 });
    }
    if (!item.auction || (item.auction.status !== "OPEN" && item.auction.status !== "CLOSING")) {
      return NextResponse.json({ error: "This auction is not currently open" }, { status: 400 });
    }

    // Bidding time must not have expired
    const effectiveEndAt = item.itemEndAt ?? item.auction.endAt;
    if (new Date() > effectiveEndAt) {
      return NextResponse.json({ error: "Bidding for this item has ended" }, { status: 400 });
    }

    // Require completed bidder profile
    const profile = await prisma.bidderProfile.findUnique({ where: { clerkUserId: userId } });
    if (!profile?.phone || !profile?.email) {
      return NextResponse.json(
        { error: "You must complete registration before placing a proxy bid", requiresRegistration: true },
        { status: 403 }
      );
    }

    // Require a card on file
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
        { error: "A payment card is required to place proxy bids", requiresPaymentMethod: true },
        { status: 403 }
      );
    }

    // Proxy max must be >= the next valid bid (or startingBid if no bids yet)
    const minProxy = Number(item.currentBid) > 0 ? getNextValidBid(Number(item.currentBid)) : (Number(item.startingBid) > 0 ? Number(item.startingBid) : 1);
    if (amount < minProxy) {
      return NextResponse.json(
        { error: `Proxy max must be at least $${minProxy.toLocaleString()}` },
        { status: 400 }
      );
    }

    // Upsert the proxy (one proxy per user per item)
    const proxy = await prisma.proxyBid.upsert({
      where: { itemId_clerkUserId: { itemId, clerkUserId: userId } },
      create: { itemId, clerkUserId: userId, maxAmount: amount, isActive: true },
      update: { maxAmount: amount, isActive: true },
    });

    // Resolve against any competing proxy (and place auto-bid if needed)
    const resolution = await resolveNewProxy(itemId, userId);

    // Always broadcast a proxy-update so the badge appears for all viewers
    await broadcastProxyUpdate(itemId, true);

    // If the proxy placed an auto-bid, refresh browse grids so prices update live
    if (resolution.proxyFired) {
      const org = await prisma.organization.findUnique({
        where: { id: item.organizationId },
        select: { slug: true },
      });
      triggerAuctionUpdated(org?.slug).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      proxy,
      proxyFired: resolution.proxyFired,
      newAmount: resolution.newAmount,
      newEndAt: resolution.newEndAt ?? null,
    });
  } catch (error) {
    console.error("Proxy bid error:", error);
    return NextResponse.json({ error: "Failed to set proxy bid" }, { status: 500 });
  }
}
