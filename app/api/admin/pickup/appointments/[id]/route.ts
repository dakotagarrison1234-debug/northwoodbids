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

    const { startsAt, locationId, status, notes } = await request.json();

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

    const updated = await prisma.pickupAppointment.update({
      where: { id },
      data: {
        ...(startsAt !== undefined && { startsAt: new Date(startsAt) }),
        ...(locationId !== undefined && { locationId }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes: notes ? String(notes) : null }),
      },
    });

    // When marked COLLECTED, mark all attached items as picked up.
    if (status === "COLLECTED") {
      await prisma.item.updateMany({
        where: { pickupAppointmentId: id },
        data: { status: "PICKED_UP", pickedUpAt: new Date() },
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
