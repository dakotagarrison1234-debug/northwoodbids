import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { attachToUpcomingAppointment } from "@/lib/pickup";
import { notifyPaymentReceipt } from "@/lib/paymentNotify";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * POST /api/retry-payment
 * Body: { itemId: string }
 *
 * Retries a failed auto-charge for an item the user won.
 * Uses the card currently on file — if that also fails, returns an error
 * so the user can update their card and try again.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { itemId } = await request.json();
    if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

    // Verify the user won this item
    const wonBid = await prisma.bid.findFirst({
      where: { itemId, clerkUserId: userId, status: "WON" },
    });
    if (!wonBid) return NextResponse.json({ error: "No winning bid found" }, { status: 404 });

    // GUARD: never charge an item that is already paid.
    const alreadyPaid = await prisma.payment.findFirst({
      where: { itemId, clerkUserId: userId, status: "PAID" },
    });
    if (alreadyPaid) {
      return NextResponse.json({ error: "This item is already paid." }, { status: 409 });
    }

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

    // Get bidder's card on file
    const bidderCustomer = await prisma.bidderStripeCustomer.findUnique({
      where: {
        clerkUserId_organizationId: { clerkUserId: userId, organizationId: org.id },
      },
    });
    if (!bidderCustomer?.defaultPaymentMethodId) {
      return NextResponse.json(
        { error: "No payment card on file. Please add a card first.", requiresPaymentMethod: true },
        { status: 422 }
      );
    }

    const bidAmount = Number(wonBid.amount);
    // Tax only collected if org is not exempt (set by Northwood Bids).
    const taxRate = org.taxExempt ? 0 : Number(org.taxPercent);
    // Buyer's premium on top of the bid; tax applies to bid + premium.
    const feeAmount = Math.round(bidAmount * Number(org.platformFeePercent) / 100 * 100); // cents
    const taxAmount = Math.round((bidAmount * 100 + feeAmount) * taxRate / 100); // cents
    const chargeAmount = Math.round(bidAmount * 100) + feeAmount + taxAmount; // total cents

    // Create fresh PaymentIntent directly on the platform account
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: chargeAmount,
        currency: "usd",
        customer: bidderCustomer.stripeCustomerId,
        payment_method: bidderCustomer.defaultPaymentMethodId,
        off_session: true,
        confirm: true,
        metadata: { clerkUserId: userId, orgId: org.id, itemId, isRetry: "true" },
      },
      {
        // PM id is part of the key on purpose: a double-click with the SAME card
        // is idempotent (no double charge), but a genuine retry with an UPDATED
        // card produces a new key so the new card is actually attempted.
        idempotencyKey: `retry-${itemId}-${userId}-${bidderCustomer.defaultPaymentMethodId}`,
      }
    );

    if (paymentIntent.status === "succeeded") {
      // Mark payment PAID — upsert on the DB-unique compound key (itemId + clerkUserId)
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

      await prisma.item.update({
        where: { id: itemId },
        data: { status: "PENDING_PICKUP" },
      });
      await attachToUpcomingAppointment(userId, org.id);

      notifyPaymentReceipt({
        clerkUserId: userId,
        amount: Number((chargeAmount / 100).toFixed(2)),
      }).catch((e) => console.error("notifyPaymentReceipt (retry) failed:", e));

      return NextResponse.json({ success: true });
    } else if (paymentIntent.status === "processing") {
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
    } else if (
      paymentIntent.status === "requires_action" ||
      paymentIntent.status === "requires_confirmation"
    ) {
      // Card requires 3DS — hand the client secret back so the dashboard
      // can complete authentication on-session, then hit /api/retry-payment/confirm.
      return NextResponse.json({
        requiresAction: true,
        clientSecret: paymentIntent.client_secret,
      });
    } else {
      return NextResponse.json(
        { error: "Payment did not complete. Please try a different card." },
        { status: 422 }
      );
    }
  } catch (error: unknown) {
    // 3DS authentication required — off-session confirm is rejected, but Stripe
    // attaches the PaymentIntent to the error so the client can authenticate.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "authentication_required"
    ) {
      const pi = (error as { payment_intent?: { client_secret?: string } }).payment_intent;
      if (pi?.client_secret) {
        return NextResponse.json({
          requiresAction: true,
          clientSecret: pi.client_secret,
        });
      }
    }
    // Stripe card decline errors
    if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      (error as { type: string }).type === "StripeCardError"
    ) {
      const stripeErr = error as { message?: string };
      return NextResponse.json(
        { error: stripeErr.message ?? "Card declined. Please update your payment card." },
        { status: 422 }
      );
    }
    console.error("Retry payment error:", error);
    return NextResponse.json({ error: "Payment failed. Please try again." }, { status: 500 });
  }
}
