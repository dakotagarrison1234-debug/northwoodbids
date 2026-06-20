import { requireSuperAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  await requireSuperAdmin();
  const status = request.nextUrl.searchParams.get("status");
  const orgId = request.nextUrl.searchParams.get("orgId");

  const payments = await prisma.payment.findMany({
    where: {
      ...(status ? { status: status as "PAID" | "FAILED" | "PENDING" | "REFUNDED" } : {}),
      ...(orgId ? { item: { organizationId: orgId } } : {}),
    },
    include: {
      item: {
        select: {
          id: true,
          title: true,
          organizationId: true,
          auction: {
            select: {
              title: true,
              slug: true,
              organization: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const userIds = [...new Set(payments.map((p) => p.clerkUserId))];
  const profiles = await prisma.bidderProfile.findMany({
    where: { clerkUserId: { in: userIds } },
    select: { clerkUserId: true, name: true, email: true },
  });
  const profileMap = new Map(profiles.map((p) => [p.clerkUserId, p]));

  return NextResponse.json({
    payments: payments.map((p) => ({
      ...p,
      amount: Number(p.amount),
      applicationFeeAmount: p.applicationFeeAmount ? Number(p.applicationFeeAmount) : null,
      taxAmount: p.taxAmount ? Number(p.taxAmount) : null,
      user: profileMap.get(p.clerkUserId) ?? null,
    })),
  });
}

export async function PATCH(request: NextRequest) {
  await requireSuperAdmin();
  const { paymentId, status } = await request.json();

  if (!paymentId || !status) {
    return NextResponse.json({ error: "paymentId and status required" }, { status: 400 });
  }

  const allowed = ["PAID", "FAILED", "PENDING", "REFUNDED"];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const payment = await prisma.payment.update({
    where: { id: paymentId },
    data: { status },
  });

  return NextResponse.json({ success: true, payment });
}
