export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { choiceFor, getShipProfile, setChoice } from "@/lib/shipping/bundle";

/**
 * The buyer's ONE mode: Ship or Pickup. It sticks — every lot they win follows
 * it until they flip it again. (A lot that can't ship is pickup regardless.)
 *
 * GET  /api/shipping/choice                    → { mode: "PICKUP" | "SHIP" }
 * POST /api/shipping/choice { choice, itemId? } → { success, mode }
 *   SHIP needs an address on file: 422 { needsAddress: true }.
 *   `itemId` is optional — just records which lot the switch was flipped on.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  let mode = await choiceFor(userId);
  // Ship with no address on file can't actually ship — report Pickup (same rule ShipChoice applies).
  if (mode === "SHIP" && !(await getShipProfile(userId))) mode = "PICKUP";
  return NextResponse.json({ mode });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const choice = body.choice === "SHIP" ? "SHIP" : body.choice === "PICKUP" ? "PICKUP" : null;
  if (!choice) return NextResponse.json({ error: "choice must be SHIP or PICKUP" }, { status: 400 });
  const itemId = typeof body.itemId === "string" && body.itemId.trim() ? body.itemId.trim() : null;

  if (choice === "SHIP") {
    const profile = await getShipProfile(userId);
    if (!profile) return NextResponse.json({ error: "Add a shipping address first.", needsAddress: true }, { status: 422 });
  }

  await setChoice(userId, choice, itemId);
  return NextResponse.json({ success: true, mode: choice });
}
