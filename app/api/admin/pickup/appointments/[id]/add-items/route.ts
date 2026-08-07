export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/admin/pickup/appointments/[id]/add-items
 * Body: { itemIds: string[] }
 *
 * Manually attach loose items (paid, unbooked, physically at this appointment's
 * warehouse) to an existing appointment — the "click and add" for items that
 * arrived by transfer or were won later. Only attaches items that:
 *   - belong to the appointment's customer (via their WON bid),
 *   - are PENDING_PICKUP, not already on an appointment or an active transfer,
 *   - are physically at the appointment's warehouse.
 * If the appointment was already staged, adding to it un-stages it (the box grew,
 * so it must be re-gathered + re-staged).
 */
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const orgId = membership.organizationId;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const itemIds: string[] = Array.isArray(body?.itemIds) ? body.itemIds : [];
    if (itemIds.length === 0) return NextResponse.json({ error: "No items given" }, { status: 400 });

    const appt = await prisma.pickupAppointment.findUnique({
      where: { id },
      select: { id: true, organizationId: true, clerkUserId: true, locationId: true, status: true, stagedSpot: true },
    });
    if (!appt || appt.organizationId !== orgId) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    if (appt.status !== "SCHEDULED") return NextResponse.json({ error: "That pickup is already closed." }, { status: 409 });

    // Only the customer's OWN items (via WON bid).
    const wonBids = await prisma.bid.findMany({
      where: { itemId: { in: itemIds }, status: "WON", clerkUserId: appt.clerkUserId },
      select: { itemId: true },
    });
    const ownIds = new Set(wonBids.map((b) => b.itemId));

    // Physically here, paid, and not already committed elsewhere.
    const eligible = await prisma.item.findMany({
      where: {
        id: { in: [...ownIds] },
        organizationId: orgId,
        status: "PENDING_PICKUP",
        pickupAppointmentId: null,
        transferRequestId: null,
        OR: [{ locationId: appt.locationId }, { locationId: null }],
      },
      select: { id: true },
    });
    const eligibleIds = eligible.map((i) => i.id);
    if (eligibleIds.length === 0) {
      return NextResponse.json({ error: "None of those items can be added (wrong warehouse, already booked, or in transit)." }, { status: 422 });
    }

    await prisma.$transaction([
      prisma.item.updateMany({
        where: { id: { in: eligibleIds } },
        data: { pickupAppointmentId: appt.id },
      }),
      // Growing a staged order means the box is now incomplete — un-stage so it gets
      // re-gathered and re-staged with everything in it.
      ...(appt.stagedSpot
        ? [prisma.pickupAppointment.update({ where: { id: appt.id }, data: { stagedSpot: null, stagedAt: null } })]
        : []),
    ]);

    return NextResponse.json({ success: true, added: eligibleIds.length, unstaged: !!appt.stagedSpot });
  } catch (err) {
    console.error("[admin/pickup/appointments/[id]/add-items POST]:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
