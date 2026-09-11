import { prisma } from "@/lib/prisma";

/**
 * Pickup integrity — an item can only ever be in ONE of these states:
 *   loose (waiting)  → PENDING_PICKUP, no appointment, no transfer
 *   on appointment   → pickupAppointmentId → a SCHEDULED appointment
 *   on transfer      → transferRequestId  → a REQUESTED/LOADED transfer
 *   collected        → PICKED_UP
 *
 * Anything else is a dangling link — e.g. an item still pointing at a CANCELLED
 * appointment, or at a transfer that already completed. Dangling items show up in
 * NO list (not waiting, not on a shown appointment, not on a live transfer): to a
 * human they're simply "gone". This pass finds them and puts them back where they
 * belong (loose, at whatever warehouse they're physically in) so they reappear.
 *
 * Cheap and idempotent — a few indexed queries; call it on every board load.
 */
export async function healPickupLinks(organizationId: string): Promise<{ healed: number }> {
  let healed = 0;

  // 1. Items attached to an appointment that is no longer SCHEDULED — but the item
  //    itself was never collected. (COLLECTED appts legitimately hold PICKED_UP items.)
  const staleAppt = await prisma.item.findMany({
    where: {
      organizationId,
      status: "PENDING_PICKUP",
      pickupAppointmentId: { not: null },
      pickupAppointment: { status: { not: "SCHEDULED" } },
    },
    select: { id: true },
  });
  if (staleAppt.length) {
    await prisma.item.updateMany({
      where: { id: { in: staleAppt.map((i) => i.id) } },
      data: { pickupAppointmentId: null },
    });
    healed += staleAppt.length;
  }

  // 2. Items still linked to a transfer that has already finished or was cancelled.
  const staleTransfer = await prisma.item.findMany({
    where: {
      organizationId,
      transferRequestId: { not: null },
      transferRequest: { status: { in: ["COMPLETED", "CANCELLED"] } },
    },
    select: { id: true },
  });
  if (staleTransfer.length) {
    await prisma.item.updateMany({
      where: { id: { in: staleTransfer.map((i) => i.id) } },
      data: { transferRequestId: null },
    });
    healed += staleTransfer.length;
  }

  if (healed > 0) console.warn(`[pickup integrity] re-surfaced ${healed} dangling item(s) for org ${organizationId}`);
  return { healed };
}

/** Where exactly is this item right now? One honest answer for the "Find an item" tool. */
export type ItemWhereabouts = {
  id: string;
  title: string;
  itemCode: string | null;
  status: string;
  warehouse: { id: string; name: string } | null;
  storageLocation: string | null;
  gatherSpot: string | null;
  owner: { clerkUserId: string; name: string | null; phone: string | null } | null;
  place:
    | { kind: "collected"; pickedUpAt: string | null; appointmentId: string | null }
    | { kind: "appointment"; appointmentId: string; startsAt: string; status: string; locationId: string; locationName: string; stagedSpot: string | null }
    | { kind: "transfer"; transferId: string; status: string; toLocationId: string; toLocationName: string; stagedSpot: string | null }
    | { kind: "loose" }
    | { kind: "not_won" };
};

export async function locateItems(organizationId: string, q: string): Promise<ItemWhereabouts[]> {
  const term = q.trim();
  if (!term) return [];

  // Match by tag #, title, or the owner's name/phone/email.
  const owners = await prisma.bidderProfile.findMany({
    where: {
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
        { phone: { contains: term } },
      ],
    },
    select: { clerkUserId: true },
    take: 20,
  });
  const ownerIds = owners.map((o) => o.clerkUserId);
  const ownedItemIds = ownerIds.length
    ? (await prisma.bid.findMany({
        where: { clerkUserId: { in: ownerIds }, status: "WON", item: { organizationId } },
        select: { itemId: true },
      })).map((b) => b.itemId)
    : [];

  const items = await prisma.item.findMany({
    where: {
      organizationId,
      status: { in: ["SOLD", "PENDING_PICKUP", "PICKED_UP"] },
      OR: [
        { itemCode: { equals: term, mode: "insensitive" } },
        { itemCode: { contains: term, mode: "insensitive" } },
        { title: { contains: term, mode: "insensitive" } },
        ...(ownedItemIds.length ? [{ id: { in: ownedItemIds } }] : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: {
      id: true, title: true, itemCode: true, status: true, storageLocation: true, gatherSpot: true, pickedUpAt: true,
      location: { select: { id: true, name: true } },
      pickupAppointment: { select: { id: true, startsAt: true, status: true, locationId: true, stagedSpot: true, location: { select: { name: true } } } },
      transferRequest: { select: { id: true, status: true, toLocationId: true, stagedSpot: true, toLocation: { select: { name: true } } } },
      bids: { where: { status: "WON" }, take: 1, select: { clerkUserId: true } },
    },
  });

  const winnerIds = [...new Set(items.map((i) => i.bids[0]?.clerkUserId).filter((x): x is string => !!x))];
  const profiles = winnerIds.length
    ? await prisma.bidderProfile.findMany({ where: { clerkUserId: { in: winnerIds } }, select: { clerkUserId: true, name: true, phone: true } })
    : [];
  const profById = new Map(profiles.map((p) => [p.clerkUserId, p]));

  return items.map((it) => {
    const winner = it.bids[0]?.clerkUserId ?? null;
    const prof = winner ? profById.get(winner) : null;
    let place: ItemWhereabouts["place"];
    if (it.status === "PICKED_UP") {
      place = { kind: "collected", pickedUpAt: it.pickedUpAt?.toISOString() ?? null, appointmentId: it.pickupAppointment?.id ?? null };
    } else if (it.pickupAppointment && it.pickupAppointment.status === "SCHEDULED") {
      place = {
        kind: "appointment",
        appointmentId: it.pickupAppointment.id,
        startsAt: it.pickupAppointment.startsAt.toISOString(),
        status: it.pickupAppointment.status,
        locationId: it.pickupAppointment.locationId,
        locationName: it.pickupAppointment.location.name,
        stagedSpot: it.pickupAppointment.stagedSpot,
      };
    } else if (it.transferRequest && (it.transferRequest.status === "REQUESTED" || it.transferRequest.status === "LOADED")) {
      place = {
        kind: "transfer",
        transferId: it.transferRequest.id,
        status: it.transferRequest.status,
        toLocationId: it.transferRequest.toLocationId,
        toLocationName: it.transferRequest.toLocation.name,
        stagedSpot: it.transferRequest.stagedSpot,
      };
    } else if (!winner) {
      place = { kind: "not_won" };
    } else {
      place = { kind: "loose" };
    }
    return {
      id: it.id,
      title: it.title,
      itemCode: it.itemCode,
      status: it.status,
      warehouse: it.location ? { id: it.location.id, name: it.location.name } : null,
      storageLocation: it.storageLocation,
      gatherSpot: it.gatherSpot,
      owner: winner ? { clerkUserId: winner, name: prof?.name ?? null, phone: prof?.phone ?? null } : null,
      place,
    };
  });
}
