export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { quoteForViewer, choiceFor, itemShipSelect } from "@/lib/shipping/bundle";
import { HOW_IT_WORKS } from "@/lib/shipping/tiers";

/**
 * GET /api/shipping/quote?itemId= — what the Pickup / Ship boxes show for this lot.
 * Anonymous viewers get "from $X"; signed-in bidders with an address get their
 * exact price (a new box, or the delta if it joins their open box) + their choice.
 *
 * { eligible: false } | {
 *   eligible: true, fromCents, exactCents: number|null, joinsOpenBox, zone, needsAddress,
 *   signedIn, choice: "PICKUP"|"SHIP"|null, howItWorks: string[]
 * }
 */
export async function GET(request: NextRequest) {
  const itemId = new URL(request.url).searchParams.get("itemId")?.trim() ?? "";
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  // locationId + organizationId: "joins your open box" is per shipping station
  // (an Owosso lot joins the Owosso box, a Gladwin lot the Gladwin box).
  const item = await prisma.item.findUnique({ where: { id: itemId }, select: { ...itemShipSelect, locationId: true, organizationId: true } });
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const { userId } = await auth();
  const quote = await quoteForViewer(item, userId ?? null);
  if (!quote.eligible) return NextResponse.json({ eligible: false, signedIn: !!userId });

  const choice = userId ? await choiceFor(userId, itemId) : null;
  return NextResponse.json({ ...quote, signedIn: !!userId, choice, howItWorks: HOW_IT_WORKS });
}
