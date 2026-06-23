import { prisma } from "@/lib/prisma";

/**
 * Fire-and-forget SMS when newly-won items are AUTOMATICALLY folded into a
 * bidder's existing pickup appointment or not-yet-loaded transfer. Gated on
 * GHL_PICKUP_UPDATED_WEBHOOK — no-op if unset. Never throws.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://northwoodbids.com";

export async function notifyPickupAutoAdded(args: {
  clerkUserId: string;
  apptAdded?: number;
  apptStartsAt?: Date | null;
  transferAdded?: number;
  toLocationName?: string | null;
}): Promise<void> {
  try {
    const webhook = process.env.GHL_PICKUP_UPDATED_WEBHOOK;
    if (!webhook) return;

    const apptAdded = args.apptAdded ?? 0;
    const transferAdded = args.transferAdded ?? 0;
    if (apptAdded === 0 && transferAdded === 0) return;

    const profile = await prisma.bidderProfile.findUnique({
      where: { clerkUserId: args.clerkUserId },
      select: { email: true, phone: true, name: true },
    });
    const email = profile?.email ?? "";
    const phone = profile?.phone ?? "";
    const name = profile?.name ?? "there";

    const parts: string[] = [];
    if (apptAdded > 0) {
      const when = args.apptStartsAt
        ? new Date(args.apptStartsAt).toLocaleString("en-US", {
            timeZone: "America/Detroit",
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : null;
      parts.push(
        `${apptAdded} new win${apptAdded !== 1 ? "s were" : " was"} added to your pickup${when ? ` on ${when}` : ""}`
      );
    }
    if (transferAdded > 0) {
      parts.push(
        `${transferAdded} new win${transferAdded !== 1 ? "s were" : " was"} added to your transfer${args.toLocationName ? ` to ${args.toLocationName}` : ""}`
      );
    }

    const smsMessage = `Northwood Bids: ${parts.join(" and ")}. Details: ${APP_URL}/pickup`;

    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        phone,
        name,
        firstName: name.split(" ")[0] || name,
        lastName: name.split(" ").slice(1).join(" ") || "",
        event: "pickup_updated",
        smsMessage,
        bidderEmail: email,
        bidderPhone: phone,
        bidderName: name,
        apptAdded,
        transferAdded,
        toLocationName: args.toLocationName ?? "",
        pickupUrl: `${APP_URL}/pickup`,
      }),
    }).catch((err) => console.error("GHL pickup-updated webhook failed:", err));
  } catch (err) {
    console.error("notifyPickupAutoAdded error:", err);
  }
}
