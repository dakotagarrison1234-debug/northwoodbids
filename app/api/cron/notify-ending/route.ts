export const dynamic = "force-dynamic";
export const maxDuration = 300; // a full ending-soon SMS blast can take a while
import { NextRequest, NextResponse } from "next/server";
import { notifyAuctionEndingSoon } from "@/lib/closeAuction";

/**
 * "Ending soon" SMS blast — its OWN cron, deliberately decoupled from the
 * per-minute close/charge cron.
 *
 * The blast can fan out to the entire registered bidder list at once. Left inside
 * the every-minute close cron, one big send would eat that tick's time budget and
 * delay the thing that must never be late: closing auctions and charging winners.
 * Here it runs on its own schedule with its own budget. The 60-minute warning
 * window is wide, and each auction is stamped `endingSoonNotifiedAt` after its
 * first send, so a coarser cadence (every few minutes) loses nothing.
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Misconfigured: CRON_SECRET not set" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let notifiedAuctions = 0;
  try {
    ({ notifiedAuctions } = await notifyAuctionEndingSoon());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[cron] notifyAuctionEndingSoon failed:", msg, err);
  }

  console.log(`[cron] Ending-soon: notified ${notifiedAuctions} auction(s)`);
  return NextResponse.json({ notifiedAuctions });
}
