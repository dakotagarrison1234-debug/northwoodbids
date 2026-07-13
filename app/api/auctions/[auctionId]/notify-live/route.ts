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

    // Once per auction, full stop. Two admins tapping the button (or a double-tap on
    // a laggy connection) must never text the whole bidder list twice.
    const claimed = await prisma.auction.updateMany({
      where: { id: auctionId, liveNotifiedAt: null },
      data: { liveNotifiedAt: new Date() },
    });
    if (claimed.count === 0) {
      return NextResponse.json(
        { error: "The live announcement has already been sent for this auction." },
        { status: 409 }
      );
    }

    const sent = await notifyAuctionStartedToFollowers(
      { title: auction.title, slug: auction.slug },
      { id: auction.organization.id, name: auction.organization.name, slug: auction.organization.slug }
    );

    if (sent === 0) {
      // Nothing actually went out — hand the button back so it can be retried.
      await prisma.auction.update({ where: { id: auctionId }, data: { liveNotifiedAt: null } });
      return NextResponse.json(
        { error: "Nothing sent — no bidders with contact details, or the SMS provider rejected it." },
        { status: 422 }
      );
    }

    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error("notify-live error:", error);
    return NextResponse.json({ error: "Could not send the announcement. Please try again." }, { status: 500 });
  }
}
