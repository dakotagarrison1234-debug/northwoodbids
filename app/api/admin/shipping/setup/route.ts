export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseShipInput } from "@/lib/shipping/tiers";
import { requireShipAdmin, forbidden } from "../_lib";

/**
 * The "Make shippable" tab on the Ship board.
 *
 * GET /api/admin/shipping/setup?locationId=…
 *   Lots at ONE warehouse that are not shippable yet and not live — i.e. in an
 *   auction that hasn't opened (DRAFT) — grouped by auction. Nothing live, nothing
 *   sold, nothing already shippable ever shows here, so the list only shrinks as
 *   staff work through it.
 *   { locations: [{ id, name }], auctions: [{ id, title, startAt, items: [{ id, title, code, thumb }] }] }
 *
 * POST /api/admin/shipping/setup  { itemId, preset: "SMALL" | "MEDIUM" | "LARGE" | "OFF" }
 *   Flip one lot on at a preset size (or back off for undo). Re-checks the same
 *   rules server-side so a stale screen can't touch a lot that went live.
 */

const PRESET_OK = new Set(["SMALL", "MEDIUM", "LARGE", "OFF"]);

export async function GET(req: NextRequest) {
  const membership = await requireShipAdmin();
  if (!membership) return forbidden();
  const orgId = membership.organizationId;

  const locations = await prisma.pickupLocation.findMany({
    where: { organizationId: orgId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  const locationId = req.nextUrl.searchParams.get("locationId") ?? "";
  if (!locationId || !locations.some((l) => l.id === locationId)) {
    return NextResponse.json({ locations, auctions: [] });
  }

  const items = await prisma.item.findMany({
    where: {
      organizationId: orgId,
      locationId,
      shipEligible: false,
      status: { in: ["DRAFT", "ACTIVE"] },
      auction: { status: "DRAFT", archived: false },
    },
    orderBy: [{ itemCode: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, title: true, itemCode: true, auctionId: true,
      auction: { select: { id: true, title: true, startAt: true } },
      photos: { where: { isPrimary: true }, take: 1, select: { url: true } },
    },
    take: 2000,
  });

  const byAuction = new Map<string, { id: string; title: string; startAt: string; items: { id: string; title: string; code: string | null; thumb: string | null }[] }>();
  for (const it of items) {
    if (!it.auction) continue;
    const a = byAuction.get(it.auction.id) ?? { id: it.auction.id, title: it.auction.title, startAt: it.auction.startAt.toISOString(), items: [] };
    a.items.push({ id: it.id, title: it.title, code: it.itemCode ?? null, thumb: it.photos[0]?.url ?? null });
    byAuction.set(it.auction.id, a);
  }
  const auctions = [...byAuction.values()].sort((a, b) => a.startAt.localeCompare(b.startAt));
  return NextResponse.json({ locations, auctions });
}

export async function POST(req: NextRequest) {
  const membership = await requireShipAdmin();
  if (!membership) return forbidden();
  const orgId = membership.organizationId;

  const body = await req.json().catch(() => ({}));
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const preset = typeof body.preset === "string" ? body.preset.toUpperCase() : "";
  if (!itemId || !PRESET_OK.has(preset)) return NextResponse.json({ error: "Pick Small, Medium or Large." }, { status: 400 });

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { id: true, organizationId: true, status: true, auction: { select: { status: true } } },
  });
  if (!item || item.organizationId !== orgId) return NextResponse.json({ error: "Lot not found." }, { status: 404 });
  // Same rule as the list: only lots that aren't live and aren't sold.
  if (!item.auction || item.auction.status !== "DRAFT" || !["DRAFT", "ACTIVE"].includes(item.status)) {
    return NextResponse.json({ error: "That lot is live or sold — change shipping from the lot's edit screen." }, { status: 409 });
  }

  const ship = preset === "OFF" ? parseShipInput({ shipEligible: false }) : parseShipInput({ shipEligible: true, shipPreset: preset });
  if ("error" in ship) return NextResponse.json({ error: ship.error }, { status: 400 });

  await prisma.item.update({ where: { id: itemId }, data: ship.fields });
  return NextResponse.json({ success: true, itemId, preset });
}
