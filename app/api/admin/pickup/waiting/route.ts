export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

// Winners with paid items that aren't on an appointment yet. Now returns each
// person's item list too, so staff can gather them early (before a booking).
export async function GET() {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const orgId = membership.organizationId;

  const items = await prisma.item.findMany({
    // Exclude items out on an active transfer — they live on the Transfers board and
    // the customer waits for them to arrive before booking. Showing them here too is
    // just noise. (transferRequestId is non-null only while REQUESTED/LOADED.)
    where: { organizationId: orgId, status: "PENDING_PICKUP", pickupAppointmentId: null, transferRequestId: null },
    select: {
      id: true,
      title: true,
      itemCode: true,
      grabbedAt: true,
      storageLocation: true,
      updatedAt: true,
      location: { select: { name: true } },
      transferRequest: { select: { status: true } },
    },
  });

  const itemIds = items.map((i) => i.id);
  const winners = itemIds.length
    ? await prisma.bid.findMany({
        where: { itemId: { in: itemIds }, status: "WON" },
        select: { itemId: true, clerkUserId: true },
      })
    : [];
  const buyerOf = new Map(winners.map((w) => [w.itemId, w.clerkUserId]));

  type LiteItem = {
    id: string;
    title: string;
    itemCode: string | null;
    grabbed: boolean;
    storageLocation: string | null;
    warehouse: string | null;
    transferring: boolean;
  };
  type Row = { clerkUserId: string; items: LiteItem[]; oldest: Date };
  const byUser = new Map<string, Row>();
  for (const it of items) {
    const uid = buyerOf.get(it.id);
    if (!uid) continue;
    const row = byUser.get(uid) ?? { clerkUserId: uid, items: [], oldest: it.updatedAt };
    const tr = it.transferRequest;
    row.items.push({
      id: it.id,
      title: it.title,
      itemCode: it.itemCode,
      grabbed: it.grabbedAt != null,
      storageLocation: it.storageLocation,
      warehouse: it.location?.name ?? null,
      transferring: !!tr && (tr.status === "REQUESTED" || tr.status === "LOADED"),
    });
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
      // Only items physically here (not out on transfer) are gatherable.
      const gatherable = r.items.filter((i) => !i.transferring);
      return {
        clerkUserId: r.clerkUserId,
        name: p?.name ?? null,
        email: p?.email ?? null,
        phone: p?.phone ?? null,
        items: r.items.length,
        itemList: r.items,
        gatheredCount: gatherable.filter((i) => i.grabbed).length,
        gatherableCount: gatherable.length,
        locationId: locId,
        locationName: locId ? locName.get(locId) ?? null : null,
        hasLocation: !!locId,
        waitingDays: Math.floor((now - r.oldest.getTime()) / 86_400_000),
      };
    })
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
