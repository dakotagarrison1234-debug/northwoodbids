export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  easypostConfigured, EASYPOST_UNSET_MESSAGE, getShipment, rerateShipment, pickCheapestGround, buyShipment, easypostErrorMessage, serviceLabel,
  type BoughtLabel,
} from "@/lib/easypost";
import { textBuyer, shippedMessage } from "@/lib/shippingNotify";
import { shippingStation } from "@/lib/shipping/bundle";
import { requireShipAdmin, forbidden, notFound, loadBundle, serializeBundle, buyersFor, markLotsShipped, appendNote, canShipNow, NOT_READY_MESSAGE } from "../../_lib";

interface Props { params: Promise<{ id: string }> }

/**
 * POST /api/admin/shipping/[id]/buy — buy the cheapest ground rate on the
 * shipment created by /rate. No body.
 *
 * Stores labelCostCents / carrier / service / trackingCode / trackingUrl /
 * labelUrl / easypostTrackerId, status SHIPPED + shippedAt + packedBy, marks
 * the lots PICKED_UP (they leave every pickup list) and texts the buyer the
 * tracking link. Idempotent: a box that's already SHIPPED returns its label.
 *
 * → { ok: true, label: { labelUrl, trackingCode, trackingUrl, carrier, service, serviceLabel, costCents },
 *     chargedCents, spreadCents, texted: boolean, bundle }
 */
export async function POST(_request: NextRequest, { params }: Props) {
  const membership = await requireShipAdmin();
  if (!membership) return forbidden();
  const orgId = membership.organizationId;
  const { id } = await params;

  const bundle = await loadBundle(id, orgId);
  if (!bundle) return notFound();

  const respond = async (label: BoughtLabel, texted: boolean) => {
    const [fresh, station, buyers] = await Promise.all([loadBundle(id, orgId), shippingStation(orgId), buyersFor([bundle.clerkUserId])]);
    return NextResponse.json({
      ok: true,
      label: { ...label, serviceLabel: serviceLabel(label.carrier, label.service) },
      chargedCents: bundle.chargedCents,
      spreadCents: bundle.chargedCents - label.costCents,
      texted,
      bundle: fresh ? serializeBundle(fresh, buyers.get(bundle.clerkUserId) ?? null, station) : null,
    });
  };

  // Already done — hand back what we have (double tap, retry after a timeout).
  if ((bundle.status === "SHIPPED" || bundle.status === "DELIVERED") && bundle.labelUrl && bundle.trackingCode) {
    return respond({
      shipmentId: bundle.easypostShipmentId ?? "",
      labelUrl: bundle.labelUrl,
      trackingCode: bundle.trackingCode,
      trackingUrl: bundle.trackingUrl,
      trackerId: bundle.easypostTrackerId,
      carrier: bundle.carrier ?? "",
      service: bundle.service ?? "",
      costCents: bundle.labelCostCents ?? 0,
    }, false);
  }

  if (!easypostConfigured()) return NextResponse.json({ error: EASYPOST_UNSET_MESSAGE }, { status: 409 });
  if (!canShipNow(bundle, await shippingStation(orgId))) return NextResponse.json({ error: NOT_READY_MESSAGE }, { status: 409 });
  if (!bundle.easypostShipmentId) return NextResponse.json({ error: "Get a rate first." }, { status: 409 });

  let label: BoughtLabel;
  try {
    const shipment = await getShipment(bundle.easypostShipmentId);
    if (shipment.postage_label?.label_url && shipment.tracking_code && shipment.selected_rate) {
      // Bought on a previous attempt that died before we saved — don't buy twice.
      label = await buyShipment(shipment.id, shipment.selected_rate.id);
    } else {
      let rates = shipment.rates ?? [];
      if (rates.length === 0) rates = await rerateShipment(shipment.id);
      const best = pickCheapestGround(rates);
      if (!best) return NextResponse.json({ error: "No ground rate on this shipment. Get a rate again." }, { status: 422 });
      label = await buyShipment(shipment.id, best.id);
    }
  } catch (e) {
    console.error("[admin/shipping/buy]:", easypostErrorMessage(e));
    return NextResponse.json({ error: easypostErrorMessage(e) }, { status: 502 });
  }

  await prisma.shippingBundle.update({
    where: { id: bundle.id },
    data: {
      status: "SHIPPED",
      shippedAt: new Date(),
      packedBy: membership.clerkUserId,
      labelCostCents: label.costCents,
      carrier: label.carrier,
      service: label.service,
      trackingCode: label.trackingCode,
      trackingUrl: label.trackingUrl,
      labelUrl: label.labelUrl,
      easypostTrackerId: label.trackerId,
      lastTrackingStatus: "pre_transit",
    },
  });
  await markLotsShipped(bundle.id);

  const texted = await textBuyer(bundle.clerkUserId, "shipping_shipped", shippedMessage({ carrier: label.carrier, service: label.service, trackingCode: label.trackingCode, trackingUrl: label.trackingUrl }));
  if (!texted) {
    await prisma.shippingBundle.update({ where: { id: bundle.id }, data: { notes: appendNote(bundle.notes, "Shipped text did not send (no phone or SMS webhook unset).") } }).catch(() => {});
  }
  return respond(label, texted);
}
