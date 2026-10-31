export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

/**
 * GET /api/admin/items/spots?locationId=...&auctionId=...
 *
 * The distinct shelf/spot names already in use for a given warehouse (and, when
 * provided, a given auction). Powers the storage-location autocomplete in the item
 * creator: staff can type a brand-new spot OR pick one that's already being used for
 * this exact auction + warehouse, so a run of items lands in consistent spots.
 */
export async function GET(req: NextRequest) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;

  const locationId = req.nextUrl.searchParams.get("locationId");
  const auctionId = req.nextUrl.searchParams.get("auctionId");
  if (!locationId) return NextResponse.json({ spots: [] });

  const rows = await prisma.item.findMany({
    where: {
      organizationId: orgId,
      locationId,
      storageLocation: { not: null },
      ...(auctionId ? { auctionId } : {}),
    },
    select: { storageLocation: true },
    distinct: ["storageLocation"],
    take: 300,
  });

  // Names staff deleted from the row never come back.
  const deleted = await prisma.deletedSpot
    .findMany({ where: { organizationId: orgId, locationId }, select: { spot: true } })
    .catch(() => [] as { spot: string }[]);
  const gone = new Set(deleted.map((d) => d.spot.toLowerCase()));

  // New items save the spot in capitals (A1), older ones may not — one chip per
  // spot regardless of case, shown the way new items save it.
  const byKey = new Map<string, string>();
  for (const r of rows) {
    const s = (r.storageLocation ?? "").trim();
    if (s && !byKey.has(s.toLowerCase())) byKey.set(s.toLowerCase(), s.toUpperCase());
  }
  const spots = [...byKey.values()]
    .filter((s) => !gone.has(s.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  return NextResponse.json({ spots });
}

/** DELETE /api/admin/items/spots  { locationId, spot } — remove a spot from the suggestions for good. */
export async function DELETE(req: NextRequest) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;

  const body = await req.json().catch(() => ({}));
  const locationId = typeof body.locationId === "string" ? body.locationId : "";
  const spot = typeof body.spot === "string" ? body.spot.trim() : "";
  if (!locationId || !spot) return NextResponse.json({ error: "locationId and spot are required" }, { status: 400 });

  await prisma.deletedSpot.upsert({
    where: { organizationId_locationId_spot: { organizationId: orgId, locationId, spot } },
    create: { organizationId: orgId, locationId, spot },
    update: {},
  });
  return NextResponse.json({ success: true });
}
