export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

/**
 * POST /api/admin/pickup/gather-spot
 * Body: { spot: string, itemIds: string[] }
 *
 * Sets the INTERNAL gather spot on a bundle of items (where the team set them
 * aside — "Closet", "Bay 3", …). Blank spot clears it. This is not customer-facing;
 * staging (the customer-facing spot) lives on the appointment.
 */
export async function POST(request: NextRequest) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { spot, itemIds } = await request.json();
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json({ error: "itemIds required" }, { status: 400 });
    }
    const trimmed = String(spot ?? "").trim();

    await prisma.item.updateMany({
      where: { id: { in: itemIds }, organizationId: membership.organizationId },
      // Giving it a gather spot = it's been placed, so it's no longer "needs placing".
      data: { gatherSpot: trimmed || null, ...(trimmed ? { needsPlacement: false } : {}) },
    });

    return NextResponse.json({ success: true, spot: trimmed || null });
  } catch (err) {
    console.error("[admin/pickup/gather-spot POST]:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
