export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { autoTransferToPreferred } from "@/lib/pickup";

/**
 * POST /api/pickup/preferred
 * Body: { locationId: string }
 *
 * Sets (or switches) the bidder's preferred pickup location. Everything they've
 * won that isn't already at that location is auto-transferred there. Switching
 * from a previous location: re-points still-gathering transfers to the new place
 * and clears any upcoming appointment (which was for the old location) so they
 * re-pick a time.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const org = await prisma.organization.findFirst();
    if (!org) return NextResponse.json({ error: "No organization" }, { status: 404 });

    const { locationId } = await request.json();
    if (!locationId) return NextResponse.json({ error: "locationId is required" }, { status: 400 });

    const location = await prisma.pickupLocation.findUnique({ where: { id: locationId } });
    if (!location || location.organizationId !== org.id || !location.isActive) {
      return NextResponse.json({ error: "Invalid location" }, { status: 400 });
    }

    const profile = await prisma.bidderProfile.findUnique({
      where: { clerkUserId: userId },
      select: { preferredPickupLocationId: true },
    });
    const previous = profile?.preferredPickupLocationId ?? null;
    const switching = previous !== null && previous !== locationId;

    // Persist the preference (profile exists once they've bid; be safe with upsert).
    await prisma.bidderProfile.upsert({
      where: { clerkUserId: userId },
      update: { preferredPickupLocationId: locationId },
      create: { clerkUserId: userId, preferredPickupLocationId: locationId },
    });

    if (switching) {
      // Re-point still-gathering transfers to the new location (LOADED ones are
      // already in transit — leave them).
      await prisma.transferRequest.updateMany({
        where: { clerkUserId: userId, organizationId: org.id, status: "REQUESTED" },
        data: { toLocationId: locationId },
      });
      // Clear any upcoming appointment (it was for the old location) and free its
      // items so they re-flow into ready/transfer for the new location.
      const appts = await prisma.pickupAppointment.findMany({
        where: { clerkUserId: userId, organizationId: org.id, status: "SCHEDULED" },
        select: { id: true },
      });
      if (appts.length > 0) {
        const apptIds = appts.map((a) => a.id);
        await prisma.item.updateMany({
          where: { pickupAppointmentId: { in: apptIds } },
          data: { pickupAppointmentId: null },
        });
        await prisma.pickupAppointment.updateMany({
          where: { id: { in: apptIds } },
          data: { status: "CANCELLED" },
        });
      }
    }

    // Move everything that isn't at the preferred location there.
    const result = await autoTransferToPreferred(userId, org.id);

    return NextResponse.json({ success: true, switching, transferred: result.added });
  } catch (err) {
    console.error("[pickup/preferred POST]:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
