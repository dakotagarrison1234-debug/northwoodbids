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

  const spots = [...new Set(rows.map((r) => (r.storageLocation ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );

  return NextResponse.json({ spots });
}
