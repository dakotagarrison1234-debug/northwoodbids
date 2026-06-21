export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  getAvailableSlots,
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

    // Soonest upcoming SCHEDULED appointment for this user
    const appt = await prisma.pickupAppointment.findFirst({
      where: {
        clerkUserId: userId,
        organizationId: org.id,
        status: "SCHEDULED",
        startsAt: { gte: new Date() },
      },
      orderBy: { startsAt: "asc" },
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

    const appointment = appt
      ? {
          id: appt.id,
          startsAt: appt.startsAt.toISOString(),
          location: {
            id: appt.location.id,
            name: appt.location.name,
            address: appt.location.address,
            instructions: appt.location.instructions,
          },
          items: appt.items.map<ItemCard>((it) => ({
            id: it.id,
            title: it.title,
            photo: it.photos[0]?.url ?? null,
            auctionTitle: it.auction?.title ?? null,
          })),
        }
      : null;

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

    return NextResponse.json({ appointment, unscheduledItems, locations, pendingTransfers });
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

    const appointment = await prisma.pickupAppointment.create({
      data: {
        organizationId: org.id,
        clerkUserId: userId,
        locationId,
        startsAt: new Date(wantedIso),
        status: "SCHEDULED",
      },
    });

    // Attach only the ready items at this location to the new appointment.
    await prisma.item.updateMany({
      where: { id: { in: readyIds } },
      data: { pickupAppointmentId: appointment.id },
    });

    return NextResponse.json({ success: true, appointmentId: appointment.id });
  } catch (err) {
    console.error("[pickup POST]:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
