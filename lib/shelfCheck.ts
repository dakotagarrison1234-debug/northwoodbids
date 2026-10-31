import { prisma } from "@/lib/prisma";

/**
 * SHELF COLLISION CHECK — "is shelf 101 somebody else's right now?"
 *
 * THE RULE (owner's): shelves are numbered 1, 2, 3 … 101 … and each number
 * has sections A/B/C. The NUMBER is what belongs to a person: Ary works
 * shelf 1 (1A, 1B, 1C), Jacob shelf 2, Ron shelf 3. A shelf number is
 * "theirs" for 7 DAYS after their last listing on any of its sections.
 *
 *   - Ron types 101A and Ary listed on 101B five days ago  → ALERT (101 is Ary's)
 *   - Ron types 1A and Jacob last listed on shelf 1 eight days ago → free
 *   - Ary types 1C after listing 1A/1B herself today → nothing (her shelf)
 *
 * The letter never matters; the number does. Reuse after 7 quiet days costs
 * nothing. The lister can still confirm and go ahead (they talked to Ary).
 */

export type ShelfHolder = {
  name: string;
  count: number;          // items they listed on this shelf number in the window
  minutesAgo: number;     // since their most recent one
  sections: string[];     // e.g. ["101B", "101C"]
  auctionTitle: string | null;
};
export type ShelfCheck = {
  shelf: string;          // what was typed, normalized (e.g. "101A")
  shelfNumber: string;    // the unit that matters (e.g. "101"); "" if no digits
  holders: ShelfHolder[]; // OTHER people active on this number within 7 days — the alert
  mine: { count: number; minutesAgo: number } | null; // my own recent use (info only)
};

export const SHELF_IN_USE_DAYS = 7;
const WINDOW_MS = SHELF_IN_USE_DAYS * 24 * 60 * 60_000;

export const normalizeShelf = (s: unknown) => String(s ?? "").trim().toUpperCase().slice(0, 40);
/** "101A" → "101", "A1" → "1", "BIN-7" → "7"; "" when there's no number. */
export const shelfNumberOf = (shelf: string): string => shelf.match(/\d+/)?.[0] ?? "";

export async function checkShelf(opts: {
  orgId: string;
  shelf: string;
  auctionId?: string | null;
  locationId?: string | null;
  clerkUserId: string;
}): Promise<ShelfCheck> {
  const shelf = normalizeShelf(opts.shelf);
  const num = shelfNumberOf(shelf);
  if (!num) return { shelf, shelfNumber: "", holders: [], mine: null };

  // Candidate rows: same org (and warehouse), listed in the window, whose
  // shelf text contains this number. The exact "same number, not 1 vs 10 vs
  // 101" test is done in JS with a regex since the DB match is only a prefilter.
  const rows = await prisma.item.findMany({
    where: {
      organizationId: opts.orgId,
      ...(opts.locationId ? { locationId: opts.locationId } : {}),
      createdAt: { gte: new Date(Date.now() - WINDOW_MS) },
      storageLocation: { contains: num },
    },
    select: { createdById: true, createdByName: true, createdAt: true, storageLocation: true, auctionId: true },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  const sameNumber = (loc: string | null) => shelfNumberOf(normalizeShelf(loc)) === num;
  const hits = rows.filter((r) => sameNumber(r.storageLocation));

  const now = Date.now();
  const byPerson = new Map<string, ShelfHolder & { latest: number; auctionId: string | null }>();
  let mine: ShelfCheck["mine"] = null;
  for (const r of hits) {
    const t = r.createdAt.getTime();
    if (r.createdById === opts.clerkUserId) {
      if (!mine) mine = { count: 0, minutesAgo: Math.round((now - t) / 60_000) };
      mine.count++;
      continue;
    }
    const key = r.createdById ?? "unknown";
    const h = byPerson.get(key) ?? {
      name: r.createdByName || "A coworker", count: 0, minutesAgo: 0, sections: [], auctionTitle: null,
      latest: 0, auctionId: r.auctionId,
    };
    h.count++;
    if (t > h.latest) { h.latest = t; h.minutesAgo = Math.round((now - t) / 60_000); h.auctionId = r.auctionId; }
    const sec = normalizeShelf(r.storageLocation);
    if (sec && !h.sections.includes(sec)) h.sections.push(sec);
    byPerson.set(key, h);
  }

  const auctionIds = [...new Set([...byPerson.values()].map((h) => h.auctionId).filter((x): x is string => !!x))];
  const titles = new Map(
    auctionIds.length
      ? (await prisma.auction.findMany({ where: { id: { in: auctionIds } }, select: { id: true, title: true } })).map((a) => [a.id, a.title])
      : []
  );

  const holders: ShelfHolder[] = [...byPerson.values()]
    .sort((a, b) => a.minutesAgo - b.minutesAgo)
    .map(({ latest: _l, auctionId, ...h }) => ({ ...h, sections: h.sections.sort(), auctionTitle: auctionId ? titles.get(auctionId) ?? null : null })); // eslint-disable-line @typescript-eslint/no-unused-vars

  return { shelf, shelfNumber: num, holders, mine };
}
