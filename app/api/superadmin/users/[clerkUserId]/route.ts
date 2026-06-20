import { requireSuperAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Props { params: Promise<{ clerkUserId: string }> }

export async function GET(_req: NextRequest, { params }: Props) {
  await requireSuperAdmin();
  const { clerkUserId } = await params;

  const [profile, bids, payments, memberships] = await Promise.all([
    prisma.bidderProfile.findUnique({ where: { clerkUserId } }),

    prisma.bid.findMany({
      where: { clerkUserId },
      include: {
        item: {
          include: {
            photos: { where: { isPrimary: true }, take: 1 },
            auction: {
              include: { organization: { select: { name: true, slug: true } } },
            },
          },
        },
      },
      orderBy: { placedAt: "desc" },
      take: 100,
    }),

    prisma.payment.findMany({
      where: { clerkUserId },
      include: {
        item: {
          select: {
            id: true,
            title: true,
            auction: {
              select: {
                title: true,
                organization: { select: { name: true, id: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),

    prisma.orgMember.findMany({
      where: { clerkUserId },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
      },
    }),
  ]);

  return NextResponse.json({
    profile,
    bids: bids.map((b) => ({
      ...b,
      amount: Number(b.amount),
      item: b.item
        ? {
            ...b.item,
            currentBid: Number(b.item.currentBid),
            startingBid: Number(b.item.startingBid),
          }
        : null,
    })),
    payments: payments.map((p) => ({
      ...p,
      amount: Number(p.amount),
      applicationFeeAmount: p.applicationFeeAmount ? Number(p.applicationFeeAmount) : null,
      taxAmount: p.taxAmount ? Number(p.taxAmount) : null,
    })),
    memberships,
  });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  await requireSuperAdmin();
  const { clerkUserId } = await params;
  const { name, email, phone } = await request.json();

  const profile = await prisma.bidderProfile.upsert({
    where: { clerkUserId },
    update: {
      ...(name !== undefined && { name: name || null }),
      ...(email !== undefined && { email: email || null }),
      ...(phone !== undefined && { phone: phone || null }),
    },
    create: { clerkUserId, name: name || null, email: email || null, phone: phone || null },
  });

  return NextResponse.json({ success: true, profile });
}
