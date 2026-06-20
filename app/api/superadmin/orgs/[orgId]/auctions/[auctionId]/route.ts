import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface Props { params: Promise<{ orgId: string; auctionId: string }> }

export async function PATCH(request: NextRequest, { params }: Props) {
  await requireSuperAdmin();
  const { auctionId } = await params;
  const body = await request.json();

  const auction = await prisma.auction.update({
    where: { id: auctionId },
    data: {
      ...(body.title && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.status && { status: body.status }),
      ...(body.startAt && { startAt: new Date(body.startAt) }),
      ...(body.endAt && { endAt: new Date(body.endAt) }),
    },
  });
  return NextResponse.json({ success: true, auction });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  await requireSuperAdmin();
  const { auctionId } = await params;

  await prisma.$transaction([
    prisma.itemPhoto.deleteMany({ where: { item: { auctionId } } }),
    prisma.bid.deleteMany({ where: { item: { auctionId } } }),
    prisma.payment.deleteMany({ where: { item: { auctionId } } }),
    prisma.item.updateMany({ where: { auctionId }, data: { auctionId: null } }),
    prisma.auction.delete({ where: { id: auctionId } }),
  ]);

  return NextResponse.json({ success: true });
}
