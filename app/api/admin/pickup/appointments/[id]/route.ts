export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

interface Props {
  params: Promise<{ id: string }>;
}

// PATCH /api/admin/pickup/appointments/[id] — reschedule / relocate / set status / notes
export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const appt = await prisma.pickupAppointment.findUnique({ where: { id } });
    if (!appt || appt.organizationId !== membership.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { startsAt, locationId, status, notes, stagedSpot } = await request.json();

    // If relocating, verify the new location belongs to this org
    if (locationId !== undefined) {
      const loc = await prisma.pickupLocation.findUnique({ where: { id: locationId } });
      if (!loc || loc.organizationId !== membership.organizationId) {
        return NextResponse.json({ error: "Invalid location" }, { status: 400 });
      }
    }

    if (status !== undefined && !["SCHEDULED", "COLLECTED", "CANCELLED"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Guard terminal states — don't re-collect an already-collected/cancelled appt
    // (would re-stamp pickedUpAt and re-fire item transitions).
    if (status !== undefined && status !== appt.status && appt.status !== "SCHEDULED") {
      return NextResponse.json(
        { error: `This appointment is already ${appt.status.toLowerCase()}.` },
        { status: 409 }
      );
    }

    // Staging the order: one spot for the whole order ("Box 4"). Sending an empty
    // string un-stages it. Collecting always clears it, so the spot frees up for
    // the next pickup without anyone having to remember to reset it.
    let stagedPatch: { stagedSpot?: string | null; stagedAt?: Date | null } = {};
    if (stagedSpot !== undefined) {
      const spot = String(stagedSpot ?? "").trim();
      stagedPatch = spot ? { stagedSpot: spot, stagedAt: new Date() } : { stagedSpot: null, stagedAt: null };
    }
    if (status === "COLLECTED" || status === "CANCELLED") {
      stagedPatch = { stagedSpot: null, stagedAt: null };
    }

    const updated = await prisma.pickupAppointment.update({
      where: { id },
      data: {
        ...(startsAt !== undefined && { startsAt: new Date(startsAt) }),
        ...(locationId !== undefined && { locationId }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes: notes ? String(notes) : null }),
        ...stagedPatch,
      },
    });

    // Relocating to a different location: detach items physically at the old place
    // so they aren't wrongly listed (and later marked picked up) at the new one.
    if (locationId !== undefined && locationId !== appt.locationId) {
      await prisma.item.updateMany({
        where: { pickupAppointmentId: id, NOT: { locationId } },
        data: { pickupAppointmentId: null },
      });
    }

    // When marked COLLECTED, mark all attached items as picked up.
    if (status === "COLLECTED") {
      await prisma.item.updateMany({
        where: { pickupAppointmentId: id },
        data: { status: "PICKED_UP", pickedUpAt: new Date(), grabbedAt: null },
      });
    }

    // Staging an order supersedes the gather checklist — the items are physically
    // in the box now, so the tick marks have served their purpose. Clearing them
    // means an order that gets un-staged starts its checklist clean.
    if (stagedSpot !== undefined || status === "CANCELLED") {
      await prisma.item.updateMany({
        where: { pickupAppointmentId: id },
        data: { grabbedAt: null },
      });
    }

    return NextResponse.json({ success: true, appointment: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/pickup/appointments/[id] PATCH]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/admin/pickup/appointments/[id] — cancel appointment, detach its items
export async function DELETE(_request: NextRequest, { params }: Props) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const appt = await prisma.pickupAppointment.findUnique({ where: { id } });
    if (!appt || appt.organizationId !== membership.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.item.updateMany({
      where: { pickupAppointmentId: id },
      data: { pickupAppointmentId: null },
    });
    await prisma.pickupAppointment.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/pickup/appointments/[id] DELETE]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
