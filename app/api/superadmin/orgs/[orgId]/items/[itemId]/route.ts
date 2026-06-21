import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface Props { params: Promise<{ orgId: string; itemId: string }> }

const ITEM_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "SOLD",
  "UNSOLD",
  "PENDING_PICKUP",
  "PICKED_UP",
] as const;

export async function PATCH(request: NextRequest, { params }: Props) {
  await requireSuperAdmin();
  const { orgId, itemId } = await params;
  const body = await request.json();

  // Validate status against the ItemStatus enum.
  if (body.status !== undefined && !ITEM_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Validate startingBid is finite and >= 0.
  if (body.startingBid !== undefined && body.startingBid !== null && body.startingBid !== "") {
    const n = Number(body.startingBid);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: "Invalid startingBid" }, { status: 400 });
    }
  }

  // Key the update on { id, organizationId } so a super admin can't accidentally
  // mutate an item that doesn't belong to the org in the URL.
  const result = await prisma.item.updateMany({
    where: { id: itemId, organizationId: orgId },
    data: {
      ...(body.title && { title: body.title }),
      ...(body.status && { status: body.status }),
      ...(body.startingBid !== undefined && { startingBid: parseFloat(body.startingBid) }),
      ...(body.auctionId !== undefined && { auctionId: body.auctionId || null }),
    },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const item = await prisma.item.findUnique({ where: { id: itemId } });
  return NextResponse.json({ success: true, item });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  await requireSuperAdmin();
  const { itemId } = await params;

  await prisma.$transaction([
    prisma.itemPhoto.deleteMany({ where: { itemId } }),
    prisma.bid.deleteMany({ where: { itemId } }),
    prisma.payment.deleteMany({ where: { itemId } }),
    prisma.item.delete({ where: { id: itemId } }),
  ]);

  return NextResponse.json({ success: true });
}
