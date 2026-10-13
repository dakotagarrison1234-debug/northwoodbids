import { prisma } from "@/lib/prisma";
import {
  easypostConfigured, EASYPOST_UNSET_MESSAGE, createShipment, getShipment, rerateShipment, labelFromShipment, pickCheapestGround, isAllowedGround, rateCents, serviceLabel, buyShipment, easypostErrorMessage, fromAddressFor,
  type BoughtLabel,
} from "@/lib/easypost";
import { MAX_WEIGHT_OZ } from "@/lib/shipping/tiers";
import { shippingStation } from "@/lib/shipping/bundle";
import { textBuyer, shippedMessage } from "@/lib/shippingNotify";
import { loadBundle, boxByCode, serializeBundle, buyersFor, markLotsShipped, appendNote, canShipNow, NOT_READY_MESSAGE, type LoadedBundle, type SerializedBundle } from "./_lib";

/**
 * The two EasyPost actions on one box — rate (create the shipment) and buy
 * (buy its cheapest ground rate). The single-box routes under [id]/ and the
 * bulk route call these; the routes only do auth + parsing + NextResponse.
 *
 * Each returns { ok, status, body }: status is the HTTP status the single-box
 * route sends, body is exactly its JSON; ok is true only on 200.
 */

export type RateView = { id: string; carrier: string; service: string; label: string; cents: number; days: number | null };
export type RateOk = { ok: true; rate: RateView; chargedCents: number; spreadCents: number; rates: RateView[] };
export type RateErr = { error: string; rates?: never[] };
export type RateOutcome = { ok: true; status: 200; body: RateOk } | { ok: false; status: number; body: RateErr };

export type BuyOk = {
  ok: true;
  label: BoughtLabel & { serviceLabel: string };
  chargedCents: number;
  spreadCents: number;
  texted: boolean;
  bundle: SerializedBundle | null;
};
export type BuyErr = { error: string };
export type BuyOutcome = { ok: true; status: 200; body: BuyOk } | { ok: false; status: number; body: BuyErr };

const MAX_CARRIER_OZ = 70 * 16;

/** Validate what the packer typed. Returns the box + weight, or the 400 message. */
export function parseRateInput(input: { boxCode?: unknown; weightOz?: unknown }): { boxCode: string; weightOz: number } | { error: string } {
  const box = boxByCode(typeof input.boxCode === "string" ? input.boxCode : null);
  const weightOz = Math.round(Number(input.weightOz));
  if (!box) return { error: "Pick a box." };
  if (!Number.isFinite(weightOz) || weightOz < 1) return { error: "Enter the packed weight." };
  if (weightOz > MAX_CARRIER_OZ) return { error: "Over 70 lb — carriers won't take it." };
  return { boxCode: box.code, weightOz };
}

/**
 * Create (or replace) the EasyPost shipment for a box with the given dims +
 * weight, store easypostShipmentId / packedWeightOz / packedBoxCode, and return
 * the cheapest ground rate next to what the buyer was charged. A shipment whose
 * label was already bought is never replaced (409 — Buy label stores it); one
 * without a label is superseded by a fresh shipment.
 */
