import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface Props { params: Promise<{ orgId: string; itemId: string }> }

export async function PATCH(request: NextRequest, { params }: Props) {
  await requireSuperAdmin();
  const { itemId } = await params;
  const body = await request.json();

  const item = await prisma.item.update({
    where: { id: itemId },
    data: {
      ...(body.title && { title: body.title }),
      ...(body.status && { status: body.status }),
      ...(body.startingBid !== undefined && { startingBid: parseFloat(body.startingBid) }),
      ...(body.auctionId !== undefined && { auctionId: body.auctionId || null }),
    },
  });
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
