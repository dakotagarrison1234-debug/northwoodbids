export const dynamic = "force-dynamic";
export const maxDuration = 300; // allow serial Stripe charges to finish (Vercel Pro)
import { NextRequest, NextResponse } from "next/server";
import { openScheduledAuctions, closeExpiredItems, notifyAuctionEndingSoon, chargeUnchargedWinners } from "@/lib/closeAuction";
import { flushOutbidAlerts } from "@/lib/outbidAlerts";

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Misconfigured: CRON_SECRET not set" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let openedAuctions = 0;
  let closedItems = 0;
  let closedAuctions = 0;
  let notifiedAuctions = 0;
  let chargedWinners = 0;
  let outbidNotified = 0;

  try {
    // Open auctions whose startAt has passed and activate their items
    ({ openedAuctions } = await openScheduledAuctions());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[cron] openScheduledAuctions failed:", msg, err);
  }

  try {
    // Coalesced outbid alerts: one text per bidder once their bidding war settles,
    // instead of one per bid. Runs BEFORE the close pass so a bidder who's about to
    // lose an item still hears about it while they can act.
    ({ notified: outbidNotified } = await flushOutbidAlerts());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[cron] flushOutbidAlerts failed:", msg, err);
  }

  try {
    // Notify active bidders when an auction is closing within the next hour
    ({ notifiedAuctions } = await notifyAuctionEndingSoon());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[cron] notifyAuctionEndingSoon failed:", msg, err);
  }

  try {
    // Close items/auctions whose endAt has passed
    ({ closedItems, closedAuctions } = await closeExpiredItems());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[cron] closeExpiredItems failed:", msg, err);
  }

  try {
    // Resumable charging: pick up any winners a prior tick left uncharged
    // (e.g. the close pass timed out mid-charge). Decoupled from auction status
    // and idempotent, so it can safely run every tick after the close pass.
    ({ chargedWinners } = await chargeUnchargedWinners());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[cron] chargeUnchargedWinners failed:", msg, err);
  }

  console.log(`[cron] Opened ${openedAuctions} auction(s), notified ${notifiedAuctions} ending soon, texted ${outbidNotified} outbid bidder(s), closed ${closedItems} item(s), ${closedAuctions} auction(s), charged ${chargedWinners} uncharged winner(s)`);
  return NextResponse.json({ openedAuctions, notifiedAuctions, outbidNotified, closedItems, closedAuctions, chargedWinners });
}
