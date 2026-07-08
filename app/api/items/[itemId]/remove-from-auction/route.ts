import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessOrg } from "@/lib/auth";
import { triggerAuctionUpdated } from "@/lib/pusherServer";

// POST /api/items/[itemId]/remove-from-auction
// Pulls an item out of its auction and returns it to Drafts (unlinked). Any active
// bids on it are cancelled so nobody "wins" it. Not allowed once it's sold/paid.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { itemId } = await params;
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { organization: { select: { id: true, slug: true } }, _count: { select: { payments: true } } },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    if (!(await canAccessOrg(item.organizationId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sold = item.status === "SOLD" || item.status === "PENDING_PICKUP" || item.status === "PICKED_UP";
    if (sold || item._count.payments > 0) {
      return NextResponse.json(
        { error: "This item has been sold or paid — it can't be removed. Refund it first if needed." },
        { status: 422 }
      );
    }

    if (!item.auctionId) {
      return NextResponse.json({ error: "This item isn't in an auction." }, { status: 400 });
    }

    await prisma.$transaction([
      // Void any live bids so no one is left thinking they might win it.
      prisma.bid.updateMany({ where: { itemId, status: "ACTIVE" }, data: { status: "CANCELLED" } }),
      prisma.proxyBid.updateMany({ where: { itemId, isActive: true }, data: { isActive: false } }),
      prisma.item.update({
        where: { id: itemId },
        data: { auctionId: null, status: "DRAFT", itemEndAt: null, currentBid: 0 },
      }),
    ]);

    triggerAuctionUpdated(item.organization.slug).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing item from auction:", error);
    return NextResponse.json({ error: "Failed to remove item from auction" }, { status: 500 });
  }
}
