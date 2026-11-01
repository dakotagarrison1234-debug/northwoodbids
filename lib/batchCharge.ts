import { createHash } from "crypto";

/**
 * Helpers for "pay everything owed in one charge" (the bidder's Pay all and the
 * admin's Charge owed). One rule ties them together: a charge is about an exact
 * SET of lots, and that set travels with the payment.
 *
 *   batchKey(ids)        stable short hash of the lot set. Goes into the Stripe
 *                        idempotency key and the Bid Bucks redemption key, so a
 *                        double tap reuses the same charge and credit, but a
 *                        DIFFERENT set of lots is always a new charge / credit.
 *   itemIdsToMetadata()  the lot ids, split across metadata keys (Stripe allows
 *                        500 characters per value, 50 keys).
 *   itemIdsFromMetadata() read them back, so the 3-D Secure confirm step settles
 *                        exactly what was charged, never "whatever is owed now".
 */

export function batchKey(itemIds: string[]): string {
  return createHash("sha256").update([...itemIds].sort().join(",")).digest("hex").slice(0, 20);
}

export function itemIdsToMetadata(itemIds: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  let chunk = "";
  let n = 0;
  for (const id of itemIds) {
    const next = chunk ? `${chunk},${id}` : id;
    if (next.length > 490) {
      out[`itemIds${n++}`] = chunk;
      chunk = id;
    } else {
      chunk = next;
    }
  }
  if (chunk) out[`itemIds${n++}`] = chunk;
  out.itemIdsParts = String(n);
  return out;
}

export function itemIdsFromMetadata(md: Record<string, string> | null | undefined): string[] | null {
  const parts = Number(md?.itemIdsParts);
  if (!md || !Number.isInteger(parts) || parts <= 0) return null;
  const ids: string[] = [];
  for (let i = 0; i < parts; i++) {
    const v = md[`itemIds${i}`];
    if (!v) return null;
    ids.push(...v.split(",").filter(Boolean));
  }
  return ids;
}

/** Item statuses where a won lot can still be owed: sold, not refunded or forfeited. */
export const OWED_ITEM_STATUSES = ["SOLD", "PENDING_PICKUP"] as const;

/**
 * Close the buyer's open "pay all" Bid Bucks reservation once a payment has gone
 * through: the ledger row gets a unique key (`<key>:<suffix>`), so the coupon
 * stays spent on THIS bill and the next "pay all" reserves a fresh one instead
 * of reusing it. No-op when nothing was reserved.
 */
export async function closeRedemption(openKey: string, suffix: string): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  await prisma.creditLedger
    .updateMany({ where: { redemptionKey: openKey }, data: { redemptionKey: `${openKey}:${suffix}` } })
    .catch((e) => console.error("[batchCharge] closeRedemption failed:", e));
}
