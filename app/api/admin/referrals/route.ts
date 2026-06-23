export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg, isSuperAdmin } from "@/lib/auth";

/**
 * GET /api/admin/referrals
 *
 * Admin audit view: every referral with both parties' names + status, plus a
 * per-bidder Bid Bucks balance ledger so the owner can spot and correct issues.
 */
export async function GET() {
  const [membership, superAdmin] = await Promise.all([getUserOrg(), isSuperAdmin()]);
  const role = membership?.role;
  if (!superAdmin && role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [referrals, ledgerByUser, earnedByUser, redeemedByUser] = await Promise.all([
    prisma.referral.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.creditLedger.groupBy({ by: ["clerkUserId"], _sum: { amount: true } }),
    prisma.creditLedger.groupBy({
      by: ["clerkUserId"],
      where: { amount: { gt: 0 } },
      _sum: { amount: true },
    }),
    prisma.creditLedger.groupBy({
      by: ["clerkUserId"],
      where: { amount: { lt: 0 } },
      _sum: { amount: true },
    }),
  ]);

  // Resolve display info for everyone involved (referrers, referred, ledger users).
  const ids = new Set<string>();
  referrals.forEach((r) => { ids.add(r.referrerUserId); ids.add(r.referredUserId); });
  ledgerByUser.forEach((l) => ids.add(l.clerkUserId));
  const profiles = ids.size
    ? await prisma.bidderProfile.findMany({
        where: { clerkUserId: { in: [...ids] } },
        select: { clerkUserId: true, name: true, email: true, phone: true },
      })
    : [];
  const byId = new Map(profiles.map((p) => [p.clerkUserId, p]));
  const who = (id: string) => {
    const p = byId.get(id);
    return { clerkUserId: id, name: p?.name ?? null, email: p?.email ?? null, phone: p?.phone ?? null };
  };

  const earnedMap = new Map(earnedByUser.map((e) => [e.clerkUserId, Number(e._sum.amount ?? 0)]));
  const redeemedMap = new Map(redeemedByUser.map((e) => [e.clerkUserId, Math.abs(Number(e._sum.amount ?? 0))]));

  const balances = ledgerByUser
    .map((l) => ({
      ...who(l.clerkUserId),
      balance: Number(l._sum.amount ?? 0),
      earned: earnedMap.get(l.clerkUserId) ?? 0,
      redeemed: redeemedMap.get(l.clerkUserId) ?? 0,
    }))
    .sort((a, b) => b.balance - a.balance);

  return NextResponse.json({
    referrals: referrals.map((r) => ({
      id: r.id,
      status: r.status,
      blockedReason: r.blockedReason,
      code: r.code,
      createdAt: r.createdAt.toISOString(),
      earnedAt: r.earnedAt ? r.earnedAt.toISOString() : null,
      referrer: who(r.referrerUserId),
      referred: who(r.referredUserId),
    })),
    balances,
  });
}
