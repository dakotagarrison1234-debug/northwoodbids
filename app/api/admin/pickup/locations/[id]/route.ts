export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

interface Props {
  params: Promise<{ id: string }>;
}

// PATCH /api/admin/pickup/locations/[id] — update a location
export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const location = await prisma.pickupLocation.findUnique({ where: { id } });
    if (!location || location.organizationId !== membership.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { name, address, instructions, isActive } = await request.json();
    const updated = await prisma.pickupLocation.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(address !== undefined && { address: address ? String(address).trim() : null }),
        ...(instructions !== undefined && { instructions: instructions ? String(instructions).trim() : null }),
        ...(isActive !== undefined && { isActive: !!isActive }),
      },
      include: { windows: { orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }] } },
    });

    return NextResponse.json({ success: true, location: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/pickup/locations/[id] PATCH]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/admin/pickup/locations/[id] — remove a location
export async function DELETE(_request: NextRequest, { params }: Props) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const location = await prisma.pickupLocation.findUnique({ where: { id } });
    if (!location || location.organizationId !== membership.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Deleting cascades appointments AND transfers headed here, which would
    // silently strand bidders' scheduled/in-transit items. Block it while any are
    // active — the admin can "Hide" the location instead (isActive: false).
    const [activeAppts, activeTransfers] = await Promise.all([
      prisma.pickupAppointment.count({ where: { locationId: id, status: "SCHEDULED" } }),
      prisma.transferRequest.count({ where: { toLocationId: id, status: { in: ["REQUESTED", "LOADED"] } } }),
    ]);
    if (activeAppts > 0 || activeTransfers > 0) {
      return NextResponse.json(
        {
          error: `This location still has ${activeAppts} scheduled pickup(s) and ${activeTransfers} incoming transfer(s). Hide it instead, or clear those first.`,
        },
        { status: 409 }
      );
    }

    await prisma.pickupLocation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/pickup/locations/[id] DELETE]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
