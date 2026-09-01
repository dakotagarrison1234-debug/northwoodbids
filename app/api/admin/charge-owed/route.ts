export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { type OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";
import { autoAttachPaidItems } from "@/lib/pickup";
import { notifyPaymentReceipt } from "@/lib/paymentNotify";
import { vestReferralForPayer, reserveReferralCredit, releaseReferralCredit } from "@/lib/referral";
import { settleItemsPaid } from "@/lib/settlePayments";
import { claimItemsForCharge, releaseChargeClaims } from "@/lib/chargeGuard";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * POST /api/admin/charge-owed  { clerkUserId }
 *
 * Admin-initiated retry of a customer's outstanding balance: charges everything
 * they've won but not paid (FAILED / never-charged) in ONE off_session
 * PaymentIntent against the card on file. The customer isn't present, so a card
 * that needs 3DS can't be completed here — we report that back so you can ask them
 * to pay from their dashboard instead.
 */
export async function POST(request: NextRequest) {
  let claimedIds: string[] = [];
  let claimedUser = "";
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Charging a customer's card is an owner/admin action — not for Staff.
    if (!(await requireRole(membership.organizationId, ["OWNER", "ADMIN"] as OrgRole[]))) {
      return NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 });
    }
    const orgId = membership.organizationId;

    const { clerkUserId } = await request.json();
    if (!clerkUserId) return NextResponse.json({ error: "clerkUserId required" }, { status: 400 });
    claimedUser = clerkUserId;

    const wonBids = await prisma.bid.findMany({
      where: { clerkUserId, status: "WON", item: { organizationId: orgId } },
      select: { amount: true, item: { select: { id: true, status: true } } },
    });
    if (wonBids.length === 0) return NextResponse.json({ error: "This bidder has no wins." }, { status: 404 });

    const itemIds = wonBids.map((b) => b.item.id);
    const settled = await prisma.payment.findMany({
      where: { itemId: { in: itemIds }, clerkUserId, status: { in: ["PAID", "PENDING"] } },
      select: { itemId: true },
    });
    const settledIds = new Set(settled.map((p) => p.itemId));
    const candidates = wonBids
      .filter((b) => !settledIds.has(b.item.id))
      .map((b) => ({ id: b.item.id, bid: Number(b.amount) }));
    if (candidates.length === 0) return NextResponse.json({ error: "Nothing outstanding — already paid." }, { status: 409 });

    // Claim the items (per-user lock) so we can't race the customer's own payment.
    const items = await claimItemsForCharge(clerkUserId, candidates);
    if (items.length === 0) return NextResponse.json({ error: "Nothing outstanding — already paid." }, { status: 409 });
    claimedIds = items.map((i) => i.id);

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { platformFeePercent: true, taxPercent: true, taxExempt: true },
    });
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
    const feePct = Number(org.platformFeePercent);
    const taxPct = org.taxExempt ? 0 : Number(org.taxPercent);

    const bidderCustomer = await prisma.bidderStripeCustomer.findUnique({
      where: { clerkUserId_organizationId: { clerkUserId, organizationId: orgId } },
    });
    if (!bidderCustomer?.defaultPaymentMethodId) {
      return NextResponse.json({ error: "No card on file for this bidder — they'll need to add one and pay." }, { status: 422 });
    }

    const totalBid = items.reduce((s, i) => s + i.bid, 0);
    const feeCents = Math.round(totalBid * feePct / 100 * 100);
    const taxCents = Math.round((totalBid * 100 + feeCents) * taxPct / 100);
    const chargeCents = Math.round(totalBid * 100) + feeCents + taxCents;

    const redemptionKey = `retryall-${orgId}-${clerkUserId}`;
    const discountCents = await reserveReferralCredit(clerkUserId, chargeCents, redemptionKey);
    const netCents = chargeCents - discountCents;

    if (discountCents > 0 && netCents <= 0) {
      await settleItemsPaid(clerkUserId, items, feePct, taxPct, null, discountCents);
      await autoAttachPaidItems(clerkUserId, orgId);
      await vestReferralForPayer(clerkUserId);
      return NextResponse.json({ success: true, paid: items.length, coveredByCredit: true });
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
          metadata: { clerkUserId, orgId, isAdminCharge: "true", redemptionKey, creditAppliedCents: String(discountCents) },
        },
        { idempotencyKey: `admincharge-${orgId}-${clerkUserId}-${bidderCustomer.defaultPaymentMethodId}` }
      );
    } catch (err: unknown) {
      if (discountCents > 0) await releaseReferralCredit(redemptionKey);
      await releaseChargeClaims(clerkUserId, claimedIds); claimedIds = [];
      // Off-session cards that need authentication can't be completed by staff.
      if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "authentication_required") {
        return NextResponse.json({ error: "Their card needs the customer to approve it (3-D Secure). Ask them to pay from their dashboard." }, { status: 422 });
      }
      if (typeof err === "object" && err !== null && "type" in err && (err as { type: string }).type === "StripeCardError") {
        return NextResponse.json({ error: (err as { message?: string }).message ?? "Card declined." }, { status: 422 });
      }
      throw err;
    }

    if (pi.status === "succeeded" || pi.status === "processing") {
      const paidStatus = pi.status === "succeeded" ? "PAID" : "PENDING";
      await settleItemsPaid(clerkUserId, items, feePct, taxPct, pi.id, discountCents, paidStatus);
      if (paidStatus === "PAID") {
        await autoAttachPaidItems(clerkUserId, orgId);
        await vestReferralForPayer(clerkUserId);
        notifyPaymentReceipt({ clerkUserId, amount: Number((netCents / 100).toFixed(2)) }).catch((e) =>
          console.error("notifyPaymentReceipt (admin charge) failed:", e)
        );
      }
      return NextResponse.json({ success: true, paid: items.length, processing: pi.status === "processing", amount: netCents / 100 });
    }

    if (discountCents > 0) await releaseReferralCredit(redemptionKey);
    await releaseChargeClaims(clerkUserId, claimedIds); claimedIds = [];
    return NextResponse.json({ error: "Charge didn't complete. Try again or ask them to pay from their dashboard." }, { status: 422 });
  } catch (error) {
    // Any thrown failure means we didn't capture — free the claim so it stays owed.
    if (claimedUser && claimedIds.length) {
      await releaseChargeClaims(claimedUser, claimedIds).catch(() => {});
    }
    console.error("[admin/charge-owed POST]:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
