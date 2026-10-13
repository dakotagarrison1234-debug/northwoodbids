export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyEasyPostWebhook } from "@/lib/easypost";
import { textBuyer, OUT_FOR_DELIVERY_MESSAGE, DELIVERED_MESSAGE } from "@/lib/shippingNotify";

/**
 * POST /api/webhooks/easypost — tracking updates (docs/shipping-research.md P4).
 *
 * EasyPost posts an Event: { description: "tracker.updated", result: { id: "trk_…",
 * tracking_code, status, status_detail, carrier, public_url, … } }. Status is one
 * of pre_transit / in_transit / out_for_delivery / delivered / available_for_pickup /
 * return_to_sender / failure / cancelled / error / unknown.
 *
 * We match the tracker to a box by tracking code (or tracker id), store the
 * status, and text the buyer on the first out_for_delivery and on delivered.
 * Nothing is ever created from a webhook.
 *
 * Signature: when EASYPOST_WEBHOOK_SECRET is set, the X-Hmac-Signature header
 * ("hmac-sha256-hex=<hex>") is HMAC-SHA256 of the raw body with the secret and
 * must match (verifyEasyPostWebhook in lib/easypost.ts). When unset we accept
 * the post but still only touch boxes whose tracking code we already know.
 * Register the URL in the EasyPost dashboard (Webhooks) with the same secret.
 * Public route in middleware.
 */
type TrackerEvent = {
  description?: string;
  result?: { id?: string; object?: string; tracking_code?: string; status?: string; status_detail?: string; carrier?: string; public_url?: string };
};

// Only EasyPost's documented tracker statuses are ever stored; anything else is "unknown".
const KNOWN_STATUSES = new Set([
  "pre_transit", "in_transit", "out_for_delivery", "delivered", "available_for_pickup",
  "return_to_sender", "failure", "cancelled", "error", "unknown",
]);
// A tracking link we'd text to a buyer must be EasyPost's own tracking page.
const TRACK_URL_PREFIX = "https://track.easypost.com/";

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyEasyPostWebhook(raw, request.headers.get("x-hmac-signature"))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let evt: TrackerEvent;
  try {
    evt = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const desc = evt.description ?? "";
  const t = evt.result;
  if (!desc.startsWith("tracker.") || !t || t.object !== "Tracker") return NextResponse.json({ ok: true, ignored: true });
  const rawStatus = (t.status ?? "unknown").toLowerCase();
  const status = KNOWN_STATUSES.has(rawStatus) ? rawStatus : "unknown";
  if (!t.tracking_code && !t.id) return NextResponse.json({ ok: true, ignored: true });

  try {
    const bundle = await prisma.shippingBundle.findFirst({
      where: {
        OR: [
          ...(t.tracking_code ? [{ trackingCode: t.tracking_code }] : []),
          ...(t.id ? [{ easypostTrackerId: t.id }] : []),
        ],
      },
      select: { id: true, clerkUserId: true, status: true, lastTrackingStatus: true, trackingUrl: true, easypostTrackerId: true, deliveredAt: true },
    });
    if (!bundle) return NextResponse.json({ ok: true, ignored: true });

    const data: { lastTrackingStatus: string; trackingUrl?: string; easypostTrackerId?: string; status?: "DELIVERED"; deliveredAt?: Date } = { lastTrackingStatus: status };
    if (!bundle.trackingUrl && typeof t.public_url === "string" && t.public_url.startsWith(TRACK_URL_PREFIX)) data.trackingUrl = t.public_url;
    if (!bundle.easypostTrackerId && t.id) data.easypostTrackerId = t.id;

    const wasDelivered = bundle.status === "DELIVERED" || !!bundle.deliveredAt;
    if (status === "delivered" && !wasDelivered) {
      data.status = "DELIVERED";
      data.deliveredAt = new Date();
    }
    await prisma.shippingBundle.update({ where: { id: bundle.id }, data });

    if (status === "delivered" && !wasDelivered) {
      await textBuyer(bundle.clerkUserId, "shipping_delivered", DELIVERED_MESSAGE);
    } else if (status === "out_for_delivery" && bundle.lastTrackingStatus !== "out_for_delivery" && !wasDelivered) {
      // Once only: a repeat out_for_delivery (carrier re-attempt) is already on the
      // box as lastTrackingStatus, and a delivered box never gets this text.
      await textBuyer(bundle.clerkUserId, "shipping_out_for_delivery", OUT_FOR_DELIVERY_MESSAGE);
    }
  } catch (e) {
    console.error("[webhooks/easypost]:", e);
  }
  return NextResponse.json({ ok: true });
}
