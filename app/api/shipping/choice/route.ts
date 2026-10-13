export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getShipProfile, itemFootprint, itemShipSelect, setChoice } from "@/lib/shipping/bundle";

/**
 * POST /api/shipping/choice { itemId, choice: "PICKUP" | "SHIP" }
 * Remembers how the bidder wants this lot if they win (and becomes their default
 * for the next lot). SHIP needs an address on file: 422 { needsAddress: true }.
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const itemId = String(body.itemId ?? "").trim();
  const choice = body.choice === "SHIP" ? "SHIP" : body.choice === "PICKUP" ? "PICKUP" : null;
  if (!itemId || !choice) return NextResponse.json({ error: "itemId and choice required" }, { status: 400 });

  const item = await prisma.item.findUnique({ where: { id: itemId }, select: { ...itemShipSelect, status: true, itemEndAt: true } });
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  if (choice === "SHIP") {
    if (!itemFootprint(item)) return NextResponse.json({ error: "This lot is pickup only." }, { status: 422 });
    // Still open: status says so AND the clock hasn't run out (the close cron may
    // not have flipped the status yet).
    if ((item.status !== "ACTIVE" && item.status !== "DRAFT") || (item.itemEndAt != null && item.itemEndAt.getTime() <= Date.now())) {
      return NextResponse.json({ error: "Bidding on this lot has ended." }, { status: 422 });
    }
    const profile = await getShipProfile(userId);
    if (!profile) return NextResponse.json({ error: "Add a shipping address first.", needsAddress: true }, { status: 422 });
  }

  await setChoice(userId, itemId, choice);
  return NextResponse.json({ success: true, choice });
}
