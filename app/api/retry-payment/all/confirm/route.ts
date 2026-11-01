import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { autoAttachPaidItems } from "@/lib/pickup";
import { notifyPaymentReceipt } from "@/lib/paymentNotify";
import { vestReferralForPayer, releaseReferralCredit } from "@/lib/referral";
import { settleItemsPaid } from "@/lib/settlePayments";
import { closeRedemption, itemIdsFromMetadata, OWED_ITEM_STATUSES } from "@/lib/batchCharge";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * POST /api/retry-payment/all/confirm
 * Body: { paymentIntentId: string }
 *
 * Called after the client completes 3DS for a batch "pay all". Verifies the PI
 * with Stripe, then settles EXACTLY the lots that PI was created for (their ids
 * travel in the PI's metadata). A PI can settle lots once: replaying an old PI
 * never marks newer wins paid, and the amount must match what those lots cost.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { paymentIntentId } = await request.json();
    if (!paymentIntentId) return NextResponse.json({ error: "paymentIntentId required" }, { status: 400 });

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.metadata?.clerkUserId !== userId || pi.metadata?.isRetryAll !== "true") {
      return NextResponse.json({ error: "Payment does not match this account" }, { status: 403 });
    }
    const orgId = pi.metadata?.orgId;
    if (!orgId) return NextResponse.json({ error: "Missing org on payment" }, { status: 400 });
    const creditCents = Number(pi.metadata?.creditAppliedCents ?? 0);

    if (pi.status !== "succeeded" && pi.status !== "processing") {
      if (pi.metadata?.redemptionKey) await releaseReferralCredit(pi.metadata.redemptionKey);
      return NextResponse.json({ error: "Payment has not completed. Please try again." }, { status: 422 });
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { platformFeePercent: true, taxPercent: true, taxExempt: true },
    });
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
    const feePct = Number(org.platformFeePercent);
    const taxPct = org.taxExempt ? 0 : Number(org.taxPercent);

    // The lots this PI was charged for. Older PIs without the list can't be
    // matched safely, so they never settle anything here.
    const chargedIds = itemIdsFromMetadata(pi.metadata as Record<string, string>);
    if (!chargedIds || chargedIds.length === 0) {
      console.error("[retry-all confirm] PI has no lot list (made before the update) — settle by hand", { pi: pi.id, userId });
      return NextResponse.json({ error: "Your payment went through, but we couldn't match it to your lots automatically. Don't pay again: we'll sort it out and text you." }, { status: 409 });
    }
    // A PI settles once: if it's already on a payment row, there's nothing to do.
    const used = await prisma.payment.findFirst({ where: { stripePaymentIntentId: pi.id }, select: { id: true } });
    if (used) return NextResponse.json({ success: true, alreadyPaid: true });

    // The PI must be exactly what the charged lots cost (same math as the charge
    // route, with the credit and shipping it recorded), so a PI can't be swapped
    // onto other lots.
    const chargedBids = await prisma.bid.findMany({
      where: { clerkUserId: userId, status: "WON", itemId: { in: chargedIds }, item: { organizationId: orgId } },
      select: { amount: true, item: { select: { id: true, status: true } } },
    });
    const totalBid = chargedBids.reduce((sum, b) => sum + Number(b.amount), 0);
    const feeCents = Math.round(totalBid * feePct / 100 * 100);
    const taxCents = Math.round((totalBid * 100 + feeCents) * taxPct / 100);
    const shipCents = Number(pi.metadata?.shippingCents ?? 0);
    const expected = Math.round(totalBid * 100) + feeCents + taxCents - creditCents + shipCents;
    if (chargedBids.length !== chargedIds.length || expected !== pi.amount) {
      console.error("[retry-all confirm] PI does not match its lots", { pi: pi.id, expected, amount: pi.amount, lots: chargedBids.length, charged: chargedIds.length });
      return NextResponse.json({ error: "Your payment went through, but it doesn't match your lots. Don't pay again: we'll sort it out and text you." }, { status: 409 });
    }

    // Settle the charged lots that are still owed. One paid another way while
    // the 3-D Secure prompt was open was paid twice: flag it for a refund.
    const settledRows = await prisma.payment.findMany({
      where: { itemId: { in: chargedIds }, clerkUserId: userId, OR: [{ status: "PAID" }, { status: "PENDING", stripePaymentIntentId: { not: null } }] },
      select: { itemId: true },
    });
    const settledIds = new Set(settledRows.map((p) => p.itemId));
    if (settledIds.size > 0) console.error("[retry-all confirm] lots already paid, refund the overlap", { pi: pi.id, itemIds: [...settledIds] });
    const items = chargedBids
      .filter((b) => !settledIds.has(b.item.id) && (OWED_ITEM_STATUSES as readonly string[]).includes(b.item.status))
      .map((b) => ({ id: b.item.id, bid: Number(b.amount) }));

    if (items.length === 0) return NextResponse.json({ success: true, alreadyPaid: true });

    const status = pi.status === "succeeded" ? "PAID" : "PENDING";
    await settleItemsPaid(userId, items, feePct, taxPct, pi.id, creditCents, status);
    if (pi.metadata?.redemptionKey) await closeRedemption(pi.metadata.redemptionKey, pi.id);

    if (status === "PAID") {
      await autoAttachPaidItems(userId, orgId);
      await vestReferralForPayer(userId);
      notifyPaymentReceipt({
        clerkUserId: userId,
        amount: Number((pi.amount / 100).toFixed(2)),
      }).catch((e) => console.error("notifyPaymentReceipt (retry-all confirm) failed:", e));
    }

    return NextResponse.json({ success: true, processing: pi.status === "processing" });
  } catch (err) {
    console.error("[retry-payment/all/confirm POST]:", err);
    return NextResponse.json({ error: "Failed to confirm payment" }, { status: 500 });
  }
}
