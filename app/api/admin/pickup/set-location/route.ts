export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";
import { autoTransferToPreferred, switchPreferredCascade } from "@/lib/pickup";

/**
 * POST /api/admin/pickup/set-location
 * Body: { clerkUserId: string, locationId: string }
 *
 * Admin override of a customer's pickup location. Does exactly what the customer's
 * own /api/pickup/preferred does, but for a target bidder: persist the preference,
 * re-point still-gathering transfers, clear any upcoming appointment (it was for the
 * old location), then auto-transfer everything they've won to the new location.
 *
 * Owner/admin/staff — any org member. The whole point is the owner isn't limited.
 */
export async function POST(request: NextRequest) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const orgId = membership.organization.id;

    const { clerkUserId, locationId } = await request.json();
    if (!clerkUserId || !locationId) {
      return NextResponse.json({ error: "clerkUserId and locationId are required" }, { status: 400 });
    }

    const location = await prisma.pickupLocation.findUnique({ where: { id: locationId } });
    if (!location || location.organizationId !== orgId || !location.isActive) {
      return NextResponse.json({ error: "Invalid location" }, { status: 400 });
    }

    const profile = await prisma.bidderProfile.findUnique({
      where: { clerkUserId },
      select: { preferredPickupLocationId: true },
    });
    const previous = profile?.preferredPickupLocationId ?? null;
    const switching = previous !== null && previous !== locationId;

    await prisma.bidderProfile.upsert({
      where: { clerkUserId },
      update: { preferredPickupLocationId: locationId },
      create: { clerkUserId, preferredPickupLocationId: locationId },
    });

    if (switching) {
      await switchPreferredCascade(clerkUserId, orgId, previous!, locationId);
    }

    const result = await autoTransferToPreferred(clerkUserId, orgId);

    return NextResponse.json({ success: true, switching, transferred: result.added, locationName: location.name });
  } catch (err) {
    console.error("[admin/pickup/set-location POST]:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
