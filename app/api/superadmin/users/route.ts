import { requireSuperAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  await requireSuperAdmin();
  const search = request.nextUrl.searchParams.get("search") || "";

  const profiles = await prisma.bidderProfile.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {},
    orderBy: { createdAt: "desc" },
  });

  const userIds = profiles.map((p) => p.clerkUserId);

  const [bidCounts, payments] = await Promise.all([
    prisma.bid.groupBy({
      by: ["clerkUserId"],
      where: { clerkUserId: { in: userIds } },
      _count: true,
    }),
    prisma.payment.findMany({
      where: { clerkUserId: { in: userIds } },
      select: { clerkUserId: true, status: true, amount: true },
    }),
  ]);

  const bidCountMap = new Map(bidCounts.map((b) => [b.clerkUserId, b._count]));

  const paymentsByUser = new Map<string, typeof payments>();
  for (const p of payments) {
    const arr = paymentsByUser.get(p.clerkUserId) || [];
    arr.push(p);
    paymentsByUser.set(p.clerkUserId, arr);
  }

  const users = profiles.map((p) => ({
    ...p,
    bidCount: bidCountMap.get(p.clerkUserId) || 0,
    paidTotal: (paymentsByUser.get(p.clerkUserId) || [])
      .filter((x) => x.status === "PAID")
      .reduce((s, x) => s + Number(x.amount), 0),
    failedPayments: (paymentsByUser.get(p.clerkUserId) || []).filter(
      (x) => x.status === "FAILED"
    ).length,
    unpaidTotal: (paymentsByUser.get(p.clerkUserId) || [])
      .filter((x) => x.status === "PENDING" || x.status === "FAILED")
      .reduce((s, x) => s + Number(x.amount), 0),
  }));

  return NextResponse.json({ users });
}
