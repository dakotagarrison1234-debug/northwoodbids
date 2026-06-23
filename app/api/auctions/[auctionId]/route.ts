import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { triggerAuctionUpdated } from "@/lib/pusherServer";
import { notifyAuctionStartedToFollowers } from "@/lib/closeAuction";

interface Props {
  params: Promise<{ auctionId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { auctionId } = await params;
    const { status, endAt } = await request.json();

    // Verify the user belongs to the org that owns this auction
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      include: { organization: true },
    });
    if (!auction) {
      return NextResponse.json({ error: "Auction not found" }, { status: 404 });
    }

    if (!(await requireRole(auction.organizationId, ["OWNER", "ADMIN"]))) {
      return NextResponse.json(
        { error: "You don't have permission for this action" },
        { status: 403 }
      );
    }

    // ── Edit end time ─────────────────────────────────────────────────────────
    // Reschedules when the auction closes. Snaps every item back to the auction
    // end (clears any per-item "popcorn" extension) and re-arms the "ending soon"
    // warning so it can fire again for the new end time. Allowed any time before
    // the auction has closed.
    if (endAt !== undefined) {
      const newEnd = new Date(endAt);
      if (isNaN(newEnd.getTime())) {
        return NextResponse.json({ error: "Invalid end time" }, { status: 400 });
      }
      if (auction.status === "CLOSED" || auction.status === "SETTLED") {
        return NextResponse.json(
          { error: "This auction has already closed — its end time can't be changed." },
          { status: 422 }
        );
      }

      await prisma.$transaction([
        prisma.auction.update({
          where: { id: auctionId },
          data: { endAt: newEnd, endingSoonNotifiedAt: null },
        }),
        // Snap all items to the auction's end (null = "ends with the auction").
        prisma.item.updateMany({ where: { auctionId }, data: { itemEndAt: null } }),
      ]);

      triggerAuctionUpdated(auction.organization.slug).catch(() => {});

      // If only the end time was sent, we're done.
      if (status === undefined) {
        return NextResponse.json({ success: true, endAt: newEnd.toISOString() });
      }
    }

    // ── Status change ─────────────────────────────────────────────────────────
    const validStatuses = ["DRAFT", "OPEN", "CLOSING", "CLOSED", "SETTLED"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // State machine guard — prevent illegal auction status transitions
    const auctionTransitions: Record<string, string[]> = {
      DRAFT:   ["OPEN"],
      OPEN:    ["CLOSING", "CLOSED"],
      CLOSING: ["CLOSED", "OPEN"],
      CLOSED:  ["SETTLED"],
      SETTLED: [],
    };
    const allowedAuction = auctionTransitions[auction.status] ?? [];
    if (!allowedAuction.includes(status)) {
      return NextResponse.json(
        { error: `Cannot move auction from ${auction.status} to ${status}` },
        { status: 422 }
      );
    }

    // Stripe gate — org must have charges enabled before going live
    if (auction.status === "DRAFT" && status === "OPEN") {
      if (!auction.organization.stripeChargesEnabled) {
        return NextResponse.json(
          { error: "Connect Stripe before publishing an auction. Go to Settings → Payments." },
          { status: 422 }
        );
      }
    }

    const updated = await prisma.auction.update({
      where: { id: auctionId },
      data: { status },
    });

    // When opening an auction, activate all DRAFT items and fire the started webhook
    if (status === "OPEN") {
      await prisma.item.updateMany({
        where: { auctionId, status: "DRAFT" },
        data: { status: "ACTIVE" },
      });

      notifyAuctionStartedToFollowers(
        { title: auction.title, slug: auction.slug },
        { id: auction.organization.id, name: auction.organization.name, slug: auction.organization.slug }
      ).catch((e) => console.error("GHL auction-started webhook failed:", e));
    }

    // Notify live-watching pages that auction list has changed
    triggerAuctionUpdated(auction.organization.slug).catch(() => {});

    return NextResponse.json({ success: true, auction: updated });
  } catch (error) {
    console.error("Auction update error:", error);
    return NextResponse.json({ error: "Failed to update auction" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { auctionId } = await params;
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      select: { organizationId: true, status: true },
    });
    if (!auction) return NextResponse.json({ error: "Auction not found" }, { status: 404 });

    if (!(await requireRole(auction.organizationId, ["OWNER", "ADMIN"]))) {
      return NextResponse.json(
        { error: "You don't have permission for this action" },
        { status: 403 }
      );
    }

    // Only DRAFT auctions can be deleted — protect live/completed auctions
    if (auction.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Only draft auctions can be deleted" },
        { status: 422 }
      );
    }

    // Unlink items from this auction (don't delete items — they may be re-used)
    await prisma.item.updateMany({
      where: { auctionId },
      data: { auctionId: null, status: "DRAFT" },
    });

    await prisma.auction.delete({ where: { id: auctionId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Auction delete error:", error);
    return NextResponse.json({ error: "Failed to delete auction" }, { status: 500 });
  }
}
