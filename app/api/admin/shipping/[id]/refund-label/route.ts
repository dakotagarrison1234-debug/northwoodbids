export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { easypostConfigured, refundShipment, easypostErrorMessage, serviceLabel } from "@/lib/easypost";
import { shippingStation } from "@/lib/shipping/bundle";
import { requireShipAdmin, forbidden, notFound, loadBundle, serializeBundle, buyersFor, markLotsUnshipped, appendNote } from "../../_lib";

interface Props { params: Promise<{ id: string }> }

/**
 * POST /api/admin/shipping/[id]/refund-label — void the label (EasyPost refund),
 * clear every label field, put the box back in the pack queue and the lots back
 * on PENDING_PICKUP. A manually marked shipment (no EasyPost shipment) just
 * reopens. Postage refunds take USPS up to ~2 weeks; UPS voids immediately.
 *
 * → { ok: true, refundStatus: string | null, bundle }
 */
export async function POST(_request: NextRequest, { params }: Props) {
  const membership = await requireShipAdmin();
  if (!membership) return forbidden();
  const orgId = membership.organizationId;
  const { id } = await params;

  const bundle = await loadBundle(id, orgId);
  if (!bundle) return notFound();
  if (bundle.status !== "SHIPPED" && bundle.status !== "DELIVERED") return NextResponse.json({ error: "This box hasn't shipped." }, { status: 409 });
  if (bundle.status === "DELIVERED") return NextResponse.json({ error: "This box was delivered — nothing to refund." }, { status: 409 });
  // Carriers only refund labels they never scanned (USPS ~30 days, UPS voids):
  // once tracking has moved past pre-transit the postage is gone.
  const scan = bundle.lastTrackingStatus;
  if (scan !== null && scan !== "unknown" && scan !== "pre_transit") {
    return NextResponse.json({ error: "Already scanned by the carrier — can't refund." }, { status: 409 });
  }

  let refundStatus: string | null = null;
  if (bundle.easypostShipmentId && bundle.labelUrl) {
    if (!easypostConfigured()) return NextResponse.json({ error: "EASYPOST_API_KEY is not set, so the label can't be refunded from here." }, { status: 409 });
    try {
      refundStatus = (await refundShipment(bundle.easypostShipmentId)).refundStatus;
    } catch (e) {
      console.error("[admin/shipping/refund-label]:", easypostErrorMessage(e));
      return NextResponse.json({ error: easypostErrorMessage(e) }, { status: 502 });
    }
  }

  const line = bundle.labelUrl
    ? `Label refunded (${bundle.carrier && bundle.service ? serviceLabel(bundle.carrier, bundle.service) : "label"} ${bundle.trackingCode ?? ""}, $${((bundle.labelCostCents ?? 0) / 100).toFixed(2)}; EasyPost refund ${refundStatus ?? "requested"}).`
    : `Unshipped (was marked shipped by hand${bundle.trackingCode ? `, tracking ${bundle.trackingCode}` : ""}).`;

  await prisma.shippingBundle.update({
    where: { id: bundle.id },
    data: {
      status: "PACKING",
      shippedAt: null,
      deliveredAt: null,
      labelCostCents: null,
      carrier: null,
      service: null,
      trackingCode: null,
      trackingUrl: null,
      labelUrl: null,
      easypostShipmentId: null, // a refunded shipment can't be re-bought; Get rate makes a new one
      easypostTrackerId: null,
      lastTrackingStatus: null,
      notes: appendNote(bundle.notes, line),
    },
  });
  await markLotsUnshipped(bundle.id);

  const [fresh, station, buyers] = await Promise.all([loadBundle(id, orgId), shippingStation(orgId), buyersFor([bundle.clerkUserId])]);
  return NextResponse.json({ ok: true, refundStatus, bundle: fresh ? serializeBundle(fresh, buyers.get(bundle.clerkUserId) ?? null, station) : null });
}
