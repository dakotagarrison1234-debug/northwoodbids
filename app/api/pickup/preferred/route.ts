export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { autoTransferToPreferred, switchPreferredCascade } from "@/lib/pickup";

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
      await switchPreferredCascade(userId, org.id, previous!, locationId);
    }

    // Move everything that isn't at the preferred location there.
    const result = await autoTransferToPreferred(userId, org.id);

    return NextResponse.json({ success: true, switching, transferred: result.added });
  } catch (err) {
    console.error("[pickup/preferred POST]:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

/**
 * GET /api/pickup/preferred — the active pickup locations to choose from, plus the
 * signed-in bidder's current preference (if any). Used by the sign-up location step.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    const org = await prisma.organization.findFirst();
    if (!org) return NextResponse.json({ locations: [], preferredLocationId: null });

    const locations = await prisma.pickupLocation.findMany({
      where: { organizationId: org.id, isActive: true },
      select: { id: true, name: true, address: true },
      orderBy: { name: "asc" },
    });

    let preferredLocationId: string | null = null;
    if (userId) {
      const p = await prisma.bidderProfile.findUnique({
        where: { clerkUserId: userId },
        select: { preferredPickupLocationId: true },
      });
      preferredLocationId = p?.preferredPickupLocationId ?? null;
    }
    return NextResponse.json({ locations, preferredLocationId });
  } catch (err) {
    console.error("[pickup/preferred GET]:", err);
    return NextResponse.json({ locations: [], preferredLocationId: null });
  }
}
