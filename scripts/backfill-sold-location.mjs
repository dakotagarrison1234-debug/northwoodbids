// One-time backfill for the commission fix.
//
// Sets Item.soldLocationId on items that were sold before the field existed, so
// commission reports attribute each sale to its SOURCE location:
//   - If the item was moved by a completed pickup transfer, recover the original
//     (pre-move) location from that transfer's saved snapshot (revertSnapshot).
//   - Otherwise the item never moved, so its current locationId IS the source.
//
// Run AFTER `npx prisma db push` (so the soldLocationId column exists):
//   node scripts/backfill-sold-location.mjs
// Safe to run more than once (only touches rows where soldLocationId is null).

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Earliest original location per item, from completed transfers' snapshots.
  // Ordering by completedAt asc means the FIRST move wins — the true origin even
  // if an item was moved more than once.
  const transfers = await prisma.transferRequest.findMany({
    where: { status: "COMPLETED", revertSnapshot: { not: null } },
    orderBy: { completedAt: "asc" },
    select: { revertSnapshot: true },
  });

  const originByItem = new Map();
  for (const t of transfers) {
    const snap = t.revertSnapshot;
    if (!Array.isArray(snap)) continue;
    for (const s of snap) {
      if (s && s.itemId && !originByItem.has(s.itemId)) {
        originByItem.set(s.itemId, s.locationId ?? null);
      }
    }
  }

  const items = await prisma.item.findMany({
    where: { soldLocationId: null, status: { in: ["SOLD", "PENDING_PICKUP", "PICKED_UP"] } },
    select: { id: true, locationId: true },
  });

  let updated = 0;
  let fromHistory = 0;
  for (const it of items) {
    const origin = originByItem.has(it.id) ? originByItem.get(it.id) : it.locationId;
    if (origin == null) continue; // no location to attribute — leave null
    await prisma.item.update({ where: { id: it.id }, data: { soldLocationId: origin } });
    updated++;
    if (originByItem.has(it.id)) fromHistory++;
  }

  console.log(
    `Backfill complete: set soldLocationId on ${updated} sold item(s); ` +
    `${fromHistory} of them restored from transfer history, the rest kept their current location.`
  );
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
