export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getAvailableSlots } from "@/lib/pickup";

interface Props {
  params: Promise<{ id: string }>;
}

// PATCH /api/pickup/[id] — reschedule / relocate own appointment
export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const appt = await prisma.pickupAppointment.findUnique({ where: { id } });
    if (!appt || appt.clerkUserId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (appt.status !== "SCHEDULED") {
      return NextResponse.json({ error: "This appointment can no longer be changed." }, { status: 422 });
    }

    const body = await request.json();
    const newLocationId = body.locationId ?? appt.locationId;
    const newStartsAt = body.startsAt ?? appt.startsAt.toISOString();

    // Verify the (possibly new) location belongs to the same org and is active
    const location = await prisma.pickupLocation.findUnique({ where: { id: newLocationId } });
    if (!location || location.organizationId !== appt.organizationId || !location.isActive) {
      return NextResponse.json({ error: "Invalid location" }, { status: 400 });
    }

    // Validate the new slot is available (unless unchanged)
    const wantedIso = new Date(newStartsAt).toISOString();
    const changed = newLocationId !== appt.locationId || wantedIso !== appt.startsAt.toISOString();
    if (changed) {
      const slots = await getAvailableSlots(newLocationId);
      if (!slots.find((s) => s.startsAt === wantedIso)) {
        return NextResponse.json({ error: "That time is no longer available. Please pick another." }, { status: 409 });
      }
    }

    const updated = await prisma.pickupAppointment.update({
      where: { id },
      data: { locationId: newLocationId, startsAt: new Date(wantedIso) },
    });

    return NextResponse.json({ success: true, appointment: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[pickup/[id] PATCH]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/pickup/[id] — cancel own appointment, detach items
export async function DELETE(_request: NextRequest, { params }: Props) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const appt = await prisma.pickupAppointment.findUnique({ where: { id } });
    if (!appt || appt.clerkUserId !== userId) {
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
    console.error("[pickup/[id] DELETE]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
