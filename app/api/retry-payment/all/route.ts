import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { autoAttachPaidItems } from "@/lib/pickup";
import { notifyPaymentReceipt } from "@/lib/paymentNotify";
import { vestReferralForPayer, reserveReferralCredit, releaseReferralCredit } from "@/lib/referral";
import { settleItemsPaid } from "@/lib/settlePayments";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * POST /api/retry-payment/all
 *
 * Pay ALL of the user's unpaid won items in ONE charge instead of one per item.
 * Sums bid + buyer's premium + tax across every unpaid win for a single org,
 * applies one Bid Bucks credit, and charges the card on file once. Fewer declines,
 * one Stripe fixed fee instead of many, one approval for the customer.
 *
 * Single-business app, so there's normally one org; if a user somehow has unpaid
 * wins across orgs we settle the first org's batch and the client calls again.
 */
export async function POST(_request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Every WON bid, with its item + org config.
    const wonBids = await prisma.bid.findMany({
      where: { clerkUserId: userId, status: "WON" },
      select: {
        amount: true,
        item: {
          select: {
            id: true,
            status: true,
            organizationId: true,
            organization: {
              select: { id: true, platformFeePercent: true, taxPercent: true, taxExempt: true },
            },
          },
        },
      },
    });
    if (wonBids.length === 0) return NextResponse.json({ error: "Nothing to pay." }, { status: 404 });

    // Drop items that already have a non-FAILED payment (PAID/PENDING).
    const itemIds = wonBids.map((b) => b.item.id);
    const settled = await prisma.payment.findMany({
      where: { itemId: { in: itemIds }, clerkUserId: userId, status: { in: ["PAID", "PENDING"] } },
      select: { itemId: true },
    });
    const settledIds = new Set(settled.map((p) => p.itemId));
    const unpaid = wonBids.filter((b) => !settledIds.has(b.item.id));
    if (unpaid.length === 0) return NextResponse.json({ success: true, alreadyPaid: true });

    // One org per call — take the first org's batch (single-business = the only one).
    const orgId = unpaid[0].item.organizationId;
    const group = unpaid.filter((b) => b.item.organizationId === orgId);
    const org = group[0].item.organization;

    const bidderCustomer = await prisma.bidderStripeCustomer.findUnique({
      where: { clerkUserId_organizationId: { clerkUserId: userId, organizationId: orgId } },
    });
    if (!bidderCustomer?.defaultPaymentMethodId) {
      return NextResponse.json(
        { error: "No payment card on file. Please add a card first.", requiresPaymentMethod: true },
        { status: 422 }
      );
    }

    const feePct = Number(org.platformFeePercent);
    const taxPct = org.taxExempt ? 0 : Number(org.taxPercent);

    // Totals across the whole batch.
    const items = group.map((b) => ({ id: b.item.id, bid: Number(b.amount) }));
    const totalBid = items.reduce((s, i) => s + i.bid, 0);
    const feeCents = Math.round(totalBid * feePct / 100 * 100);
    const taxCents = Math.round((totalBid * 100 + feeCents) * taxPct / 100);
    const chargeCents = Math.round(totalBid * 100) + feeCents + taxCents;

    // One Bid Bucks credit for the batch. Stable key so a double-click / re-attempt
    // reuses the same reservation instead of spending two coupons.
    const redemptionKey = `retryall-${orgId}-${userId}`;
    const discountCents = await reserveReferralCredit(userId, chargeCents, redemptionKey);
    const netCents = chargeCents - discountCents;

    // Fully covered by Bid Bucks — no card charge.
    if (discountCents > 0 && netCents <= 0) {
      await settleItemsPaid(userId, items, feePct, taxPct, null, discountCents);
      await autoAttachPaidItems(userId, orgId);
      await vestReferralForPayer(userId);
      return NextResponse.json({ success: true, paid: items.length });
    }

    let pi: Stripe.PaymentIntent;
    try {
      pi = await stripe.paymentIntents.create(
        {
          amount: netCents,
          currency: "usd",
          customer: bidderCustomer.stripeCustomerId,
          payment_method: bidderCustomer.defaultPaymentMethodId,
          off_session: true,
          confirm: true,
          metadata: {
            clerkUserId: userId,
            orgId,
            isRetryAll: "true",
            redemptionKey,
            creditAppliedCents: String(discountCents),
          },
        },
        { idempotencyKey: `retryall-${orgId}-${userId}-${bidderCustomer.defaultPaymentMethodId}` }
      );
    } catch (err: unknown) {
      if (isAuthRequired(err)) {
        const secret = (err as { payment_intent?: { client_secret?: string; id?: string } }).payment_intent;
        if (secret?.client_secret) {
          return NextResponse.json({ requiresAction: true, clientSecret: secret.client_secret, paymentIntentId: secret.id });
        }
      }
      if (discountCents > 0) await releaseReferralCredit(redemptionKey);
      throw err;
    }

    if (pi.status === "succeeded" || pi.status === "processing") {
      const paidStatus = pi.status === "succeeded" ? "PAID" : "PENDING";
      await settleItemsPaid(userId, items, feePct, taxPct, pi.id, discountCents, paidStatus);
      if (paidStatus === "PAID") {
        await autoAttachPaidItems(userId, orgId);
        await vestReferralForPayer(userId);
        notifyPaymentReceipt({ clerkUserId: userId, amount: Number((netCents / 100).toFixed(2)) }).catch((e) =>
          console.error("notifyPaymentReceipt (retry-all) failed:", e)
        );
      }
      return NextResponse.json({ success: true, paid: items.length, processing: pi.status === "processing" });
    }

    if (pi.status === "requires_action" || pi.status === "requires_confirmation") {
      return NextResponse.json({ requiresAction: true, clientSecret: pi.client_secret, paymentIntentId: pi.id });
    }

    if (discountCents > 0) await releaseReferralCredit(redemptionKey);
    return NextResponse.json({ error: "Payment did not complete. Please try a different card." }, { status: 422 });
  } catch (error: unknown) {
    if (isAuthRequired(error)) {
      const pi = (error as { payment_intent?: { client_secret?: string; id?: string } }).payment_intent;
      if (pi?.client_secret) {
        return NextResponse.json({ requiresAction: true, clientSecret: pi.client_secret, paymentIntentId: pi.id });
      }
    }
    if (typeof error === "object" && error !== null && "type" in error && (error as { type: string }).type === "StripeCardError") {
      const m = (error as { message?: string }).message;
      return NextResponse.json({ error: m ?? "Card declined. Please update your payment card." }, { status: 422 });
    }
    console.error("Retry-all payment error:", error);
    return NextResponse.json({ error: "Payment failed. Please try again." }, { status: 500 });
  }
}

function isAuthRequired(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "authentication_required";
}
