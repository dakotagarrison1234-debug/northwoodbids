import { NextRequest, NextResponse } from "next/server";
import { Prisma, type OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";
import { releaseReferralCredit } from "@/lib/referral";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Refund a PAID payment. Owner/Admin only. Issues a Stripe refund against the
// original PaymentIntent, marks the Payment REFUNDED, and returns the item to
// UNSOLD so it can be re-listed.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireRole(membership.organizationId, ["OWNER", "ADMIN"] as OrgRole[]))) {
    return NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 });
  }

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { item: { select: { id: true, organizationId: true, status: true } } },
  });
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  // The payment's item must belong to the caller's org.
  if (payment.item.organizationId !== membership.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (payment.status !== "PAID") {
    return NextResponse.json(
      { error: "Only a paid payment can be refunded." },
      { status: 400 }
    );
  }

  // A PaymentIntent is shared across ALL of a winner's items in an auction (we
  // charge in one batch). So we must refund the EXACT amount charged for THIS
  // item — bid + buyer's premium + tax − any Bid Bucks applied — as a PARTIAL
  // refund, never the whole PaymentIntent.
  const refundCents = Math.round(
    (Number(payment.amount) +
      Number(payment.applicationFeeAmount ?? 0) +
      Number(payment.taxAmount ?? 0) -
      Number(payment.creditApplied ?? 0)) *
      100
  );

  if (refundCents > 0) {
    if (!payment.stripePaymentIntentId) {
      return NextResponse.json(
        { error: "No card charge is recorded for this item, so there's nothing to refund." },
        { status: 400 }
      );
    }
    try {
      await stripe.refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        amount: refundCents, // partial: this item's share of the batch only
      });
    } catch (err) {
      console.error("[admin refund] Stripe refund failed:", err);
      return NextResponse.json(
        { error: "Could not process the refund. Please try again." },
        { status: 502 }
      );
    }
  }
  // refundCents === 0 → the item was fully covered by Bid Bucks (no card charge);
  // nothing to send back to Stripe, just restore the coupon + free the item below.

  // Return any Bid Bucks coupon that was redeemed on this payment. Prefer DELETING
  // the original "referral_redeemed" row (via its redemptionKey, stored in the PI
  // metadata) — that both restores the balance AND removes the spend record, so the
  // coupon book count stays accurate and the key can never be reused for a free
  // re-redemption. If we can't resolve the key (e.g. fully covered, no PI), fall
  // back to writing a compensating credit row.
  let creditReleased = false;
  if (Number(payment.creditApplied ?? 0) > 0 && payment.stripePaymentIntentId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
      const key = pi.metadata?.redemptionKey;
      if (key) {
        await releaseReferralCredit(key);
        creditReleased = true;
      }
    } catch (e) {
      console.error("[admin refund] credit key lookup failed:", e);
    }
  }

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } }),
  ];

  if (Number(payment.creditApplied ?? 0) > 0 && !creditReleased) {
    ops.push(
      prisma.creditLedger.create({
        data: {
          clerkUserId: payment.clerkUserId,
          amount: Number(payment.creditApplied),
          reason: "referral_refund_return",
        },
      })
    );
  }

  // Free the item for re-listing, but don't disturb one already collected, and
  // detach it from any pickup appointment / transfer it was riding on.
  if (payment.item.status === "SOLD" || payment.item.status === "PENDING_PICKUP") {
    ops.push(
      prisma.item.update({
        where: { id: payment.item.id },
        data: { status: "UNSOLD", pickupAppointmentId: null, transferRequestId: null },
      })
    );
  }

  await prisma.$transaction(ops);

  return NextResponse.json({ success: true });
}