export async function rateBundle(bundle: LoadedBundle, input: { boxCode: string; weightOz: number }, orgId: string): Promise<RateOutcome> {
  if (!easypostConfigured()) return { ok: false, status: 409, body: { error: EASYPOST_UNSET_MESSAGE } };
  const parsed = parseRateInput(input);
  if ("error" in parsed) return { ok: false, status: 400, body: { error: parsed.error } };
  const box = boxByCode(parsed.boxCode)!;
  const weightOz = parsed.weightOz;

  if (bundle.status === "SHIPPED" || bundle.status === "DELIVERED") return { ok: false, status: 409, body: { error: "This box already has a label." } };
  if (bundle.status !== "PACKING" && bundle.status !== "CLOSED") return { ok: false, status: 409, body: { error: "This box isn't in the pack queue yet." } };
  if (bundle.items.length === 0) return { ok: false, status: 409, body: { error: "This box has no lots." } };

  // A shipment we already made: if its label was bought (a Buy that died before
  // we saved), don't create another — keep the label and send them to Buy label.
  if (bundle.easypostShipmentId) {
    let existing: Awaited<ReturnType<typeof getShipment>> | null = null;
    try {
      existing = await getShipment(bundle.easypostShipmentId);
    } catch (e) {
      // Gone / refunded / unreachable: fall through and make a fresh one.
      console.warn("[admin/shipping/rate] couldn't read existing shipment:", easypostErrorMessage(e));
    }
    const label = existing?.postage_label ? labelFromShipment(existing) : null;
    if (existing?.postage_label) {
      if (label && !bundle.labelUrl) {
        await prisma.shippingBundle.update({
          where: { id: bundle.id },
          data: {
            labelCostCents: label.costCents, carrier: label.carrier, service: label.service,
            trackingCode: label.trackingCode, trackingUrl: label.trackingUrl, labelUrl: label.labelUrl, easypostTrackerId: label.trackerId,
          },
        });
      }
      return { ok: false, status: 409, body: { error: "This box already has a label — tap Buy label." } };
    }
  }

  // Return address = the box's own warehouse (Owosso box ships from Owosso).
  const from = await fromAddressFor(orgId, bundle.locationId);
  if (!from.address) return { ok: false, status: 409, body: { error: from.error ?? "No return address." } };

  try {
    const shipment = await createShipment({
      from: from.address,
      to: {
        name: bundle.shipName,
        street1: bundle.shipStreet1,
        street2: bundle.shipStreet2,
        city: bundle.shipCity,
        state: bundle.shipState,
        zip: bundle.shipZip,
        phone: bundle.shipPhone ?? from.address.phone ?? null,
        country: "US",
        residential: true,
      },
      parcel: { length: box.dims.l, width: box.dims.w, height: box.dims.h, weightOz },
      reference: bundle.id,
    });

    await prisma.shippingBundle.update({
      where: { id: bundle.id },
      data: { easypostShipmentId: shipment.id, packedWeightOz: weightOz, packedBoxCode: box.code },
    });

    const allowed: RateView[] = (shipment.rates ?? []).filter(isAllowedGround)
      .map((r) => ({ id: r.id, carrier: r.carrier, service: r.service, label: serviceLabel(r.carrier, r.service), cents: rateCents(r), days: r.delivery_days ?? r.est_delivery_days ?? null }))
      .sort((a, b) => a.cents - b.cents);
    const best = pickCheapestGround(shipment.rates);
    if (!best) {
      const why = (shipment.messages ?? []).map((m) => [m.carrier, m.message].filter(Boolean).join(": ")).filter(Boolean);
      const heavy = weightOz > MAX_WEIGHT_OZ ? " Over 20 lb falls outside the ground services we buy." : "";
      return { ok: false, status: 422, body: { error: `No ground rate came back.${heavy}${why.length ? ` ${why.join(" / ")}` : ""}`, rates: [] } };
    }
    const cents = rateCents(best);
    return {
      ok: true,
      status: 200,
      body: {
        ok: true,
        rate: { id: best.id, carrier: best.carrier, service: best.service, label: serviceLabel(best.carrier, best.service), cents, days: best.delivery_days ?? best.est_delivery_days ?? null },
        chargedCents: bundle.chargedCents,
        spreadCents: bundle.chargedCents - cents,
        rates: allowed,
      },
    };
  } catch (e) {
    console.error("[admin/shipping/rate]:", easypostErrorMessage(e));
    return { ok: false, status: 502, body: { error: easypostErrorMessage(e) } };
  }
}

/**
 * Buy the cheapest ground rate on the shipment /rate created. Stores the label
 * + tracking, flips the box to SHIPPED (packedBy = who tapped), marks its lots
 * PICKED_UP and texts the buyer. Idempotent: a box that's already SHIPPED hands
 * back the label it has.
 */
export async function buyBundle(bundle: LoadedBundle, orgId: string, packedBy: string): Promise<BuyOutcome> {
  const respond = async (label: BoughtLabel, texted: boolean): Promise<BuyOutcome> => {
    const [fresh, station, buyers] = await Promise.all([loadBundle(bundle.id, orgId), shippingStation(orgId), buyersFor([bundle.clerkUserId])]);
    return {
      ok: true,
      status: 200,
      body: {
        ok: true,
        label: { ...label, serviceLabel: serviceLabel(label.carrier, label.service) },
        chargedCents: bundle.chargedCents,
        spreadCents: bundle.chargedCents - label.costCents,
        texted,
        bundle: fresh ? serializeBundle(fresh, buyers.get(bundle.clerkUserId) ?? null, station) : null,
      },
    };
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

  if (!easypostConfigured()) return { ok: false, status: 409, body: { error: EASYPOST_UNSET_MESSAGE } };
  if (!canShipNow(bundle, await shippingStation(orgId))) return { ok: false, status: 409, body: { error: NOT_READY_MESSAGE } };
  if (!bundle.easypostShipmentId) return { ok: false, status: 409, body: { error: "Get a rate first." } };

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
      if (!best) return { ok: false, status: 422, body: { error: "No ground rate on this shipment. Get a rate again." } };
      label = await buyShipment(shipment.id, best.id);
    }
  } catch (e) {
    console.error("[admin/shipping/buy]:", easypostErrorMessage(e));
    return { ok: false, status: 502, body: { error: easypostErrorMessage(e) } };
  }

  await prisma.shippingBundle.update({
    where: { id: bundle.id },
    data: {
      status: "SHIPPED",
      shippedAt: new Date(),
      packedBy,
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
