export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { bundleSummaryFor } from "@/lib/shipping/bundle";

/**
 * GET /api/shipping/box — the signed-in bidder's boxes (open, closed, packing,
 * shipped; newest first, up to 5; `?all=1` → up to 50 and every delivered box,
 * for /shipping). Shape per box: see bundleSummaryFor() —
 * id, status, openedAt, closesAt, closedAt, weightOz, weightLb, boxCode,
 * chargedCents, tierCents, zone, carrier, service, trackingCode, trackingUrl,
 * shippedAt, deliveredAt, lastTrackingStatus, shipCity, shipState,
 * location { name }, headroom { ozLeft, bandLabel, nextCents, stepCents,
 * fits[{ key, label, count }] }, items[{ id, title, shipChargeCents, paid,
 * atStation, photos[{ url }] }].
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const all = new URL(request.url).searchParams.get("all") === "1";
  const boxes = await bundleSummaryFor(userId, { all });
  return NextResponse.json({ boxes });
}
