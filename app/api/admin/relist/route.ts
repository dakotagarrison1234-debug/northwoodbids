export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

/**
 * POST /api/admin/relist
 * Body: { fromAuctionId: string | null; toAuctionId: string }
 *
 * "Relist all": every UNSOLD lot from one auction (or, with fromAuctionId null,
 * every unsold lot with no auction) goes into the chosen auction in one go. Same
 * fresh-start rules as the single-item relist (/api/admin/items/[itemId]/relist):
 * price back to the starting bid, old bids and max bids cancelled, pickup/transfer
 * leftovers cleared. ACTIVE if the target is already open, otherwise DRAFT. Each
 * lot keeps its current warehouse.
 */
export async function POST(request: NextRequest) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const orgId = membership.organizationId;

    const body = await request.json().catch(() => ({}));
    const fromAuctionId: string | null = body?.fromAuctionId ?? null;
    const toAuctionId: string | null = body?.toAuctionId ?? null;
    if (!toAuctionId) {
      return NextResponse.json({ error: "Pick an auction to relist into." }, { status: 400 });
    }

    const target = await prisma.auction.findUnique({
      where: { id: toAuctionId },
      select: { id: true, title: true, status: true, organizationId: true },
    });
    if (!target || target.organizationId !== orgId) {
      return NextResponse.json({ error: "Invalid auction" }, { status: 400 });
    }
    if (target.status === "CLOSED" || target.status === "SETTLED") {
      return NextResponse.json({ error: "That auction has already ended." }, { status: 422 });
    }
    const newStatus: "ACTIVE" | "DRAFT" =
      target.status === "OPEN" || target.status === "CLOSING" ? "ACTIVE" : "DRAFT";

    const items = await prisma.item.findMany({
      where: { organizationId: orgId, status: "UNSOLD", auctionId: fromAuctionId },
      select: { id: true, startingBid: true },
    });
    if (items.length === 0) {
      return NextResponse.json({ success: true, count: 0, auctionName: target.title, status: newStatus });
    }
    const ids = items.map((i) => i.id);

    // Fresh start for every lot, atomically. The per-item price reset needs one
    // update per item (each has its own starting bid); the rest is a bulk op.
    await prisma.$transaction([
      prisma.bid.updateMany({ where: { itemId: { in: ids } }, data: { status: "CANCELLED" } }),
      prisma.proxyBid.updateMany({ where: { itemId: { in: ids }, isActive: true }, data: { isActive: false } }),
      ...items.map((it) =>
        prisma.item.update({
          where: { id: it.id },
          data: {
            status: newStatus,
            auctionId: target.id,
            currentBid: it.startingBid,
            itemEndAt: null,
            pickedUpAt: null,
            grabbedAt: null,
            pickupAppointmentId: null,
            transferRequestId: null,
            // Shipping is decided fresh on the next win.
            fulfillment: null,
            shippingBundleId: null,
            shipChargeCents: 0,
          },
        })
      ),
    ]);

    return NextResponse.json({ success: true, count: ids.length, auctionName: target.title, status: newStatus });
  } catch (err) {
    console.error("[admin/relist POST]:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
