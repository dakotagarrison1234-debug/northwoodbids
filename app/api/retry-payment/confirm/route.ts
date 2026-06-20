import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
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
    if (!item || !item.organization.stripeAccountId) {
      return NextResponse.json({ error: "Item or org not found" }, { status: 404 });
    }
    const org = item.organization;
    const stripeAccountId = item.organization.stripeAccountId;

    // Retrieve the PI from Stripe — the source of truth
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, undefined, {
      stripeAccount: stripeAccountId,
    });

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
    const taxAmount = Math.round(bidAmount * taxRate / 100 * 100); // cents
    const feeAmount = Math.round(bidAmount * Number(org.platformFeePercent) / 100 * 100); // cents

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

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[retry-payment/confirm POST]:", msg, err);
    return NextResponse.json({ error: "Failed to confirm payment" }, { status: 500 });
  }
}
