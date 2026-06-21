export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getUnscheduledPickupItemIds } from "@/lib/pickup";

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

    // Don't create a duplicate — return the existing pending transfer if any.
    const existing = await prisma.transferRequest.findFirst({
      where: { clerkUserId: userId, organizationId: org.id, status: "REQUESTED" },
    });
    if (existing) {
      return NextResponse.json({ needed: true, success: true, transferId: existing.id });
    }

    const itemIds = await getUnscheduledPickupItemIds(userId, org.id);
    const items = itemIds.length
      ? await prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, locationId: true },
        })
      : [];
    const itemsToMove = items.filter(
      (it) => it.locationId != null && it.locationId !== toLocationId
    );

    if (itemsToMove.length === 0) {
      // Nothing needs to move — client can just schedule.
      return NextResponse.json({ needed: false });
    }

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

    return NextResponse.json({ needed: true, success: true, transferId: transfer.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[pickup/transfer POST]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
