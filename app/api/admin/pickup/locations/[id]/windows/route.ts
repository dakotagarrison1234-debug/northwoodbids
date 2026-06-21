export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

interface Props {
  params: Promise<{ id: string }>;
}

// POST /api/admin/pickup/locations/[id]/windows — add a weekly window to a location
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const location = await prisma.pickupLocation.findUnique({ where: { id } });
    if (!location || location.organizationId !== membership.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { weekday, startMinutes, endMinutes, slotMinutes, capacityPerSlot } = await request.json();

    const wd = Number(weekday);
    const start = Number(startMinutes);
    const end = Number(endMinutes);
    const slot = Number(slotMinutes);
    const cap = Number(capacityPerSlot);

    if (
      !Number.isInteger(wd) || wd < 0 || wd > 6 ||
      !Number.isFinite(start) || !Number.isFinite(end) ||
      start < 0 || end > 1440 || start >= end ||
      !Number.isFinite(slot) || slot <= 0 ||
      !Number.isFinite(cap) || cap < 1
    ) {
      return NextResponse.json({ error: "Invalid window values" }, { status: 400 });
    }

    const window = await prisma.pickupWindow.create({
      data: {
        locationId: id,
        weekday: wd,
        startMinutes: start,
        endMinutes: end,
        slotMinutes: slot,
        capacityPerSlot: cap,
      },
    });

    return NextResponse.json({ success: true, window });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/pickup/locations/[id]/windows POST]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
