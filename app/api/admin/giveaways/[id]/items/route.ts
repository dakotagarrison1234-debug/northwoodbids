export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { type OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";
import { generateItemCode } from "@/lib/itemCode";
import { deleteR2ObjectsByUrl } from "@/lib/r2";

async function ownGiveaway(id: string, orgId: string) {
  const g = await prisma.giveaway.findUnique({ where: { id }, select: { id: true, organizationId: true } });
  return g && g.organizationId === orgId ? g : null;
}

// POST /api/admin/giveaways/[id]/items — add a prize (creates the underlying Item).
// Body: { title, retailValue?, locationId?, photos?: string[] }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;
  if (!(await requireRole(orgId, ["OWNER", "ADMIN"] as OrgRole[]))) {
    return NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 });
  }
  const { id } = await params;
  if (!(await ownGiveaway(id, orgId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Prize needs a name." }, { status: 400 });

  const retailValue = body.retailValue != null && body.retailValue !== "" ? parseFloat(body.retailValue) : null;
  const locationId = typeof body.locationId === "string" && body.locationId ? body.locationId : null;
  const photos: string[] = Array.isArray(body.photos)
    ? body.photos.filter((u: unknown): u is string => typeof u === "string")
    : [];

  const item = await prisma.item.create({
    data: {
      organizationId: orgId,
      giveawayId: id,
      title: title.slice(0, 200),
      retailValue: retailValue != null && Number.isFinite(retailValue) ? retailValue : null,
      locationId,
      status: "DRAFT",
      itemCode: await generateItemCode(),
    },
    select: { id: true },
  });

  if (photos.length > 0) {
    await prisma.itemPhoto.createMany({
      data: photos.map((url, i) => ({ itemId: item.id, url, isPrimary: i === 0 })),
    });
  }

  return NextResponse.json({ success: true, itemId: item.id });
}

// DELETE /api/admin/giveaways/[id]/items?itemId=... — remove a prize not yet won.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;
  if (!(await requireRole(orgId, ["OWNER", "ADMIN"] as OrgRole[]))) {
    return NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 });
  }
  const { id } = await params;
  if (!(await ownGiveaway(id, orgId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const itemId = request.nextUrl.searchParams.get("itemId");
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { id: true, giveawayId: true, _count: { select: { bids: true } } },
  });
  if (!item || item.giveawayId !== id) return NextResponse.json({ error: "Prize not found" }, { status: 404 });
  if (item._count.bids > 0) {
    return NextResponse.json({ error: "This prize was already won — it can't be removed." }, { status: 409 });
  }

  const photos = await prisma.itemPhoto.findMany({ where: { itemId }, select: { url: true } });
  await prisma.item.delete({ where: { id: itemId } });
  if (photos.length > 0) await deleteR2ObjectsByUrl(photos.map((p) => p.url));
  return NextResponse.json({ success: true });
}
