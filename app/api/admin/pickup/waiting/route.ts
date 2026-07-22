export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

/**
 * GET /api/admin/pickup/waiting
 *
 * Everyone who has WON items sitting unclaimed — grouped per bidder, with their
 * chosen pickup location (or a flag that they never picked one). Two distinct
 * "stuck" states, because they need different nudges:
 *
 *   • no location  → they can't even be told where to go; chase them to pick one
 *   • not booked   → they've a location but haven't chosen a time
 *
 * "Unclaimed" = PENDING_PICKUP with no appointment attached. Once they book, the
 * items get an appointmentId and drop off this list.
 */
export async function GET() {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const orgId = membership.organizationId;

  const items = await prisma.item.findMany({
    where: {
      organizationId: orgId,
      status: "PENDING_PICKUP",
      pickupAppointmentId: null,
    },
    select: { id: true, title: true, currentBid: true, updatedAt: true },
  });

  // Who won each unclaimed item? The winning bid holds the buyer.
  const itemIds = items.map((i) => i.id);
  const winners = itemIds.length
    ? await prisma.bid.findMany({
        where: { itemId: { in: itemIds }, status: "WON" },
        select: { itemId: true, clerkUserId: true },
      })
    : [];
  const buyerOf = new Map(winners.map((w) => [w.itemId, w.clerkUserId]));

  type Row = { clerkUserId: string; items: number; oldest: Date };
  const byUser = new Map<string, Row>();
  for (const it of items) {
    const uid = buyerOf.get(it.id);
    if (!uid) continue;
    const row = byUser.get(uid) ?? { clerkUserId: uid, items: 0, oldest: it.updatedAt };
    row.items += 1;
    if (it.updatedAt < row.oldest) row.oldest = it.updatedAt;
    byUser.set(uid, row);
  }

  const ids = [...byUser.keys()];
  const [profiles, locations] = await Promise.all([
    ids.length
      ? prisma.bidderProfile.findMany({
          where: { clerkUserId: { in: ids } },
          select: { clerkUserId: true, name: true, email: true, phone: true, preferredPickupLocationId: true },
        })
      : Promise.resolve([]),
    prisma.pickupLocation.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } }),
  ]);
  const pmap = new Map(profiles.map((p) => [p.clerkUserId, p]));
  const locName = new Map(locations.map((l) => [l.id, l.name]));

  const now = Date.now();
  const rows = [...byUser.values()]
    .map((r) => {
      const p = pmap.get(r.clerkUserId);
      const locId = p?.preferredPickupLocationId ?? null;
      return {
        clerkUserId: r.clerkUserId,
        name: p?.name ?? null,
        email: p?.email ?? null,
        phone: p?.phone ?? null,
        items: r.items,
        // Where they'd pick up, if they've chosen. null → they haven't.
        locationId: locId,
        locationName: locId ? locName.get(locId) ?? null : null,
        hasLocation: !!locId,
        // How long they've been sitting unclaimed — the stalest first.
        waitingDays: Math.floor((now - r.oldest.getTime()) / 86_400_000),
      };
    })
    // No location is the more urgent stuck state; within each, longest wait first.
    .sort((a, b) => Number(a.hasLocation) - Number(b.hasLocation) || b.waitingDays - a.waitingDays);

  return NextResponse.json({
    rows,
    totals: {
      people: rows.length,
      items: rows.reduce((s, r) => s + r.items, 0),
      noLocation: rows.filter((r) => !r.hasLocation).length,
    },
  });
}
