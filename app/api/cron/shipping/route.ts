export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  advanceClosedBundles,
  bundlesDueForDay6Text,
  closeDueBundles,
  shippingStation,
} from "@/lib/shipping/bundle";
import { textBuyer, closedMessage } from "@/lib/shippingNotify";

// GET /api/cron/shipping — every 15 minutes (vercel.json).
//
// The box lifecycle's clock (docs/shipping.md):
//   (a) day 6  — boxes closing within 24h get ONE "ships tomorrow" text
//                (stamped day6NotifiedAt so it never repeats);
//   (b) day 7  — boxes past closesAt flip OPEN → CLOSED and the buyer is told
//                it's heading to packing (or that we're waiting on a transfer);
//   (c) CLOSED → PACKING once every lot is paid and physically at the box's
//                own station (every station ships its own boxes).
//
// No money moves here — every shipping delta was charged with the win.
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Misconfigured: CRON_SECRET not set" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let day6Texted = 0;
  let closed = 0;
  let closedTexted = 0;
  let advanced = 0;

  // (a) Day-6 "ships tomorrow" text.
  try {
    const due = await bundlesDueForDay6Text(now);
    for (const b of due) {
      const lots = b.items.length;
      const lb = Math.max(1, Math.round(b.weightOz / 16));
      const sms =
        `Northwood Bids: your box ships tomorrow — ${lots} lot${lots === 1 ? "" : "s"}, about ${lb} lb. ` +
        `Anything you win today rides in the same box (you only pay a difference if it moves up a weight band).`;
      const ok = await textBuyer(b.clerkUserId, "shipping_closing", sms, {
        bundleId: b.id, lots, weightLb: lb, closesAt: b.closesAt.toISOString(),
      });
      // Stamp even when GHL declined / no phone — the window is 24h and we'd
      // otherwise retry every 15 minutes for a buyer we can't reach.
      await prisma.shippingBundle.update({ where: { id: b.id }, data: { day6NotifiedAt: now } });
      if (ok) day6Texted++;
    }
  } catch (e) {
    console.error("[cron/shipping] day-6 texts failed:", e);
  }

  // (b) Day-7 auto-close + "closed" text.
  try {
    const ids = await closeDueBundles(now);
    closed = ids.length;
    if (ids.length > 0) {
      const bundles = await prisma.shippingBundle.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, clerkUserId: true, organizationId: true,
          location: { select: { id: true, name: true } },
          items: { select: { id: true, locationId: true, transferRequestId: true } },
        },
      });
      // Boxes opened before per-station boxes have no location: use the org default.
      const fallbackByOrg = new Map<string, { id: string; name: string } | null>();
      for (const b of bundles) {
        if (!fallbackByOrg.has(b.organizationId)) fallbackByOrg.set(b.organizationId, await shippingStation(b.organizationId));
        const station = b.location ?? fallbackByOrg.get(b.organizationId) ?? null;
        // §9.15 — the box still closes on day 7, but the handling clock starts
        // when the last lot lands at THIS box's station.
        const waiting = b.items.some((it) => !!it.transferRequestId || (station != null && it.locationId !== station.id));
        const ok = await textBuyer(b.clerkUserId, "shipping_closed", closedMessage(waiting, station?.name), {
          bundleId: b.id, lots: b.items.length, waitingOnTransfer: waiting, station: station?.name ?? null,
        });
        if (ok) closedTexted++;
      }
    }
  } catch (e) {
    console.error("[cron/shipping] closeDueBundles failed:", e);
  }

  // (c) CLOSED → PACKING for every org (single-business today, but cheap to loop).
  try {
    const orgs = await prisma.organization.findMany({ select: { id: true } });
    for (const org of orgs) {
      advanced += await advanceClosedBundles(org.id);
    }
  } catch (e) {
    console.error("[cron/shipping] advanceClosedBundles failed:", e);
  }

  if (day6Texted || closed || advanced) {
    console.log(`[cron/shipping] day6Texted=${day6Texted} closed=${closed} closedTexted=${closedTexted} advanced=${advanced}`);
  }
  return NextResponse.json({ ok: true, day6Texted, closed, closedTexted, advanced });
}
