import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autoAttachPaidItems } from "@/lib/pickup";
import { notifyPaymentFailed, notifyPaymentReceipt } from "@/lib/paymentNotify";
import { vestReferralForPayer, releaseReferralCredit } from "@/lib/referral";
import Stripe from "stripe";

// App Router route handlers expose the raw body via request.text(), so no
// special body-parser config is needed. Force the Node runtime for Stripe's
// signature verification.
export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * POST /api/webhooks/stripe
 *
 * Reconciles asynchronous payment outcomes against our Payment rows. Direct
 * charges only (single platform account, no Connect). Payment rows are matched
 * by the PaymentIntent id stored in `stripePaymentIntentId`.
 *
 * Handled events:
 *   payment_intent.succeeded       -> Payment(s) PAID + items PENDING_PICKUP
 *   payment_intent.payment_failed  -> Payment(s) FAILED (items stay SOLD)
 *   charge.refunded                -> Payment(s) REFUNDED
 *   charge.dispute.created         -> flag failureReason "disputed" (status kept)
 *
 * All handlers are idempotent. Signature failures return 400; everything else
 * returns 200 quickly so Stripe doesn't retry needlessly.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed — never accept unverifiable events.
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    console.error("[stripe-webhook] signature verification failed:", msg);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const transitioned = await markPaymentsPaid(pi.id);
        // Only send a receipt if THIS webhook actually flipped rows from
        // non-PAID to PAID. If the inline auto-charge already marked them PAID,
        // transitioned is empty and we skip — preventing a double receipt.
        const totalsByUser = new Map<string, number>();
        for (const p of transitioned) {
          const total = (totalsByUser.get(p.clerkUserId) ?? 0) + p.total;
          totalsByUser.set(p.clerkUserId, total);
        }
        for (const [clerkUserId, amount] of totalsByUser) {
          notifyPaymentReceipt({
            clerkUserId,
            amount: Number(amount.toFixed(2)),
          }).catch((e) => console.error("notifyPaymentReceipt (webhook) failed:", e));
          // First successful payment by a referred bidder vests their inviter's reward.
          vestReferralForPayer(clerkUserId).catch((e) =>
            console.error("vestReferralForPayer (webhook) failed:", e)
          );
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const reason =
          pi.last_payment_error?.message ??
          pi.last_payment_error?.code ??
          "Payment failed";
        const failedUserIds = await markPaymentsFailed(pi.id, reason);
        // An async-settling auto-charge ultimately failed — give back any Bid Bucks
        // that were reserved for this bill (key matches lib/closeAuction).
        const auctionId = pi.metadata?.auctionId;
        const payerId = pi.metadata?.clerkUserId;
        if (auctionId && payerId) {
          await releaseReferralCredit(`autocharge-${auctionId}-${payerId}`);
        }
        // Notify each affected winner once (deduped by user).
        for (const clerkUserId of failedUserIds) {
          notifyPaymentFailed({ clerkUserId, reason }).catch((e) =>
            console.error("notifyPaymentFailed (webhook) failed:", e)
          );
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const piId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
        if (piId) await markPaymentsRefunded(piId);
        break;
      }
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const piId =
          typeof dispute.payment_intent === "string"
            ? dispute.payment_intent
            : dispute.payment_intent?.id;
        if (piId) await flagPaymentsDisputed(piId);
        break;
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Handler error";
    console.error(`[stripe-webhook] handler failed for ${event.type}:`, msg, err);
    // Return 500 so Stripe retries — the event was valid but we couldn't process it.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Marks all Payment rows for a PaymentIntent PAID and moves their items to
 * PENDING_PICKUP. Idempotent — skips rows already PAID.
 *
 * Returns ONLY the rows this call actually transitioned from non-PAID to PAID,
 * so the caller can send a receipt exactly once (and not double up when the
 * inline auto-charge already marked them PAID before the webhook arrived).
 */
async function markPaymentsPaid(
  paymentIntentId: string
): Promise<{ clerkUserId: string; total: number }[]> {
  const payments = await prisma.payment.findMany({
    where: { stripePaymentIntentId: paymentIntentId },
  });
  if (payments.length === 0) {
    console.warn(`[stripe-webhook] no Payment rows for PI ${paymentIntentId} (succeeded)`);
    return [];
  }

  const transitioned: { clerkUserId: string; total: number }[] = [];

  for (const payment of payments) {
    if (payment.status === "PAID") continue; // already reconciled
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "PAID", failureReason: null },
      }),
      prisma.item.update({
        where: { id: payment.itemId },
        data: { status: "PENDING_PICKUP" },
      }),
    ]);
    await autoAttachPaidItems(payment.clerkUserId, await orgIdForItem(payment.itemId));
    // Charged total for this row = bid + buyer's premium + tax (nulls => 0).
    const rowTotal =
      Number(payment.amount) +
      Number(payment.applicationFeeAmount ?? 0) +
      Number(payment.taxAmount ?? 0);
    transitioned.push({ clerkUserId: payment.clerkUserId, total: rowTotal });
  }

  return transitioned;
}

/**
 * Marks all Payment rows for a PaymentIntent FAILED, leaving items SOLD.
 * Idempotent — never downgrades an already-PAID row.
 *
 * Returns the unique clerkUserIds whose rows were affected so the caller can
 * notify each affected winner once.
 */
async function markPaymentsFailed(paymentIntentId: string, reason: string): Promise<string[]> {
  const affected = await prisma.payment.findMany({
    where: { stripePaymentIntentId: paymentIntentId, status: { not: "PAID" } },
    select: { clerkUserId: true },
  });
  await prisma.payment.updateMany({
    where: { stripePaymentIntentId: paymentIntentId, status: { not: "PAID" } },
    data: { status: "FAILED", failureReason: reason },
  });
  return [...new Set(affected.map((p) => p.clerkUserId))];
}

/** Marks all Payment rows for a PaymentIntent REFUNDED. */
async function markPaymentsRefunded(paymentIntentId: string): Promise<void> {
  await prisma.payment.updateMany({
    where: { stripePaymentIntentId: paymentIntentId },
    data: { status: "REFUNDED" },
  });
}

/** Flags Payment rows as disputed without changing their status. */
async function flagPaymentsDisputed(paymentIntentId: string): Promise<void> {
  await prisma.payment.updateMany({
    where: { stripePaymentIntentId: paymentIntentId },
    data: { failureReason: "disputed" },
  });
}

/** Resolves the organizationId for an item (used for pickup attachment). */
async function orgIdForItem(itemId: string): Promise<string> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { organizationId: true },
  });
  return item?.organizationId ?? "";
}
