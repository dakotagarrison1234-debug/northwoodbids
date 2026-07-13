import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { triggerAuctionUpdated } from "@/lib/pusherServer";

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
    const { status, endAt, startAt, title, description } = await request.json();

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

    // ── Edit auction fields (name / start / end) ───────────────────────────────
    // One save handles the auction's name, start time (DRAFT only), and end time.
    // Changing the end time snaps every item back to the auction end (clears any
    // per-item "popcorn" extension) and re-arms the "ending soon" warning.
    const editData: Prisma.AuctionUpdateInput = {};
    let endChanged = false;

    if (title !== undefined) {
      const t = String(title).trim();
      if (!t) {
        return NextResponse.json({ error: "Auction name can't be empty." }, { status: 400 });
      }
      editData.title = t;
    }

    if (description !== undefined) {
      const d = String(description ?? "").trim();
      editData.description = d || null;
    }

    if (startAt !== undefined) {
      const newStart = new Date(startAt);
      if (isNaN(newStart.getTime())) {
        return NextResponse.json({ error: "Invalid start time" }, { status: 400 });
      }
      if (auction.status !== "DRAFT") {
        return NextResponse.json(
          { error: "The start time can only be changed before the auction opens." },
          { status: 422 }
        );
      }
      editData.startAt = newStart;
    }

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
      editData.endAt = newEnd;
      editData.endingSoonNotifiedAt = null;
      endChanged = true;
    }

    if (Object.keys(editData).length > 0) {
      // End must be after start (whichever of the two we end up with).
      const finalStart = (editData.startAt as Date | undefined) ?? auction.startAt;
      const finalEnd = (editData.endAt as Date | undefined) ?? auction.endAt;
      if (finalEnd <= finalStart) {
        return NextResponse.json(
          { error: "The end time must be after the start time." },
          { status: 422 }
        );
      }

      await prisma.$transaction([
        prisma.auction.update({ where: { id: auctionId }, data: editData }),
        // Snap all items to the auction's end (null = "ends with the auction").
        ...(endChanged ? [prisma.item.updateMany({ where: { auctionId }, data: { itemEndAt: null } })] : []),
      ]);

      triggerAuctionUpdated(auction.organization.slug).catch(() => {});

      // If no status change was requested, we're done.
      if (status === undefined) {
        return NextResponse.json({ success: true });
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

    // Opening is special-cased with an ATOMIC claim so two admins (or an admin +
    // the cron) can't both open it. Opening is ALWAYS SILENT — no "auction is live"
    // blast. The owner sends that deliberately via /notify-live when they're ready.
    if (status === "OPEN") {
      const claimed = await prisma.auction.updateMany({
        where: { id: auctionId, status: "DRAFT" },
        data: { status: "OPEN" },
      });
      if (claimed.count === 0) {
        return NextResponse.json({ error: "This auction has already been opened." }, { status: 409 });
      }
      await prisma.item.updateMany({
        where: { auctionId, status: "DRAFT" },
        data: { status: "ACTIVE" },
      });
      triggerAuctionUpdated(auction.organization.slug).catch(() => {});
      return NextResponse.json({ success: true });
    }

    const updated = await prisma.auction.update({
      where: { id: auctionId },
      data: { status },
    });

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
