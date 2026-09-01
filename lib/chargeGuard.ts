import { prisma } from "@/lib/prisma";

// An in-progress charge "claim" self-expires after this long, so a crashed/abandoned
// charge never permanently strands an item (the next attempt re-claims it).
const CLAIM_TTL_MS = 25_000;

export type ChargeItem = { id: string; bid: number };

/**
 * Serialize a customer's charge across the concurrent charge paths (retry-payment,
 * retry-payment/all, charge-owed) so one item can NEVER be charged twice.
 *
 * Under a per-user Postgres advisory lock it re-checks which candidate items are:
 *   - already PAID,
 *   - a card charge in flight (PENDING + PaymentIntent), or
 *   - being charged right now by a concurrent request (a fresh PENDING claim),
 * and CLAIMS the rest by stamping a PENDING placeholder with `autoChargeAttemptedAt`.
 *
 * Returns the items THIS caller now owns. Charge them OUTSIDE this call, then either
 * let settleItemsPaid() flip the claim to PAID (success) or call releaseChargeClaims()
 * (decline / 3DS-needed / error) so the balance stays owed and re-chargeable.
 *
 * A genuine unpaid placeholder from auction close (PENDING, no PaymentIntent, stale or
 * null `autoChargeAttemptedAt`) is NOT treated as a claim — it stays chargeable.
 */
export async function claimItemsForCharge(clerkUserId: string, candidates: ChargeItem[]): Promise<ChargeItem[]> {
  if (candidates.length === 0) return [];
  const ids = candidates.map((c) => c.id);
  const now = new Date();
  const freshSince = new Date(now.getTime() - CLAIM_TTL_MS);

  return prisma.$transaction(
    async (tx) => {
      // Serialize per user — only same-user concurrent charges wait on each other.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"charge:" + clerkUserId}))`;

      const rows = await tx.payment.findMany({
        where: { itemId: { in: ids }, clerkUserId },
        select: { itemId: true, status: true, stripePaymentIntentId: true, autoChargeAttemptedAt: true },
      });
      const byItem = new Map(rows.map((r) => [r.itemId, r]));

      const taken = (id: string): boolean => {
        const r = byItem.get(id);
        if (!r) return false;
        if (r.status === "PAID") return true;                              // already paid
        if (r.status === "PENDING" && r.stripePaymentIntentId) return true; // card charge in flight
        // A fresh PENDING placeholder with no PaymentIntent = a concurrent claim.
        if (
          r.status === "PENDING" &&
          !r.stripePaymentIntentId &&
          r.autoChargeAttemptedAt &&
          r.autoChargeAttemptedAt > freshSince
        ) {
          return true;
        }
        return false;
      };

      const toCharge = candidates.filter((c) => !taken(c.id));
      // Stamp our claim so a racing request skips these (never touches PAID / in-flight).
      for (const c of toCharge) {
        await tx.payment.upsert({
          where: { itemId_clerkUserId: { itemId: c.id, clerkUserId } },
          update: { status: "PENDING", autoChargeAttemptedAt: now, stripePaymentIntentId: null },
          create: { clerkUserId, itemId: c.id, amount: c.bid, status: "PENDING", autoChargeAttemptedAt: now },
        });
      }
      return toCharge;
    },
    { timeout: 15000 }
  );
}

/**
 * Release claims that didn't capture (declined / 3DS-needed / error) → FAILED, so the
 * balance still reads as owed and can be retried. Only touches our own PENDING claims
 * (no PaymentIntent); never a real card charge or a paid row.
 */
export async function releaseChargeClaims(clerkUserId: string, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  await prisma.payment.updateMany({
    where: { clerkUserId, itemId: { in: itemIds }, status: "PENDING", stripePaymentIntentId: null },
    data: { status: "FAILED" },
  });
}
