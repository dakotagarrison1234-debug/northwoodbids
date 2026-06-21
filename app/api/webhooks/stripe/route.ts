import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attachToUpcomingAppointment } from "@/lib/pickup";
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
        await markPaymentsPaid(pi.id);
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const reason =
          pi.last_payment_error?.message ??
          pi.last_payment_error?.code ??
          "Payment failed";
        await markPaymentsFailed(pi.id, reason);
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
 */
async function markPaymentsPaid(paymentIntentId: string): Promise<void> {
  const payments = await prisma.payment.findMany({
    where: { stripePaymentIntentId: paymentIntentId },
  });
  if (payments.length === 0) {
    console.warn(`[stripe-webhook] no Payment rows for PI ${paymentIntentId} (succeeded)`);
    return;
  }

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
    await attachToUpcomingAppointment(payment.clerkUserId, await orgIdForItem(payment.itemId));
  }
}

/**
 * Marks all Payment rows for a PaymentIntent FAILED, leaving items SOLD.
 * Idempotent — never downgrades an already-PAID row.
 */
async function markPaymentsFailed(paymentIntentId: string, reason: string): Promise<void> {
  await prisma.payment.updateMany({
    where: { stripePaymentIntentId: paymentIntentId, status: { not: "PAID" } },
    data: { status: "FAILED", failureReason: reason },
  });
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
