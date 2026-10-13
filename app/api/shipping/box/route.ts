export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { bundleSummaryFor } from "@/lib/shipping/bundle";

/**
 * GET /api/shipping/box — the signed-in bidder's boxes (open, closed, packing,
 * shipped; newest first, up to 5). Shape per box: see bundleSummaryFor() —
 * id, status, openedAt, closesAt, closedAt, weightOz, weightLb, boxCode,
 * chargedCents, tierCents, zone, carrier, service, trackingCode, trackingUrl,
 * shippedAt, deliveredAt, lastTrackingStatus, shipCity, shipState,
 * location { name }, headroom { ozLeft, bandLabel, nextCents, stepCents,
 * fits[{ key, label, count }] }, items[{ id, title, shipChargeCents, paid,
 * atStation, photos[{ url }] }].
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const boxes = await bundleSummaryFor(userId);
  return NextResponse.json({ boxes });
}
