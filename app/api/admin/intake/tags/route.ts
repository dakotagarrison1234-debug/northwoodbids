export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

/**
 * The tag print queue (ported from PureBid MI).
 *
 * GET  /api/admin/intake/tags?auctionId=   MY items (in this auction, or all)
 *      whose tag hasn't printed yet, in the order I listed them, plus how many
 *      lots the auction holds in total (everyone's) for the footer pill.
 *      { items: [{ id, itemCode, title, storageLocation }], auctionTotal }
 * POST /api/admin/intake/tags { itemIds }  stamp those tags printed.
 *
 * The queue lives in the database (Item.tagPrintedAt), not on the device, so a
 * refresh, a dead phone or switching phones never loses a tag that's owed.
 */
export async function GET(req: NextRequest) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const auctionId = req.nextUrl.searchParams.get("auctionId") ?? "";
  const [items, auctionTotal] = await Promise.all([
    prisma.item.findMany({
      where: {
        organizationId: membership.organizationId,
        createdById: membership.clerkUserId,
        tagPrintedAt: null,
        itemCode: { not: null },
        ...(auctionId ? { auctionId } : {}),
      },
      orderBy: { createdAt: "asc" }, // listing order = shelf order
      take: 200,
      select: { id: true, itemCode: true, title: true, storageLocation: true },
    }),
    auctionId
      ? prisma.item.count({ where: { organizationId: membership.organizationId, auctionId } })
      : Promise.resolve(null),
  ]);
  return NextResponse.json({ items, auctionTotal });
}

export async function POST(req: NextRequest) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { itemIds } = await req.json().catch(() => ({ itemIds: [] }));
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return NextResponse.json({ error: "No items given" }, { status: 400 });
  }
  const res = await prisma.item.updateMany({
    where: { id: { in: itemIds.slice(0, 500) }, organizationId: membership.organizationId },
    data: { tagPrintedAt: new Date() },
  });
  return NextResponse.json({ success: true, marked: res.count });
}
