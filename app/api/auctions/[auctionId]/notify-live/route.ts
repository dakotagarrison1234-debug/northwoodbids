import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { notifyAuctionStartedToFollowers } from "@/lib/closeAuction";

// POST /api/auctions/[auctionId]/notify-live
// Manually blasts the "auction is live" text to followers. Opening an auction is
// always silent — this is the deliberate announcement, sent when the owner is ready.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { auctionId } = await params;
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      include: { organization: true },
    });
    if (!auction) return NextResponse.json({ error: "Auction not found" }, { status: 404 });

    if (!(await requireRole(auction.organizationId, ["OWNER", "ADMIN"]))) {
      return NextResponse.json({ error: "You don't have permission for this action" }, { status: 403 });
    }

    if (auction.status !== "OPEN" && auction.status !== "CLOSING") {
      return NextResponse.json(
        { error: "Open the auction first — the live announcement only goes out for a live auction." },
        { status: 422 }
      );
    }

    const sent = await notifyAuctionStartedToFollowers(
      { title: auction.title, slug: auction.slug },
      { id: auction.organization.id, name: auction.organization.name, slug: auction.organization.slug }
    );

    if (sent === 0) {
      return NextResponse.json(
        { error: "No bidders to text — nobody has a phone or email on file yet." },
        { status: 422 }
      );
    }

    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error("notify-live error:", error);
    return NextResponse.json({ error: "Could not send the announcement. Please try again." }, { status: 500 });
  }
}
