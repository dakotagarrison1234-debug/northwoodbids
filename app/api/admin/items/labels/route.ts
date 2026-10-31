export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

const CAP = 500;

/**
 * Tags for reprinting (ported from PureBid MI).
 *
 * GET /api/admin/items/labels
 *   ?ids=a,b,c                     those items, in listing order (any lister)
 *   ?auctionId=X&filter=unprinted  every tag still owed in that auction (anyone's)
 *   ?auctionId=X&filter=all        every tagged item in that auction
 *   { items: [{ id, itemCode, title, storageLocation }], capped }
 * POST /api/admin/items/labels { itemIds }  stamp printed (same as the queue).
 */
export async function GET(request: NextRequest) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const idsParam = sp.get("ids");
  const auctionId = sp.get("auctionId");
  const filter = sp.get("filter") === "all" ? "all" : "unprinted";

  const where: Prisma.ItemWhereInput = { organizationId: membership.organizationId };
  if (idsParam) {
    where.id = { in: idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, CAP) };
  } else if (auctionId) {
    where.auctionId = auctionId;
    where.itemCode = { not: null }; // a tag without a code is blank
    if (filter !== "all") where.tagPrintedAt = null;
  } else {
    return NextResponse.json({ items: [], capped: false });
  }

  const items = await prisma.item.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: CAP,
    select: { id: true, itemCode: true, title: true, storageLocation: true },
  });
  return NextResponse.json({ items, capped: items.length >= CAP });
}

export async function POST(request: NextRequest) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { itemIds } = await request.json().catch(() => ({ itemIds: [] }));
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return NextResponse.json({ error: "No items given" }, { status: 400 });
  }
  const res = await prisma.item.updateMany({
    where: { id: { in: itemIds.slice(0, CAP) }, organizationId: membership.organizationId },
    data: { tagPrintedAt: new Date() },
  });
  return NextResponse.json({ success: true, marked: res.count });
}
