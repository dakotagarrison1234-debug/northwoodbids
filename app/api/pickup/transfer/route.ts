export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getUnscheduledPickupItemIds } from "@/lib/pickup";
import { notifyTransferRequested } from "@/lib/transferNotify";

// POST /api/pickup/transfer — bidder requests their unscheduled items be moved to
// a chosen pickup location so they can schedule a pickup there.
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const org = await prisma.organization.findFirst();
    if (!org) return NextResponse.json({ error: "No organization" }, { status: 404 });

    const { toLocationId } = await request.json();
    if (!toLocationId) {
      return NextResponse.json({ error: "toLocationId is required" }, { status: 400 });
    }

    // Verify the target location belongs to the org and is active
    const toLocation = await prisma.pickupLocation.findUnique({ where: { id: toLocationId } });
    if (!toLocation || toLocation.organizationId !== org.id || !toLocation.isActive) {
      return NextResponse.json({ error: "Invalid location" }, { status: 400 });
    }

    // Candidate items: unscheduled pickup items that live at a DIFFERENT location
    // than the target, and aren't already attached to a transfer.
    const itemIds = await getUnscheduledPickupItemIds(userId, org.id);
    const items = itemIds.length
      ? await prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, locationId: true, transferRequestId: true },
        })
      : [];
    const itemsToMove = items.filter(
      (it) =>
        it.locationId != null &&
        it.locationId !== toLocationId &&
        it.transferRequestId == null
    );

    if (itemsToMove.length === 0) {
      // Nothing needs to move — client can just schedule.
      return NextResponse.json({ needed: false });
    }

    // If there's already an active transfer to the SAME destination, append to it;
    // otherwise create a fresh REQUESTED transfer.
    const existing = await prisma.transferRequest.findFirst({
      where: {
        clerkUserId: userId,
        organizationId: org.id,
        toLocationId,
        status: { in: ["REQUESTED", "LOADED"] },
      },
      orderBy: { createdAt: "asc" },
    });

    let transferId: string;
    if (existing) {
      await prisma.item.updateMany({
        where: { id: { in: itemsToMove.map((it) => it.id) } },
        data: { transferRequestId: existing.id },
      });
      transferId = existing.id;
    } else {
      const transfer = await prisma.transferRequest.create({
        data: {
          organizationId: org.id,
          clerkUserId: userId,
          toLocationId,
          status: "REQUESTED",
          items: {
            connect: itemsToMove.map((it) => ({ id: it.id })),
          },
        },
      });
      transferId = transfer.id;
    }

    // TEAM alert — fire-and-forget (errors handled inside).
    notifyTransferRequested(transferId).catch((err) =>
      console.error("notifyTransferRequested failed:", err)
    );

    return NextResponse.json({ needed: true, success: true, transferId });
  } catch (err) {
    console.error("[pickup/transfer POST]:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
