import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcastProxyUpdate } from "@/lib/proxyBidResolver";

/**
 * GET /api/proxy-bids/[itemId]
 *
 * Returns:
 *  - userProxy: the authenticated user's proxy (or null)
 *  - hasActiveProxy: whether ANY active proxy exists on this item (for the badge)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { userId } = await auth();
    const { itemId } = await params;

    const [userProxy, activeProxyCount, topBid] = await Promise.all([
      userId
        ? prisma.proxyBid.findUnique({
            where: { itemId_clerkUserId: { itemId, clerkUserId: userId } },
            select: { maxAmount: true, isActive: true, createdAt: true },
          })
        : Promise.resolve(null),
      prisma.proxyBid.count({ where: { itemId, isActive: true } }),
      prisma.bid.findFirst({
        where: { itemId, status: "ACTIVE" },
        orderBy: { amount: "desc" },
        select: { clerkUserId: true },
      }),
    ]);

    return NextResponse.json({
      userProxy: userProxy?.isActive ? { maxAmount: Number(userProxy.maxAmount) } : null,
      hasActiveProxy: activeProxyCount > 0,
      isWinning: !!userId && topBid?.clerkUserId === userId,
    });
  } catch (error) {
    console.error("GET proxy-bids error:", error);
    return NextResponse.json({ error: "Failed to fetch proxy" }, { status: 500 });
  }
}

/**
 * DELETE /api/proxy-bids/[itemId]
 *
 * Cancels the authenticated user's proxy bid for this item.
 * The auto-bid already placed on their behalf remains — only the proxy ceiling is removed.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { itemId } = await params;

    const proxy = await prisma.proxyBid.findUnique({
      where: { itemId_clerkUserId: { itemId, clerkUserId: userId } },
    });

    if (!proxy) {
      return NextResponse.json({ error: "No proxy found" }, { status: 404 });
    }

    await prisma.proxyBid.update({
      where: { id: proxy.id },
      data: { isActive: false },
    });

    // Check if any OTHER proxy is still active (for badge update)
    const remainingProxies = await prisma.proxyBid.count({
      where: { itemId, isActive: true, clerkUserId: { not: userId } },
    });

    // Broadcast updated badge state to all viewers
    await broadcastProxyUpdate(itemId, remainingProxies > 0);

    // Return the remaining state so the canceller's UI clears immediately + accurately.
    return NextResponse.json({ success: true, hasActiveProxy: remainingProxies > 0 });
  } catch (error) {
    console.error("DELETE proxy-bids error:", error);
    return NextResponse.json({ error: "Failed to cancel proxy" }, { status: 500 });
  }
}
