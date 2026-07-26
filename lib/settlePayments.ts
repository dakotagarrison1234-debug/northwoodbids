import { prisma } from "@/lib/prisma";

/**
 * Record a PAID/PENDING payment row per item (per-item fee/tax so Reports stay
 * accurate) and flip SOLD items to PENDING_PICKUP. Used by the batch "pay all"
 * retry and its 3DS confirm. A batch's single Bid Bucks credit is recorded on the
 * FIRST item only, so summed credit across rows reconciles.
 */
export async function settleItemsPaid(
  clerkUserId: string,
  items: { id: string; bid: number }[],
  feePct: number,
  taxPct: number,
  paymentIntentId: string | null,
  creditCents: number,
  status: "PAID" | "PENDING" = "PAID"
): Promise<void> {
  const now = new Date();
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    const feeAmount = Math.round((it.bid * feePct) / 100 * 100);
    const taxAmount = Math.round((it.bid * 100 + feeAmount) * taxPct / 100);
    const creditApplied = idx === 0 && creditCents > 0 ? creditCents / 100 : null;
    await prisma.payment.upsert({
      where: { itemId_clerkUserId: { itemId: it.id, clerkUserId } },
      update: {
        status,
        stripePaymentIntentId: paymentIntentId,
        failureReason: null,
        autoChargeAttemptedAt: now,
        applicationFeeAmount: feeAmount / 100,
        taxAmount: taxAmount / 100,
        creditApplied,
      },
      create: {
        clerkUserId,
        itemId: it.id,
        amount: it.bid,
        applicationFeeAmount: feeAmount / 100,
        taxAmount: taxAmount / 100,
        creditApplied,
        stripePaymentIntentId: paymentIntentId,
        status,
        autoChargeAttemptedAt: now,
      },
    });
    if (status === "PAID") {
      await prisma.item.updateMany({ where: { id: it.id, status: "SOLD" }, data: { status: "PENDING_PICKUP" } });
    }
  }
}
