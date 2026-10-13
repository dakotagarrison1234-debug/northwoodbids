export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { shipItNow, shippingStation } from "@/lib/shipping/bundle";
import { textBuyer, closedMessage } from "@/lib/shippingNotify";

/**
 * POST /api/shipping/box/[id]/ship-now — close the bidder's OPEN box today.
 * Sends the same "closed" text the day-7 cron sends. Once: shipItNow only
 * succeeds on the OPEN → CLOSED flip, and the cron never re-closes a CLOSED box.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  const ok = await shipItNow(id, userId);
  if (!ok) return NextResponse.json({ error: "That box isn't open anymore." }, { status: 409 });

  try {
    const b = await prisma.shippingBundle.findUnique({
      where: { id },
      select: { organizationId: true, location: { select: { id: true, name: true } }, items: { select: { locationId: true, transferRequestId: true } } },
    });
    if (b) {
      // The box's own station (org default for boxes that predate per-station boxes).
      const station = b.location ?? (await shippingStation(b.organizationId));
      const waiting = b.items.some((it) => !!it.transferRequestId || (station != null && it.locationId !== station.id));
      await textBuyer(userId, "shipping_closed", closedMessage(waiting, station?.name), { bundleId: id, lots: b.items.length, waitingOnTransfer: waiting, station: station?.name ?? null });
    }
  } catch (e) {
    console.error("[shipping/ship-now] closed text failed:", e);
  }
  return NextResponse.json({ success: true });
}
