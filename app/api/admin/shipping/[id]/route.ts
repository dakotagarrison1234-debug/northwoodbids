export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { shippingStation } from "@/lib/shipping/bundle";
import { refundShippingForItem, textMovedToPickup, type ShippingRefund } from "@/lib/shipping/refund";
import { fmtCents } from "@/lib/shipping/tiers";
import { requireShipAdmin, forbidden, notFound, loadBundle, serializeBundle, buyersFor, appendNote } from "../_lib";

interface Props { params: Promise<{ id: string }> }

/**
 * PATCH /api/admin/shipping/[id]
 * Body: { notes?: string; status?: "CANCELLED" }
 *
 * Notes are replaced verbatim. Cancel is only allowed while there's no label
 * (OPEN / CLOSED / PACKING). Cancelling detaches the lots from the box and
 * flips them back to Pickup so they show on the Pickup board. Paid lots get
 * their shipping refunded automatically (card: Stripe partial refund; cash:
 * noted to hand back) and the buyer is texted once; unpaid PENDING / FAILED
 * rows lose their `shippingAmount` so a retry bills items only.
 */
export async function PATCH(request: NextRequest, { params }: Props) {
  const membership = await requireShipAdmin();
  if (!membership) return forbidden();
  const orgId = membership.organizationId;
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { notes?: unknown; status?: unknown };

  const bundle = await loadBundle(id, orgId);
  if (!bundle) return notFound();

  const data: { notes?: string; status?: "CANCELLED"; closedAt?: Date; chargedCents?: { decrement: number } } = {};
  if (typeof body.notes === "string") data.notes = body.notes.slice(0, 2000);

  if (body.status !== undefined) {
    if (body.status !== "CANCELLED") return NextResponse.json({ error: "Only status CANCELLED can be set here." }, { status: 400 });
    if (bundle.labelUrl || bundle.status === "SHIPPED" || bundle.status === "DELIVERED") {
      return NextResponse.json({ error: "This box has a label. Refund the label first." }, { status: 409 });
    }
    if (bundle.status === "CANCELLED") return NextResponse.json({ error: "Already cancelled." }, { status: 409 });
    data.status = "CANCELLED";
    data.closedAt = bundle.closedAt ?? new Date();
    data.notes = appendNote(data.notes ?? bundle.notes, `Cancelled by staff; ${bundle.items.length} lot(s) moved back to Pickup.`);
  }

  // Paid lots get their shipping back BEFORE the box is touched. A Stripe
  // failure stops the cancel with the box exactly as it was (refunds already
  // made are idempotent, so a retry won't double-refund).
  const refunds = new Map<string, ShippingRefund>();
  let refundedCents = 0;
  let cashBackCents = 0;
  if (data.status === "CANCELLED") {
    for (const it of bundle.items) {
      if (!it.payments.some((p) => p.status === "PAID")) continue;
      try {
        const r = await refundShippingForItem(it.id);
        refunds.set(it.id, r);
        if (r.status === "refunded") refundedCents += r.cents;
        if (r.status === "cash") cashBackCents += r.cents;
        if (r.status === "skipped") data.notes = appendNote(data.notes, `${it.itemCode ?? "Lot"}: shipping ${fmtCents(r.cents)} NOT refunded (${r.reason}).`);
      } catch (e) {
        console.error("[admin/shipping cancel] shipping refund failed:", e);
        return NextResponse.json({ error: "Could not refund the shipping. Nothing was changed — try again." }, { status: 502 });
      }
    }
    if (refundedCents > 0) data.notes = appendNote(data.notes, `Refunded ${fmtCents(refundedCents)} shipping to their card.`);
    if (cashBackCents > 0) data.notes = appendNote(data.notes, `cash shipping to hand back ${fmtCents(cashBackCents)}`);
  }

  await prisma.$transaction(async (tx) => {
    if (data.status === "CANCELLED") {
      // No lot carries a delta into pickup: unpaid lots never collected it (a
      // retry would otherwise bill shipping for a box that no longer exists),
      // paid lots just had it refunded. The only delta that stays is one we
      // tried and failed to give back ("skipped").
      const releasable = bundle.items.filter((it) => refunds.get(it.id)?.status !== "skipped");
      const released = releasable.reduce((s, it) => s + it.shipChargeCents, 0);
      if (releasable.length > 0) {
        await tx.item.updateMany({ where: { id: { in: releasable.map((it) => it.id) }, shippingBundleId: bundle.id }, data: { shipChargeCents: 0 } });
      }
      if (released > 0) data.chargedCents = { decrement: released };
      // Unpaid rows: still owe the item, not the shipping.
      await tx.payment.updateMany({
        where: { itemId: { in: bundle.items.map((it) => it.id) }, status: { in: ["PENDING", "FAILED"] }, shippingAmount: { not: null } },
        data: { shippingAmount: null },
      });
      await tx.item.updateMany({ where: { shippingBundleId: bundle.id }, data: { shippingBundleId: null, fulfillment: "PICKUP" } });
    }
    await tx.shippingBundle.update({ where: { id: bundle.id }, data });
  });

  // One text for the whole box, only when something paid was moved.
  if (data.status === "CANCELLED" && refunds.size > 0) {
    const paidLots = bundle.items.filter((it) => refunds.has(it.id));
    const what = paidLots.length === 1
      ? (paidLots[0].itemCode ? `lot ${paidLots[0].itemCode}` : paidLots[0].title)
      : `${paidLots.length} lots`;
    await textMovedToPickup(bundle.clerkUserId, what, refundedCents + cashBackCents);
  }

  const [fresh, station, buyers] = await Promise.all([loadBundle(id, orgId), shippingStation(orgId), buyersFor([bundle.clerkUserId])]);
  return NextResponse.json({ ok: true, bundle: fresh ? serializeBundle(fresh, buyers.get(bundle.clerkUserId) ?? null, station) : null });
}
