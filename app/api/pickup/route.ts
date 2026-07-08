export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  getAvailableSlots,
  getSlotCapacity,
  getUnscheduledPickupItemIds,
} from "@/lib/pickup";

type ItemCard = {
  id: string;
  title: string;
  photo: string | null;
  auctionTitle: string | null;
  locationId?: string | null;
  locationName?: string | null;
};

// GET /api/pickup — bidder's pickup view: upcoming appointment, unscheduled items, locations + slots
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const org = await prisma.organization.findFirst();
    if (!org) return NextResponse.json({ error: "No organization" }, { status: 404 });

    // The bidder's chosen preferred pickup location (drives ready-vs-transfer).
    const profile = await prisma.bidderProfile.findUnique({
      where: { clerkUserId: userId },
      select: { preferredPickupLocationId: true },
    });
    const preferredLocationId = profile?.preferredPickupLocationId ?? null;

    // The bidder's active SCHEDULED appointment. Show the soonest UPCOMING one;
    // if they only have past-dated SCHEDULED appointments (e.g. they missed the
    // time and it was never marked collected), still surface the most recent so
    // they can always find/reschedule it — never leave the page blank while the
    // admin still sees the appointment.
    const scheduledAppts = await prisma.pickupAppointment.findMany({
      where: {
        clerkUserId: userId,
        organizationId: org.id,
        status: "SCHEDULED",
      },
      orderBy: { startsAt: "asc" },
      take: 20,
      include: {
        location: true,
        items: {
          include: {
            photos: { where: { isPrimary: true }, take: 1 },
            auction: { select: { title: true } },
          },
        },
      },
    });
    const nowTs = new Date();
    const mapAppt = (a: (typeof scheduledAppts)[number]) => ({
      id: a.id,
      startsAt: a.startsAt.toISOString(),
      location: {
        id: a.location.id,
        name: a.location.name,
        address: a.location.address,
        instructions: a.location.instructions,
      },
      items: a.items.map<ItemCard>((it) => ({
        id: it.id,
        title: it.title,
        photo: it.photos[0]?.url ?? null,
        auctionTitle: it.auction?.title ?? null,
      })),
    });

    // The "main" appointment is the one at the preferred location (soonest upcoming,
    // else most recent). Everything else — non-transferable items scheduled at their
    // own warehouse — comes back as otherAppointments.
    const preferredAppts = preferredLocationId
      ? scheduledAppts.filter((a) => a.locationId === preferredLocationId)
      : scheduledAppts;
    const mainRaw =
      preferredAppts.find((a) => a.startsAt >= nowTs) ??
      preferredAppts[preferredAppts.length - 1] ??
      null;
    const appointment = mainRaw ? mapAppt(mainRaw) : null;
    const otherAppointments = scheduledAppts
      .filter((a) => a.id !== mainRaw?.id)
      .map(mapAppt);

    // Unscheduled pickup items (PENDING_PICKUP, no appointment)
    const unscheduledIds = await getUnscheduledPickupItemIds(userId, org.id);
    const unscheduledRows = unscheduledIds.length
      ? await prisma.item.findMany({
          where: { id: { in: unscheduledIds } },
          include: {
            photos: { where: { isPrimary: true }, take: 1 },
            auction: { select: { title: true } },
            location: { select: { name: true } },
          },
        })
      : [];
    const unscheduledItems = unscheduledRows.map<ItemCard>((it) => ({
      id: it.id,
      title: it.title,
      photo: it.photos[0]?.url ?? null,
      auctionTitle: it.auction?.title ?? null,
      locationId: it.locationId ?? null,
      locationName: it.location?.name ?? null,
    }));

    // Active (REQUESTED or LOADED) transfers for this user
    const transferRows = await prisma.transferRequest.findMany({
      where: {
        clerkUserId: userId,
        organizationId: org.id,
        status: { in: ["REQUESTED", "LOADED"] },
      },
      orderBy: { createdAt: "asc" },
      include: {
        toLocation: { select: { id: true, name: true } },
        items: {
          select: { id: true, title: true, location: { select: { name: true } } },
        },
      },
    });
    const pendingTransfers = transferRows.map((t) => ({
      id: t.id,
      status: t.status,
      toLocationId: t.toLocationId,
      toLocationName: t.toLocation.name,
      createdAt: t.createdAt.toISOString(),
      items: t.items.map((it) => ({
        id: it.id,
        title: it.title,
        fromLocationName: it.location?.name ?? "Unassigned",
      })),
    }));

    // Active locations with their available slots
    const activeLocations = await prisma.pickupLocation.findMany({
      where: { organizationId: org.id, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    const locations = await Promise.all(
      activeLocations.map(async (loc) => ({
        id: loc.id,
        name: loc.name,
        address: loc.address,
        instructions: loc.instructions,
        slots: await getAvailableSlots(loc.id),
      }))
    );

    return NextResponse.json({ appointment, otherAppointments, unscheduledItems, locations, pendingTransfers, preferredLocationId });
  } catch (err) {
    console.error("[pickup GET]:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

// POST /api/pickup — book an appointment at a slot, attach all unscheduled pickup items
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const org = await prisma.organization.findFirst();
    if (!org) return NextResponse.json({ error: "No organization" }, { status: 404 });

    const { locationId, startsAt } = await request.json();
    if (!locationId || !startsAt) {
      return NextResponse.json({ error: "locationId and startsAt are required" }, { status: 400 });
    }

    // Verify location belongs to the org and is active
    const location = await prisma.pickupLocation.findUnique({ where: { id: locationId } });
    if (!location || location.organizationId !== org.id || !location.isActive) {
      return NextResponse.json({ error: "Invalid location" }, { status: 400 });
    }

    // "Ready" items = unscheduled PENDING_PICKUP items already at the chosen
    // location (or with no home location). Items at OTHER locations get moved via
    // a transfer and do NOT block booking these ready items.
    const unscheduledIds = await getUnscheduledPickupItemIds(userId, org.id);
    const readyRows = unscheduledIds.length
      ? await prisma.item.findMany({
          where: {
            id: { in: unscheduledIds },
            OR: [{ locationId }, { locationId: null }],
          },
          select: { id: true },
        })
      : [];
    const readyIds = readyRows.map((r) => r.id);

    if (readyIds.length === 0) {
      return NextResponse.json(
        {
          error:
            "You don't have any items ready at this location yet. Request a transfer first, or pick the location your items are at.",
        },
        { status: 422 }
      );
    }

    // Validate the chosen slot is actually available
    const slots = await getAvailableSlots(locationId);
    const wantedIso = new Date(startsAt).toISOString();
    const match = slots.find((s) => s.startsAt === wantedIso);
    if (!match) {
      return NextResponse.json({ error: "That time is no longer available. Please pick another." }, { status: 409 });
    }

    const capacity = await getSlotCapacity(locationId, wantedIso);

    // Atomic capacity guard: serialize bookings for THIS slot and re-count inside
    // the lock so two bidders can't both grab the last seat.
    let appointmentId: string;
    try {
      appointmentId = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`slot:${locationId}:${wantedIso}`}))`;
        const used = await tx.pickupAppointment.count({
          where: { locationId, status: "SCHEDULED", startsAt: new Date(wantedIso) },
        });
        if (used >= capacity) throw new Error("SLOT_FULL");
        const appt = await tx.pickupAppointment.create({
          data: { organizationId: org.id, clerkUserId: userId, locationId, startsAt: new Date(wantedIso), status: "SCHEDULED" },
        });
        // Attach only the ready items at this location to the new appointment.
        await tx.item.updateMany({ where: { id: { in: readyIds } }, data: { pickupAppointmentId: appt.id } });
        return appt.id;
      });
    } catch (e) {
      if (e instanceof Error && e.message === "SLOT_FULL") {
        return NextResponse.json({ error: "That time just filled up. Please pick another." }, { status: 409 });
      }
      throw e;
    }

    return NextResponse.json({ success: true, appointmentId });
  } catch (err) {
    console.error("[pickup POST]:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
