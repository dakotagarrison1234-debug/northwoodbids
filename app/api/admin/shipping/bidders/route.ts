export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { zoneForState } from "@/lib/shipping/tiers";
import { setChoice } from "@/lib/shipping/bundle";
import { requireShipAdmin, forbidden } from "../_lib";

/**
 * The "Bidding to ship" tab on the Ship board: who is set to SHIP and is
 * bidding right now on a live, shippable lot, before anything has been won.
 *
 * A buyer's Ship / Pickup choice is ONE setting on their profile
 * (BidderProfile.lastFulfillment) and decides every lot they win, so the list
 * is grouped by bidder, and the switch flips that bidder.
 *
 * GET  /api/admin/shipping/bidders
 *   { bidders: [{ clerkUserId, name, phone, city, state, zip, local, leading,
 *                 lots: [{ id, title, code, thumb, currentBid, myBid, leading, closesAt, warehouse }] }] }
 *   `local` = a mid-Michigan address (ZIP 484xx to 489xx, Flint / Saginaw / Bay City /
 *   Lansing / Mt Pleasant / Gladwin area), the people who'd likely rather pick up.
 *
 * POST /api/admin/shipping/bidders { clerkUserId, choice: "PICKUP" | "SHIP" }
 *   Flip a bidder's mode (SHIP is the undo, and needs their address still on file).
 *   Only bidders bidding on this org's live lots can be switched from here.
 */

const LOCAL_ZIP3 = new Set(["484", "485", "486", "487", "488", "489"]);

async function liveShipLots(orgId: string) {
  return prisma.item.findMany({
    where: {
      organizationId: orgId,
      status: "ACTIVE",
      shipEligible: true,
      auction: { status: { in: ["OPEN", "CLOSING"] }, archived: false },
      bids: { some: { status: { in: ["ACTIVE", "OUTBID"] } } },
    },
    select: {
      id: true, title: true, itemCode: true, currentBid: true, itemEndAt: true,
      auction: { select: { endAt: true } },
      location: { select: { name: true } },
      photos: { orderBy: [{ isPrimary: "desc" }, { order: "asc" }], take: 1, select: { url: true } },
      bids: {
        where: { status: { in: ["ACTIVE", "OUTBID"] } },
        orderBy: { amount: "desc" },
        select: { clerkUserId: true, amount: true, status: true },
      },
    },
    take: 3000,
  });
}

export async function GET() {
  const membership = await requireShipAdmin();
  if (!membership) return forbidden();

  const lots = await liveShipLots(membership.organizationId);
  const userIds = [...new Set(lots.flatMap((l) => l.bids.map((b) => b.clerkUserId)))];
  if (userIds.length === 0) return NextResponse.json({ bidders: [] });

  const profiles = await prisma.bidderProfile.findMany({
    where: { clerkUserId: { in: userIds }, lastFulfillment: "SHIP" },
    select: { clerkUserId: true, name: true, phone: true, shipName: true, shipStreet1: true, shipCity: true, shipState: true, shipZip: true },
  });
  // Same rule the win uses: Ship only counts with a complete lower-48 address.
  const shippers = new Map(
    profiles
      .filter((p) => p.shipStreet1 && p.shipCity && p.shipZip && zoneForState(p.shipState))
      .map((p) => [p.clerkUserId, p]),
  );

  type LotOut = { id: string; title: string; code: string | null; thumb: string | null; currentBid: number; myBid: number; leading: boolean; closesAt: string; warehouse: string | null };
  const byBidder = new Map<string, LotOut[]>();
  for (const l of lots) {
    // The top ACTIVE bid is the one winning right now.
    const top = l.bids.find((b) => b.status === "ACTIVE") ?? null;
    const seen = new Set<string>();
    for (const b of l.bids) {
      if (seen.has(b.clerkUserId) || !shippers.has(b.clerkUserId)) continue;
      seen.add(b.clerkUserId); // bids are high-to-low, so the first is this bidder's best
      const list = byBidder.get(b.clerkUserId) ?? [];
      list.push({
        id: l.id,
        title: l.title,
        code: l.itemCode ?? null,
        thumb: l.photos[0]?.url ?? null,
        currentBid: Number(l.currentBid),
        myBid: Number(b.amount),
        leading: top?.clerkUserId === b.clerkUserId,
        closesAt: new Date(l.itemEndAt ?? l.auction!.endAt).toISOString(),
        warehouse: l.location?.name ?? null,
      });
      byBidder.set(b.clerkUserId, list);
    }
  }

  const bidders = [...byBidder.entries()].map(([id, list]) => {
    const p = shippers.get(id)!;
    const zip = (p.shipZip ?? "").trim();
    return {
      clerkUserId: id,
      name: p.name?.trim() || p.shipName?.trim() || "Bidder",
      phone: p.phone ?? null,
      city: p.shipCity ?? "",
      state: (p.shipState ?? "").toUpperCase(),
      zip,
      local: (p.shipState ?? "").toUpperCase() === "MI" && LOCAL_ZIP3.has(zip.slice(0, 3)),
      leading: list.filter((x) => x.leading).length,
      lots: list.sort((a, b) => Number(b.leading) - Number(a.leading) || a.closesAt.localeCompare(b.closesAt)),
    };
  });
  // Local people first (the ones to call), then whoever is winning the most.
  bidders.sort((a, b) => Number(b.local) - Number(a.local) || b.leading - a.leading || b.lots.length - a.lots.length);
  return NextResponse.json({ bidders });
}

export async function POST(req: NextRequest) {
  const membership = await requireShipAdmin();
  if (!membership) return forbidden();

  const body = await req.json().catch(() => ({}));
  const clerkUserId = typeof body.clerkUserId === "string" ? body.clerkUserId : "";
  const choice = body.choice === "PICKUP" ? "PICKUP" : body.choice === "SHIP" ? "SHIP" : null;
  if (!clerkUserId || !choice) return NextResponse.json({ error: "Pick a bidder and Ship or Pickup." }, { status: 400 });

  // Staff can only flip someone who is bidding on this org's lots.
  const bidding = await prisma.bid.findFirst({
    where: { clerkUserId, item: { organizationId: membership.organizationId } },
    select: { id: true },
  });
  if (!bidding) return NextResponse.json({ error: "That bidder isn't bidding here." }, { status: 404 });

  if (choice === "SHIP") {
    const p = await prisma.bidderProfile.findUnique({ where: { clerkUserId }, select: { shipStreet1: true, shipCity: true, shipZip: true, shipState: true } });
    if (!p?.shipStreet1 || !p.shipCity || !p.shipZip || !zoneForState(p.shipState)) {
      return NextResponse.json({ error: "They have no shipping address on file anymore." }, { status: 422 });
    }
  }
  await setChoice(clerkUserId, choice);
  return NextResponse.json({ success: true, clerkUserId, choice });
}
