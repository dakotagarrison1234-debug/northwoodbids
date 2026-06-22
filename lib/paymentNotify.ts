import { prisma } from "@/lib/prisma";

/**
 * Base URL for links in payment notifications. Falls back to the production
 * domain so SMS/email links are never broken if NEXT_PUBLIC_APP_URL is unset.
 */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://northwoodbids.com";

type BidderContact = {
  email: string | null;
  phone: string | null;
  name: string | null;
};

/**
 * Resolves a bidder's GHL contact fields by clerkUserId, unless a profile was
 * already supplied by the caller (avoids a redundant query).
 */
async function resolveContact(
  clerkUserId: string,
  profile?: BidderContact | null
): Promise<BidderContact | null> {
  if (profile) return profile;
  return prisma.bidderProfile.findUnique({
    where: { clerkUserId },
    select: { email: true, phone: true, name: true },
  });
}

/**
 * Fire-and-forget GHL notification when a winner's card could not be charged.
 * No-op if GHL_PAYMENT_FAILED_WEBHOOK is unset. Never throws.
 */
export async function notifyPaymentFailed(args: {
  clerkUserId: string;
  itemCount?: number;
  reason?: string;
  profile?: BidderContact | null;
}): Promise<void> {
  try {
    if (!process.env.GHL_PAYMENT_FAILED_WEBHOOK) return;

    const profile = await resolveContact(args.clerkUserId, args.profile);
    const email = profile?.email ?? "";
    const phone = profile?.phone ?? "";
    const name = profile?.name ?? "Winner";
    const retryUrl = `${APP_URL}/dashboard`;

    await fetch(process.env.GHL_PAYMENT_FAILED_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // GHL contact lookup fields
        email,
        phone,
        name,
        firstName: name.split(" ")[0] || name,
        lastName: name.split(" ").slice(1).join(" ") || "",
        // Notification payload
        event: "payment_failed",
        smsMessage: `Northwood Bids: We couldn't charge your card for the items you won. Update your card to keep them: ${APP_URL}/dashboard`,
        bidderEmail: email,
        bidderPhone: phone,
        bidderName: name,
        itemCount: args.itemCount,
        reason: args.reason,
        retryUrl,
      }),
    }).catch((err) => console.error("GHL payment-failed webhook failed:", err));
  } catch (err) {
    console.error("notifyPaymentFailed error:", err);
  }
}

/**
 * Fire-and-forget GHL receipt notification when a payment first transitions to
 * PAID. No-op if GHL_PAYMENT_RECEIPT_WEBHOOK is unset. Never throws.
 */
export async function notifyPaymentReceipt(args: {
  clerkUserId: string;
  amount: number;
  profile?: BidderContact | null;
}): Promise<void> {
  try {
    if (!process.env.GHL_PAYMENT_RECEIPT_WEBHOOK) return;

    const profile = await resolveContact(args.clerkUserId, args.profile);
    const email = profile?.email ?? "";
    const phone = profile?.phone ?? "";
    const name = profile?.name ?? "Winner";

    await fetch(process.env.GHL_PAYMENT_RECEIPT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // GHL contact lookup fields
        email,
        phone,
        name,
        firstName: name.split(" ")[0] || name,
        lastName: name.split(" ").slice(1).join(" ") || "",
        // Notification payload
        event: "payment_receipt",
        smsMessage: `Northwood Bids: Payment received — $${args.amount} for the items you won. Pickup details: ${APP_URL}/dashboard`,
        bidderEmail: email,
        bidderPhone: phone,
        bidderName: name,
        amount: args.amount,
      }),
    }).catch((err) => console.error("GHL payment-receipt webhook failed:", err));
  } catch (err) {
    console.error("notifyPaymentReceipt error:", err);
  }
}
