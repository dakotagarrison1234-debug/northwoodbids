import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface Props { params: Promise<{ orgId: string }> }

export async function GET(_req: NextRequest, { params }: Props) {
  await requireSuperAdmin();
  const { orgId } = await params;

  // All proxy bids on items belonging to this org
  const proxyBids = await prisma.proxyBid.findMany({
    where: {
      item: { organizationId: orgId },
      isActive: true,
    },
    include: {
      item: {
        select: {
          id: true,
          title: true,
          currentBid: true,
          status: true,
          auction: { select: { title: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Fetch bidder profiles for all clerkUserIds
  const clerkIds = [...new Set(proxyBids.map((p) => p.clerkUserId))];
  const profiles = await prisma.bidderProfile.findMany({
    where: { clerkUserId: { in: clerkIds } },
    select: { clerkUserId: true, name: true, email: true, phone: true },
  });
  const profileMap = new Map(profiles.map((p) => [p.clerkUserId, p]));

  const result = proxyBids.map((pb) => {
    const profile = profileMap.get(pb.clerkUserId);
    return {
      id: pb.id,
      clerkUserId: pb.clerkUserId,
      bidderName: profile?.name ?? null,
      bidderEmail: profile?.email ?? null,
      bidderPhone: profile?.phone ?? null,
      maxAmount: Number(pb.maxAmount),
      isActive: pb.isActive,
      createdAt: pb.createdAt,
      updatedAt: pb.updatedAt,
      item: {
        id: pb.item.id,
        title: pb.item.title,
        currentBid: Number(pb.item.currentBid),
        status: pb.item.status,
        auctionTitle: pb.item.auction?.title ?? null,
      },
    };
  });

  return NextResponse.json({ proxyBids: result });
}
