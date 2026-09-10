import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Commission follows the warehouse that SOLD the item, never the one it was later
 * moved to for the buyer's pickup. That's `Item.soldLocationId`, snapshotted at
 * auction close (and at giveaway award) — before any transfer can move the item.
 *
 * Items sold before that snapshot existed have it null. Reports used to fall back to
 * the LIVE location for those, which is exactly the post-transfer destination — so
 * older auctions credited the pickup warehouse instead of the selling one.
 *
 * This self-heals that gap. For every sold item still missing a snapshot it recovers
 * the true origin:
 *   - If a completed transfer moved it, that transfer's `revertSnapshot` recorded
 *     where the item lived BEFORE the move — the real selling warehouse. The FIRST
 *     move wins, so an item moved twice still resolves to its original home.
 *   - If no transfer ever touched it, it never moved: its current location IS where
 *     it sold.
 *   - If a transfer moved it but it had no location at the time, we leave it null —
 *     it's honestly "Unassigned", and must NOT be credited to the destination.
 *
 * Idempotent and cheap once healed: it only ever writes rows that are null, so after
 * the first pass it's a single empty query.
 */
export async function ensureSoldLocations(organizationId: string): Promise<number> {
  const missing = await prisma.item.findMany({
    where: {
      organizationId,
      soldLocationId: null,
      status: { in: ["SOLD", "PENDING_PICKUP", "PICKED_UP"] },
    },
    select: { id: true, locationId: true },
    take: 5000,
  });
  if (missing.length === 0) return 0;

  // Origin per item from completed transfers, earliest move first.
  const transfers = await prisma.transferRequest.findMany({
    where: { organizationId, status: "COMPLETED", revertSnapshot: { not: Prisma.DbNull } },
    orderBy: { completedAt: "asc" },
    select: { revertSnapshot: true },
  });
  const originByItem = new Map<string, string | null>();
  for (const t of transfers) {
    const snap = t.revertSnapshot as { itemId?: string; locationId?: string | null }[] | null;
    if (!Array.isArray(snap)) continue;
    for (const s of snap) {
      if (s?.itemId && !originByItem.has(s.itemId)) originByItem.set(s.itemId, s.locationId ?? null);
    }
  }

  let fixed = 0;
  for (const it of missing) {
    // Moved by a transfer → its pre-move home. Never moved → where it sits now.
    const origin = originByItem.has(it.id) ? originByItem.get(it.id) : it.locationId;
    if (origin == null) continue; // genuinely unassigned at sale time — leave it
    await prisma.item.update({ where: { id: it.id }, data: { soldLocationId: origin } });
    fixed++;
  }
  return fixed;
}
