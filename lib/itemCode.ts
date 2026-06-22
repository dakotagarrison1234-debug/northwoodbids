import { prisma } from "@/lib/prisma";

/**
 * Next per-auction item code: 001, 002, 003 … restarting at 001 for each auction.
 * Uses the max existing numeric code + 1 so codes don't collide after deletions.
 */
export async function nextItemCode(auctionId: string): Promise<string> {
  const existing = await prisma.item.findMany({
    where: { auctionId },
    select: { itemCode: true },
  });
  let max = 0;
  for (const e of existing) {
    const n = parseInt((e.itemCode ?? "").replace(/\D/g, ""), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1).padStart(3, "0");
}
