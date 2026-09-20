import { prisma } from "@/lib/prisma";
import { APP_URL } from "@/lib/paymentNotify";
import { engagedBidderProfiles, runPooled } from "@/lib/closeAuction";

/**
 * Giveaway texts, sent through the SAME GoHighLevel webhooks the auction already
 * uses (the workflow reads `smsMessage`), so there's nothing new to wire in GHL:
 *   - a win → GHL_AUCTION_WON_WEBHOOK      (event "giveaway_won")
 *   - an announcement → GHL_AUCTION_STARTED_WEBHOOK (event "giveaway_live")
 * Both no-op when the env var is missing and never throw.
 */

function contactFields(p: { email: string | null; phone: string | null; name: string | null }) {
  const name = p.name ?? "Bidder";
  return {
    email: p.email ?? "",
    phone: p.phone ?? "",
    name,
    firstName: name.split(" ")[0] || name,
    lastName: name.split(" ").slice(1).join(" ") || "",
    bidderEmail: p.email ?? "",
    bidderPhone: p.phone ?? "",
    bidderName: name,
  };
}

/** "You won!" — fired right after Done on the draw. Tells them it's in their pickups. */
export async function notifyGiveawayWon(clerkUserId: string, giveawayTitle: string, prizeTitle: string): Promise<void> {
  try {
    const hook = process.env.GHL_AUCTION_WON_WEBHOOK;
    if (!hook) return;
    const p = await prisma.bidderProfile.findUnique({
      where: { clerkUserId },
      select: { email: true, phone: true, name: true },
    });
    if (!p || (!p.phone && !p.email)) return;
    const pickupUrl = `${APP_URL}/pickup`;
    await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...contactFields(p),
        event: "giveaway_won",
        smsMessage: `Northwood Bids: YOU WON the ${giveawayTitle}! Your prize (${prizeTitle}) is in your pickups — book a time here: ${pickupUrl}`,
        itemCount: 1,
        totalAmount: 0,
        auctionName: giveawayTitle,
        prizeTitle,
        paymentUrl: pickupUrl,
      }),
    }).catch((err) => console.error("GHL giveaway-won webhook failed:", err));
  } catch (err) {
    console.error("notifyGiveawayWon error:", err);
  }
}

/**
 * "A giveaway just went live" — one text to every engaged bidder (same audience as
 * the auction-started blast). Returns how many were sent. Caller guards with
 * `announcedAt` so it can only ever fire once per giveaway.
 */
export async function notifyGiveawayLive(args: {
  organizationId: string;
  title: string;
  ruleLine: string;
  endsAt: Date | null;
}): Promise<number> {
  const hook = process.env.GHL_AUCTION_STARTED_WEBHOOK;
  if (!hook) return 0;
  const followers = await engagedBidderProfiles(args.organizationId);
  const seen = new Set<string>();
  const recipients = followers.filter((f) => {
    const key = (f.phone || f.email || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (recipients.length === 0) return 0;

  const url = `${APP_URL}/giveaways`;
  const when = args.endsAt
    ? ` Ends ${args.endsAt.toLocaleDateString("en-US", { timeZone: "America/Detroit", weekday: "short", month: "short", day: "numeric" })}.`
    : "";
  const smsMessage = `Northwood Bids: FREE giveaway is live — ${args.title}. ${args.ruleLine}${when} Details: ${url}`;

  let sent = 0;
  await runPooled(
    recipients,
    async (r) => {
      try {
        const res = await fetch(hook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...contactFields(r),
            event: "giveaway_live",
            smsMessage,
            auctionName: args.title,
            auctionUrl: url,
          }),
        });
        if (res.ok) sent++;
        else console.error("GHL giveaway-live webhook rejected:", res.status);
      } catch (err) {
        console.error("GHL giveaway-live webhook failed:", err);
      }
    },
    8
  );
  return sent;
}
