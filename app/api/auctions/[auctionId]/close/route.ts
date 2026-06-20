export const maxDuration = 300;

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessOrg } from "@/lib/auth";
import { closeAuction } from "@/lib/closeAuction";

interface Props {
  params: Promise<{ auctionId: string }>;
}

export async function POST(_request: NextRequest, { params }: Props) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { auctionId } = await params;

    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      select: { organizationId: true },
    });

    if (!auction) return NextResponse.json({ error: "Auction not found" }, { status: 404 });

    if (!(await canAccessOrg(auction.organizationId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { winnersCount } = await closeAuction(auctionId);
    return NextResponse.json({ success: true, winnersCount });
  } catch (error) {
    console.error("Close auction error:", error);
    return NextResponse.json({ error: "Failed to close auction" }, { status: 500 });
  }
}
