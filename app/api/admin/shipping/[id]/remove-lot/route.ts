export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { leaveBundle, shippingStation } from "@/lib/shipping/bundle";
import { refundShippingForItem, textMovedToPickup, type ShippingRefund } from "@/lib/shipping/refund";
import { fmtCents } from "@/lib/shipping/tiers";
import { requireShipAdmin, forbidden, notFound, loadBundle, serializeBundle, buyersFor, appendNote } from "../../_lib";

interface Props { params: Promise<{ id: string }> }

/**
 * POST /api/admin/shipping/[id]/remove-lot
 * Body: { itemId: string }
 *
 * Pull ONE lot out of a box that has no label yet and hand it to the normal
 * pickup pipeline — the fix for a box stuck in Waiting on a lot the buyer never
 * paid for, or a lot that turned out not to ship.
 *
 * - `leaveBundle` semantics: the lot is detached, the box is re-weighed and
 *   re-snapped, and the lot's delta comes off `chargedCents` only while it was
 *   refundable (no label). An emptied box is CANCELLED.
 * - The lot's fulfillment becomes PICKUP, so it shows on the buyer's pickup
 *   list and the admin Pickup board like any other win.
 * - Money: a PAID lot's shipping is refunded automatically (card: Stripe
 *   partial refund; cash: noted on the box to hand back) and the buyer is
 *   texted once. An UNPAID lot keeps its PENDING / FAILED Payment row — the
 *   buyer still owes the item — but no longer owes shipping:
 *   `Item.shipChargeCents` is 0 (leaveBundle) and the row's `shippingAmount`
 *   is nulled so a retry bills items only.
 *
 * → { ok: true, refundedCents, bundle }   (bundle.status === "CANCELLED" when the box emptied)
 */
export async function POST(request: NextRequest, { params }: Props) {
  const membership = await requireShipAdmin();
  if (!membership) return forbidden();
  const orgId = membership.organizationId;
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { itemId?: unknown };
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  const bundle = await loadBundle(id, orgId);
  if (!bundle) return notFound();
  if (bundle.labelUrl || bundle.status === "SHIPPED" || bundle.status === "DELIVERED") {
    return NextResponse.json({ error: "This box has a label. Refund the label first." }, { status: 409 });
  }
  if (bundle.status === "CANCELLED") return NextResponse.json({ error: "This box was cancelled." }, { status: 409 });
  const lot = bundle.items.find((it) => it.id === itemId);
  if (!lot) return NextResponse.json({ error: "That lot isn't in this box." }, { status: 404 });

  const paid = lot.payments.some((p) => p.status === "PAID");

  // A paid lot gets its shipping back BEFORE it leaves the box — if Stripe
  // says no, stop here and leave the box exactly as it was.
  let refund: ShippingRefund | null = null;
  if (paid) {
    try {
      refund = await refundShippingForItem(itemId);
    } catch (e) {
      console.error("[admin/shipping/remove-lot] shipping refund failed:", e);
      return NextResponse.json({ error: "Could not refund the shipping. Nothing was changed — try again." }, { status: 502 });
    }
  }

  // Detach + re-weigh (+ cancel the box if it's now empty). The delta only
  // comes off chargedCents when the money isn't ours to keep.
  await leaveBundle(itemId, refund?.status === "skipped" ? { refunded: false } : {});

  const moneyNote = !paid
    ? "unpaid; shipping dropped from what they owe"
    : refund?.status === "refunded"
    ? `refunded ${fmtCents(refund.cents)} shipping to their card`
    : refund?.status === "cash"
    ? `cash shipping to hand back ${fmtCents(refund.cents)}`
    : refund?.status === "skipped"
    ? `shipping ${fmtCents(refund.cents)} NOT refunded: ${refund.reason}`
    : "no shipping to refund";

  await prisma.$transaction(async (tx) => {
    // leaveBundle leaves fulfillment null; pin it to PICKUP so the lot flows
    // into the pickup lists (they filter on shippingBundleId: null + fulfillment).
    await tx.item.update({ where: { id: itemId }, data: { fulfillment: "PICKUP", shipChargeCents: 0 } });
    if (!paid) {
      // Still owes the item, not the shipping.
      await tx.payment.updateMany({
        where: { itemId, status: { in: ["PENDING", "FAILED"] }, shippingAmount: { not: null } },
        data: { shippingAmount: null },
      });
    }
    await tx.shippingBundle.update({
      where: { id: bundle.id },
      data: { notes: appendNote(bundle.notes, `${lot.itemCode ?? "Lot"} moved to pickup by staff (${moneyNote}).`) },
    });
  });

  // One text, only when something was actually paid and given back (or handed back).
  const refundedCents = refund && (refund.status === "refunded" || refund.status === "cash") ? refund.cents : 0;
  if (paid) await textMovedToPickup(bundle.clerkUserId, lot.itemCode ? `lot ${lot.itemCode}` : lot.title, refundedCents);

  const [fresh, station, buyers] = await Promise.all([loadBundle(id, orgId), shippingStation(orgId), buyersFor([bundle.clerkUserId])]);
  return NextResponse.json({ ok: true, refundedCents, bundle: fresh ? serializeBundle(fresh, buyers.get(bundle.clerkUserId) ?? null, station) : null });
}
