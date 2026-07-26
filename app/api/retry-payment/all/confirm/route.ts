import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { autoAttachPaidItems } from "@/lib/pickup";
import { notifyPaymentReceipt } from "@/lib/paymentNotify";
import { vestReferralForPayer, releaseReferralCredit } from "@/lib/referral";
import { settleItemsPaid } from "@/lib/settlePayments";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * POST /api/retry-payment/all/confirm
 * Body: { paymentIntentId: string }
 *
 * Called after the client completes 3DS for a batch "pay all". Verifies the PI
 * with Stripe, then settles the user's still-unpaid won items for that org. The
 * item set is recomputed here (not trusted from the client) — it's the same set
 * that was charged seconds earlier.
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

    // Recompute the unpaid won items for this org (same set that was charged).
    const wonBids = await prisma.bid.findMany({
      where: { clerkUserId: userId, status: "WON", item: { organizationId: orgId } },
      select: { amount: true, item: { select: { id: true } } },
    });
    const ids = wonBids.map((b) => b.item.id);
    const settledRows = await prisma.payment.findMany({
      where: { itemId: { in: ids }, clerkUserId: userId, status: { in: ["PAID", "PENDING"] } },
      select: { itemId: true },
    });
    const settledIds = new Set(settledRows.map((p) => p.itemId));
    const items = wonBids
      .filter((b) => !settledIds.has(b.item.id))
      .map((b) => ({ id: b.item.id, bid: Number(b.amount) }));

    if (items.length === 0) return NextResponse.json({ success: true, alreadyPaid: true });

    const status = pi.status === "succeeded" ? "PAID" : "PENDING";
    await settleItemsPaid(userId, items, feePct, taxPct, pi.id, creditCents, status);

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
