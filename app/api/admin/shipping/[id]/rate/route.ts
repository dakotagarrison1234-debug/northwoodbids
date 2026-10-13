export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  easypostConfigured, EASYPOST_UNSET_MESSAGE, createShipment, getShipment, labelFromShipment, pickCheapestGround, isAllowedGround, rateCents, serviceLabel, easypostErrorMessage, fromAddressFor,
} from "@/lib/easypost";
import { MAX_WEIGHT_OZ } from "@/lib/shipping/tiers";
import { requireShipAdmin, forbidden, notFound, loadBundle, boxByCode } from "../../_lib";

interface Props { params: Promise<{ id: string }> }

/**
 * POST /api/admin/shipping/[id]/rate
 * Body: { boxCode: string; weightOz: number }   — what the packer actually used
 *
 * Creates the EasyPost shipment (box dims + packed weight, to the frozen ship
 * address, from the box's own warehouse), stores easypostShipmentId / packedWeightOz /
 * packedBoxCode, and returns the cheapest ground rate next to what the buyer
 * was charged. If the box already has a shipment, it's checked first: one with
 * a bought label is never replaced (409 — tap Buy label, which stores it); one
 * without a label is simply superseded by a fresh shipment.
 *
 * { ok: true,
 *   rate: { id, carrier, service, label, cents, days },
 *   chargedCents, spreadCents,            // spread = charged - label cost
 *   rates: [{ carrier, service, label, cents, days }] }   // every allowed ground rate, cheapest first
 *
 * Errors: 409 not configured / not PACKING, 422 no ground rate (carrier messages), 502 EasyPost.
 */
export async function POST(request: NextRequest, { params }: Props) {
  const membership = await requireShipAdmin();
  if (!membership) return forbidden();
  const orgId = membership.organizationId;
  const { id } = await params;
  if (!easypostConfigured()) return NextResponse.json({ error: EASYPOST_UNSET_MESSAGE }, { status: 409 });

  const body = await request.json().catch(() => ({})) as { boxCode?: unknown; weightOz?: unknown };
  const box = boxByCode(typeof body.boxCode === "string" ? body.boxCode : null);
  const weightOz = Math.round(Number(body.weightOz));
  if (!box) return NextResponse.json({ error: "Pick a box." }, { status: 400 });
  if (!Number.isFinite(weightOz) || weightOz < 1) return NextResponse.json({ error: "Enter the packed weight." }, { status: 400 });
  if (weightOz > 70 * 16) return NextResponse.json({ error: "Over 70 lb — carriers won't take it." }, { status: 400 });

  const bundle = await loadBundle(id, orgId);
  if (!bundle) return notFound();
  if (bundle.status === "SHIPPED" || bundle.status === "DELIVERED") return NextResponse.json({ error: "This box already has a label." }, { status: 409 });
  if (bundle.status !== "PACKING" && bundle.status !== "CLOSED") return NextResponse.json({ error: "This box isn't in the pack queue yet." }, { status: 409 });
  if (bundle.items.length === 0) return NextResponse.json({ error: "This box has no lots." }, { status: 409 });

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
      return NextResponse.json({ error: "This box already has a label — tap Buy label." }, { status: 409 });
    }
  }

  // Return address = the box's own warehouse (Owosso box ships from Owosso).
  const from = await fromAddressFor(orgId, bundle.locationId);
  if (!from.address) return NextResponse.json({ error: from.error }, { status: 409 });

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

    const allowed = (shipment.rates ?? []).filter(isAllowedGround)
      .map((r) => ({ id: r.id, carrier: r.carrier, service: r.service, label: serviceLabel(r.carrier, r.service), cents: rateCents(r), days: r.delivery_days ?? r.est_delivery_days ?? null }))
      .sort((a, b) => a.cents - b.cents);
    const best = pickCheapestGround(shipment.rates);
    if (!best) {
      const why = (shipment.messages ?? []).map((m) => [m.carrier, m.message].filter(Boolean).join(": ")).filter(Boolean);
      const heavy = weightOz > MAX_WEIGHT_OZ ? " Over 20 lb falls outside the ground services we buy." : "";
      return NextResponse.json({ error: `No ground rate came back.${heavy}${why.length ? ` ${why.join(" / ")}` : ""}`, rates: [] }, { status: 422 });
    }
    const cents = rateCents(best);
    return NextResponse.json({
      ok: true,
      rate: { id: best.id, carrier: best.carrier, service: best.service, label: serviceLabel(best.carrier, best.service), cents, days: best.delivery_days ?? best.est_delivery_days ?? null },
      chargedCents: bundle.chargedCents,
      spreadCents: bundle.chargedCents - cents,
      rates: allowed,
    });
  } catch (e) {
    console.error("[admin/shipping/rate]:", easypostErrorMessage(e));
    return NextResponse.json({ error: easypostErrorMessage(e) }, { status: 502 });
  }
}
