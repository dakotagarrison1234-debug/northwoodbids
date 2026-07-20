export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

// GET /api/admin/pickup/appointments — all SCHEDULED + COLLECTED appts for the org
export async function GET() {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const appointments = await prisma.pickupAppointment.findMany({
      where: {
        organizationId: membership.organizationId,
        status: { in: ["SCHEDULED", "COLLECTED"] },
      },
      include: {
        location: { select: { id: true, name: true } },
        items: { select: { id: true, title: true, itemCode: true, storageLocation: true } },
      },
      orderBy: { startsAt: "asc" },
    });

    // Attach bidder profile (by clerkUserId)
    const userIds = [...new Set(appointments.map((a) => a.clerkUserId))];
    const profiles = userIds.length
      ? await prisma.bidderProfile.findMany({
          where: { clerkUserId: { in: userIds } },
          select: { clerkUserId: true, name: true, email: true, phone: true },
        })
      : [];
    const profileMap = new Map(profiles.map((p) => [p.clerkUserId, p]));

    const result = appointments.map((a) => ({
      id: a.id,
      startsAt: a.startsAt.toISOString(),
      status: a.status,
      notes: a.notes,
      stagedSpot: a.stagedSpot ?? null,
      clerkUserId: a.clerkUserId,
      location: a.location,
      locationId: a.locationId,
      items: a.items,
      bidder: profileMap.get(a.clerkUserId) ?? { name: null, email: null, phone: null },
    }));

    return NextResponse.json({ appointments: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/pickup/appointments GET]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
