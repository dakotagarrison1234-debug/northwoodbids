import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { fmtCents } from "@/lib/shipping/tiers";
import { textBuyer } from "@/lib/shippingNotify";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * A PAID lot leaves its box before the label is bought (Move to pickup / Cancel
 * box): give its shipping back automatically, the same way forfeit does.
 *
 *  - Card: Stripe partial refund of `Payment.shippingAmount` on the lot's
 *    PaymentIntent, idempotency key `shipref:<paymentId>` so a double tap can't
 *    refund twice.
 *  - Cash: nothing to send through Stripe — the counter hands it back; the
 *    caller appends "cash shipping to hand back $X" to the box notes.
 *
 * Either way `shippingRefundedAt` is stamped on the row afterwards (the amount
 * stays, struck through on /shipping), so a second call finds nothing to refund
 * ("none"). Throws on a Stripe failure — the caller must stop before it touches
 * the box.
 */
export type ShippingRefund =
  | { status: "refunded"; cents: number; paymentId: string }
  | { status: "cash"; cents: number; paymentId: string }
  | { status: "none"; cents: 0; paymentId: string | null }
  | { status: "skipped"; cents: number; paymentId: string; reason: string };

export async function refundShippingForItem(itemId: string): Promise<ShippingRefund> {
  const payment = await prisma.payment.findFirst({
    where: { itemId, status: "PAID" },
    orderBy: { createdAt: "desc" },
    select: { id: true, shippingAmount: true, shippingRefundedAt: true, stripePaymentIntentId: true, paidInCash: true },
  });
  const cents = Math.round(Number(payment?.shippingAmount ?? 0) * 100);
  if (!payment || cents <= 0 || payment.shippingRefundedAt) return { status: "none", cents: 0, paymentId: payment?.id ?? null };

  if (payment.paidInCash) {
    await prisma.payment.update({ where: { id: payment.id }, data: { shippingRefundedAt: new Date() } });
    return { status: "cash", cents, paymentId: payment.id };
  }
  if (!payment.stripePaymentIntentId) {
    // Shipping is never covered by Bid Bucks, so a PAID row with shipping and no
    // PaymentIntent shouldn't exist — leave the money where it is and say so.
    return { status: "skipped", cents, paymentId: payment.id, reason: "no card charge on record" };
  }
  await stripe.refunds.create(
    { payment_intent: payment.stripePaymentIntentId, amount: cents },
    { idempotencyKey: `shipref:${payment.id}` },
  );
  await prisma.payment.update({ where: { id: payment.id }, data: { shippingRefundedAt: new Date() } });
  return { status: "refunded", cents, paymentId: payment.id };
}

/** The one text a buyer gets when their lot(s) leave a box and the shipping comes back. */
export async function textMovedToPickup(clerkUserId: string, what: string, refundedCents: number): Promise<boolean> {
  const money = refundedCents > 0 ? ` and refunded ${fmtCents(refundedCents)} shipping` : "";
  return textBuyer(clerkUserId, "shipping_moved_to_pickup", `We moved your ${what} to pickup${money}.`, { refundedCents });
}
