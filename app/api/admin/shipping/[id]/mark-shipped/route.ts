export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { textBuyer, shippedMessage } from "@/lib/shippingNotify";
import { shippingStation } from "@/lib/shipping/bundle";
import { requireShipAdmin, forbidden, notFound, loadBundle, serializeBundle, buyersFor, markLotsShipped, trackingUrlFor, appendNote, canShipNow, NOT_READY_MESSAGE } from "../../_lib";

interface Props { params: Promise<{ id: string }> }

/**
 * POST /api/admin/shipping/[id]/mark-shipped
 * Body: { carrier?: string; trackingCode?: string; labelCostCents?: number }
 *
 * The manual fallback when the label was bought somewhere else (Pirate Ship,
 * the counter) or EasyPost isn't configured. Status SHIPPED, lots PICKED_UP,
 * and the buyer is texted only when there's a tracking code to send.
 *
 * → { ok: true, texted: boolean, bundle }
 */
export async function POST(request: NextRequest, { params }: Props) {
  const membership = await requireShipAdmin();
  if (!membership) return forbidden();
  const orgId = membership.organizationId;
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { carrier?: unknown; trackingCode?: unknown; labelCostCents?: unknown };
  const carrier = typeof body.carrier === "string" && body.carrier.trim() ? body.carrier.trim().slice(0, 40) : null;
  const trackingCode = typeof body.trackingCode === "string" && body.trackingCode.trim() ? body.trackingCode.replace(/\s+/g, "").slice(0, 60) : null;
  const cost = Number(body.labelCostCents);
  const labelCostCents = Number.isFinite(cost) && cost >= 0 ? Math.round(cost) : null;

  const bundle = await loadBundle(id, orgId);
  if (!bundle) return notFound();
  if (bundle.status === "SHIPPED" || bundle.status === "DELIVERED") return NextResponse.json({ error: "Already shipped." }, { status: 409 });
  if (!canShipNow(bundle, await shippingStation(orgId))) return NextResponse.json({ error: NOT_READY_MESSAGE }, { status: 409 });

  const trackingUrl = trackingUrlFor(carrier, trackingCode);
  await prisma.shippingBundle.update({
    where: { id: bundle.id },
    data: {
      status: "SHIPPED",
      shippedAt: new Date(),
      packedBy: membership.clerkUserId,
      carrier,
      service: null,
      trackingCode,
      trackingUrl,
      labelCostCents,
      lastTrackingStatus: trackingCode ? "pre_transit" : null,
      notes: appendNote(bundle.notes, `Marked shipped by hand${carrier ? ` via ${carrier}` : ""}${trackingCode ? `, tracking ${trackingCode}` : ", no tracking"}.`),
    },
  });
  await markLotsShipped(bundle.id);

  const texted = trackingCode
    ? await textBuyer(bundle.clerkUserId, "shipping_shipped", shippedMessage({ carrier, trackingCode, trackingUrl }))
    : false;

  const [fresh, station, buyers] = await Promise.all([loadBundle(id, orgId), shippingStation(orgId), buyersFor([bundle.clerkUserId])]);
  return NextResponse.json({ ok: true, texted, bundle: fresh ? serializeBundle(fresh, buyers.get(bundle.clerkUserId) ?? null, station) : null });
}
