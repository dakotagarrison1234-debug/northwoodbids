export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

interface Props {
  params: Promise<{ itemId: string }>;
}

/**
 * POST /api/admin/items/[itemId]/relist
 * Body: { auctionId?: string | null }
 *
 * Give an unsold item a fresh start. Resets its price back to the starting bid,
 * cancels the old bids/proxy bids so it isn't carrying a stale history, and clears
 * any pickup/transfer leftovers. Then either drops it into a chosen auction
 * (ACTIVE if that auction is already open, otherwise DRAFT) or, with no auctionId,
 * detaches it to the drafts pool to be placed later.
 */
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const orgId = membership.organizationId;

    const { itemId } = await params;
    const body = await request.json().catch(() => ({}));
    const auctionId: string | null = body?.auctionId ?? null;
    const locationId: string | null = body?.locationId ?? null;

    // Optional: move the item to a different warehouse as part of the relist.
    if (locationId) {
      const loc = await prisma.pickupLocation.findUnique({
        where: { id: locationId },
        select: { id: true, organizationId: true },
      });
      if (!loc || loc.organizationId !== orgId) {
        return NextResponse.json({ error: "Invalid location" }, { status: 400 });
      }
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { id: true, organizationId: true, status: true, startingBid: true },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    if (item.organizationId !== orgId) {
      return NextResponse.json({ error: "Not your item" }, { status: 403 });
    }
    if (item.status !== "UNSOLD") {
      return NextResponse.json(
        { error: "Only an item that didn't sell can be relisted." },
        { status: 422 }
      );
    }

    // Resolve the destination. An open auction takes the item live immediately;
    // anything else (draft/upcoming, or no auction) parks it as a draft.
    let newStatus: "ACTIVE" | "DRAFT" = "DRAFT";
    let targetAuctionId: string | null = null;
    let targetName: string | null = null;
    if (auctionId) {
      const target = await prisma.auction.findUnique({
        where: { id: auctionId },
        select: { id: true, title: true, status: true, organizationId: true },
      });
      if (!target || target.organizationId !== orgId) {
        return NextResponse.json({ error: "Invalid auction" }, { status: 400 });
      }
      if (target.status === "CLOSED" || target.status === "SETTLED") {
        return NextResponse.json({ error: "That auction has already ended." }, { status: 422 });
      }
      targetAuctionId = target.id;
      targetName = target.title;
      newStatus = target.status === "OPEN" || target.status === "CLOSING" ? "ACTIVE" : "DRAFT";
    }

    // Fresh start: clear the old competition and any fulfillment leftovers.
    await prisma.$transaction([
      prisma.bid.updateMany({ where: { itemId }, data: { status: "CANCELLED" } }),
      prisma.proxyBid.updateMany({ where: { itemId, isActive: true }, data: { isActive: false } }),
      prisma.item.update({
        where: { id: itemId },
        data: {
          status: newStatus,
          auctionId: targetAuctionId,
          currentBid: item.startingBid,
          itemEndAt: null,
          pickedUpAt: null,
          grabbedAt: null,
          pickupAppointmentId: null,
          transferRequestId: null,
          // Move warehouses if a new location was chosen; otherwise leave it put.
          ...(locationId ? { locationId } : {}),
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      status: newStatus,
      auctionId: targetAuctionId,
      auctionName: targetName,
    });
  } catch (err) {
    console.error("[admin/items/[itemId]/relist POST]:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
