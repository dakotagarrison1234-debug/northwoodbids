import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { attachToUpcomingAppointment } from "@/lib/pickup";
import { notifyPaymentReceipt } from "@/lib/paymentNotify";
import { vestReferralForPayer } from "@/lib/referral";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * POST /api/retry-payment/confirm
 * Body: { itemId: string; paymentIntentId: string }
 *
 * Called after the client completes 3DS authentication for a retry payment.
 * Verifies the PaymentIntent directly with Stripe (on the connected account)
 * before recording anything — the client is never trusted about payment state.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { itemId, paymentIntentId } = await request.json();
    if (!itemId || !paymentIntentId) {
      return NextResponse.json({ error: "itemId and paymentIntentId required" }, { status: 400 });
    }

    // Verify the user won this item
    const wonBid = await prisma.bid.findFirst({
      where: { itemId, clerkUserId: userId, status: "WON" },
    });
    if (!wonBid) return NextResponse.json({ error: "No winning bid found" }, { status: 404 });

    // Already paid? Nothing to do.
    const alreadyPaid = await prisma.payment.findFirst({
      where: { itemId, clerkUserId: userId, status: "PAID" },
    });
    if (alreadyPaid) return NextResponse.json({ success: true });

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        organization: {
          select: {
            id: true,
            stripeAccountId: true,
            platformFeePercent: true,
            taxPercent: true,
            taxExempt: true,
          },
        },
      },
    });
    if (!item) {
      return NextResponse.json({ error: "Item or org not found" }, { status: 404 });
    }
    const org = item.organization;

    // Retrieve the PI from Stripe (platform account) — the source of truth
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // The PI must belong to this user + item (set in retry-payment metadata)
    if (
      paymentIntent.metadata?.clerkUserId !== userId ||
      paymentIntent.metadata?.itemId !== itemId
    ) {
      return NextResponse.json({ error: "Payment does not match this item" }, { status: 403 });
    }

    if (paymentIntent.status !== "succeeded" && paymentIntent.status !== "processing") {
      return NextResponse.json(
        { error: "Payment has not completed. Please try again." },
        { status: 422 }
      );
    }

    // Same fee/tax math as retry-payment
    const bidAmount = Number(wonBid.amount);
    const taxRate = org.taxExempt ? 0 : Number(org.taxPercent);
    const feeAmount = Math.round(bidAmount * Number(org.platformFeePercent) / 100 * 100); // cents
    const taxAmount = Math.round((bidAmount * 100 + feeAmount) * taxRate / 100); // cents (bid + premium)
    const chargeAmount = Math.round(bidAmount * 100) + feeAmount + taxAmount; // total cents

    if (paymentIntent.status === "processing") {
      // Async settlement in progress — record PENDING and DON'T release the item.
      // The Stripe webhook (payment_intent.succeeded) reconciles it to PAID later.
      await prisma.payment.upsert({
        where: { itemId_clerkUserId: { itemId, clerkUserId: userId } },
        update: {
          status: "PENDING",
          stripePaymentIntentId: paymentIntent.id,
          failureReason: null,
          autoChargeAttemptedAt: new Date(),
          applicationFeeAmount: feeAmount / 100,
          taxAmount: taxAmount / 100,
        },
        create: {
          clerkUserId: userId,
          itemId,
          amount: bidAmount,
          applicationFeeAmount: feeAmount / 100,
          taxAmount: taxAmount / 100,
          stripePaymentIntentId: paymentIntent.id,
          status: "PENDING",
          autoChargeAttemptedAt: new Date(),
        },
      });

      return NextResponse.json({ success: true, processing: true });
    }

    // status === "succeeded"
    await prisma.payment.upsert({
      where: { itemId_clerkUserId: { itemId, clerkUserId: userId } },
      update: {
        status: "PAID",
        stripePaymentIntentId: paymentIntent.id,
        failureReason: null,
        autoChargeAttemptedAt: new Date(),
        applicationFeeAmount: feeAmount / 100,
        taxAmount: taxAmount / 100,
      },
      create: {
        clerkUserId: userId,
        itemId,
        amount: bidAmount,
        applicationFeeAmount: feeAmount / 100,
        taxAmount: taxAmount / 100,
        stripePaymentIntentId: paymentIntent.id,
        status: "PAID",
        autoChargeAttemptedAt: new Date(),
      },
    });

    if (item.status === "SOLD") {
      await prisma.item.update({
        where: { id: itemId },
        data: { status: "PENDING_PICKUP" },
      });
    }
    await attachToUpcomingAppointment(userId, org.id);
    // First successful payment by a referred bidder vests their inviter's reward.
    await vestReferralForPayer(userId);

    notifyPaymentReceipt({
      clerkUserId: userId,
      amount: Number((chargeAmount / 100).toFixed(2)),
    }).catch((e) => console.error("notifyPaymentReceipt (retry-confirm) failed:", e));

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[retry-payment/confirm POST]:", msg, err);
    return NextResponse.json({ error: "Failed to confirm payment" }, { status: 500 });
  }
}
