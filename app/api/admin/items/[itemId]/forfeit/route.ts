export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma, type OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";
import { releaseReferralCredit } from "@/lib/referral";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * POST /api/admin/items/[itemId]/forfeit
 *
 * Forfeit a won item — the two real-world cases:
 *  1. NON-PAYER: the buyer never paid (their charge is PENDING/FAILED). Nothing to
 *     refund; we void the outstanding row (so they drop off "who owes you") and free
 *     the item to be re-listed and sold again.
 *  2. PAID BUT BROKEN/RETURNED: the buyer paid. We refund ONLY this item's exact
 *     share of the charge — bid + buyer's premium + tax − any Bid Bucks — as a PARTIAL
 *     refund (never the whole PaymentIntent, which may cover their other items), restore
 *     any Bid Bucks used, and free the item to be re-listed.
 *
 * Either way the item ends UNSOLD, detached from any pickup appointment/transfer.
 * Owner/Admin only, org-scoped.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const { itemId } = await params;

    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await requireRole(membership.organizationId, ["OWNER", "ADMIN"] as OrgRole[]))) {
      return NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 });
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { id: true, organizationId: true, status: true, title: true },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    if (item.organizationId !== membership.organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const forfeitable = ["SOLD", "PENDING_PICKUP", "PICKED_UP"];
    if (!forfeitable.includes(item.status)) {
      return NextResponse.json(
        { error: "Only a won/sold item can be forfeited." },
        { status: 409 }
      );
    }

    // The winner's payment for THIS item (unique per item+bidder; at most one).
    const payment = await prisma.payment.findFirst({
      where: { itemId },
      orderBy: { createdAt: "desc" },
    });

    let refundedCents = 0;
    let creditReleased = false;
    const paidInCash = !!payment?.paidInCash;

    if (payment && payment.status === "PAID") {
      // This item's exact share of the (possibly multi-item) charge.
      refundedCents = Math.round(
        (Number(payment.amount) +
          Number(payment.applicationFeeAmount ?? 0) +
          Number(payment.taxAmount ?? 0) -
          Number(payment.creditApplied ?? 0)) *
          100
      );

      if (refundedCents > 0) {
        if (payment.stripePaymentIntentId) {
          // Card charge — refund this item's share back to their card.
          try {
            await stripe.refunds.create({
              payment_intent: payment.stripePaymentIntentId,
              amount: refundedCents, // partial: this item's share only
            });
          } catch (err) {
            console.error("[forfeit] Stripe refund failed:", err);
            return NextResponse.json({ error: "Could not process the refund. Please try again." }, { status: 502 });
          }
        } else if (paidInCash) {
          // Cash payment — nothing to send through Stripe. The admin hands the cash
          // back in person; we just record the reversal + free the item below.
        } else {
          return NextResponse.json(
            { error: "This item is marked paid but has no card charge on record to refund." },
            { status: 400 }
          );
        }
      }
      // refundedCents === 0 → fully covered by Bid Bucks; just restore the coupon below.

      // Restore Bid Bucks: delete the original redemption (via its key in the PI
      // metadata) so the balance AND the spend record are both corrected; else a
      // compensating credit row.
      if (Number(payment.creditApplied ?? 0) > 0 && payment.stripePaymentIntentId) {
        try {
          const pi = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
          const key = pi.metadata?.redemptionKey;
          if (key) {
            await releaseReferralCredit(key);
            creditReleased = true;
          }
        } catch (e) {
          console.error("[forfeit] credit key lookup failed:", e);
        }
      }
    }

    // ── Persist everything atomically ──
    const ops: Prisma.PrismaPromise<unknown>[] = [];

    if (payment) {
      if (payment.status === "PAID") {
        ops.push(prisma.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } }));
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
      } else {
        // Non-payer (PENDING/FAILED) — no charge to reverse; drop the owed row so they
        // clear "who owes you". Nothing was ever collected, so no record to keep.
        ops.push(prisma.payment.delete({ where: { id: payment.id } }));
      }
    }

    // Free the item to be re-listed and detach it from any pickup/transfer it rode on.
    ops.push(
      prisma.item.update({
        where: { id: item.id },
        data: { status: "UNSOLD", pickupAppointmentId: null, transferRequestId: null },
      })
    );

    await prisma.$transaction(ops);

    const refunded = refundedCents / 100;
    const message =
      payment?.status !== "PAID"
        ? "No payment was collected — item freed to relist."
        : paidInCash
        ? `Hand back $${refunded.toFixed(2)} in cash — item freed to relist.`
        : `Refunded $${refunded.toFixed(2)} to their card and freed the item to relist.`;

    return NextResponse.json({
      success: true,
      refunded,
      wasPaid: payment?.status === "PAID",
      cash: paidInCash,
      message,
    });
  } catch (error) {
    console.error("[admin/items/[itemId]/forfeit POST]:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
