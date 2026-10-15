import { prisma } from "@/lib/prisma";

/**
 * Buyer texts for the whole shipping lifecycle (docs/shipping-research.md §9.5,
 * P2/P4). One helper, one channel: the verbatim-SMS webhook the admin "Text"
 * button and door codes already use (GHL_CUSTOM_SMS_WEBHOOK). No new GHL
 * workflow; the `event` field just tells GHL which text this was.
 *
 *   shipping_closing          — day 6: "your box ships tomorrow"
 *   shipping_closed           — day 7 / Ship it now: "closed and heading to packing"
 *   shipping_shipped          — label bought / marked shipped
 *   shipping_out_for_delivery — first out_for_delivery tracking event
 *   shipping_delivered        — delivered
 *   shipping_moved_to_pickup  — staff pulled a lot out of a box (shipping refunded)
 *
 * Returns true when GHL accepted the webhook. Never throws — a text that doesn't
 * go out must not block a close, a label or a webhook.
 */

export type ShippingEvent =
  | "shipping_closing"
  | "shipping_closed"
  | "shipping_shipped"
  | "shipping_out_for_delivery"
  | "shipping_delivered"
  | "shipping_moved_to_pickup";

export async function textBuyer(
  clerkUserId: string,
  event: ShippingEvent,
  message: string,
  extra: Record<string, string | number | boolean | null> = {},
): Promise<boolean> {
  const hook = process.env.GHL_CUSTOM_SMS_WEBHOOK;
  if (!hook) return false;
  try {
    const profile = await prisma.bidderProfile.findUnique({
      where: { clerkUserId },
      select: { email: true, phone: true, name: true },
    });
    if (!profile?.phone) return false;
    const name = profile.name ?? "Bidder";
    const sms = message.startsWith("Northwood Bids:") ? message : `Northwood Bids: ${message}`;
    const res = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: profile.email ?? "",
        phone: profile.phone,
        name,
        firstName: name.split(" ")[0] || name,
        lastName: name.split(" ").slice(1).join(" ") || "",
        event,
        smsMessage: sms,
        bidderEmail: profile.email ?? "",
        bidderPhone: profile.phone,
        bidderName: name,
        ...extra,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[shippingNotify] ${event} SMS rejected:`, res.status);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[shippingNotify] ${event} SMS failed:`, e);
    return false;
  }
}

/**
 * Day 7 / Ship it now. `waiting` = a lot is still on its way to the box's
 * station (§9.15). `stationName` is the box's warehouse ("Owosso") when known —
 * every station ships its own boxes, so name it rather than "our warehouse".
 */
export function closedMessage(waiting: boolean, stationName?: string | null): string {
  const where = stationName ? `our ${stationName} warehouse` : "our warehouse";
  return waiting
    ? `Your box is closed. One of your lots is still on its way to ${where}. It ships 3 to 5 business days after your box closes and every lot is paid.`
    : "Your box is closed and heading to packing. It ships 3 to 5 business days after your box closes and every lot is paid.";
}

/**
 * A win that wouldn't fit sealed the open box and started a new one for that
 * lot. `newLotCents` = what the new box's first lot cost (its delta).
 */
export function sealedFullMessage(newLotCents: number): string {
  return `Northwood Bids: that last win was too much for one box, so it sealed your box and started a new one ($${(newLotCents / 100).toFixed(2)}). Details: northwoodbids.com/shipping`;
}

/** "Your box shipped — USPS Ground Advantage, tracking 9400… https://…" */
export function shippedMessage(b: { carrier: string | null; service?: string | null; trackingCode: string | null; trackingUrl: string | null }): string {
  const who = [b.carrier, b.service ? prettyService(b.service) : null].filter(Boolean).join(" ");
  const parts = [`Your box shipped${who ? ` (${who})` : ""}.`];
  if (b.trackingCode) parts.push(`Tracking ${b.trackingCode}`);
  if (b.trackingUrl) parts.push(b.trackingUrl);
  return parts.join(" ");
}

export const OUT_FOR_DELIVERY_MESSAGE = "Your box is out for delivery today.";
export const DELIVERED_MESSAGE = "Your box was delivered. Enjoy!";

function prettyService(s: string): string {
  return s.replace(/SurePostUnder1Lb|SurePostOver1Lb/, "Ground Saver").replace(/([a-z])([A-Z])/g, "$1 $2");
}
