export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

// Per-bidder analytics for the org, computed from bids + payments and joined to
// BidderProfile by clerkUserId. Everything is scoped to the org through the item
// relation (BidderProfile itself is a global table), and archived auctions are
// excluded so test/junk auctions never skew the numbers.

const DAY = 24 * 60 * 60 * 1000;
const num = (d: unknown) => (d == null ? 0 : Number(d));
const r2 = (n: number) => Math.round(n * 100) / 100;
const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / DAY);

export async function GET() {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * DAY);
  const d60 = new Date(now.getTime() - 60 * DAY);

  // Reusable org scope for anything joined through an item.
  const itemScope = {
    item: { organizationId: orgId, OR: [{ auction: { archived: false } }, { auctionId: null }] },
  };

  const [
    bidAgg,       // all-time bids per user: count + last bid
    wonAgg,       // wins per user
    active30Agg,  // users who bid in last 30d
    active60Agg,  // users who bid in last 60d
    spendAgg,     // paid $ per user (hammer + premium)
  ] = await Promise.all([
    prisma.bid.groupBy({
      by: ["clerkUserId"],
      where: itemScope,
      _count: { id: true },
      _max: { placedAt: true },
    }),
    prisma.bid.groupBy({
      by: ["clerkUserId"],
      where: { ...itemScope, status: "WON" },
      _count: { id: true },
    }),
    prisma.bid.groupBy({
      by: ["clerkUserId"],
      where: { ...itemScope, placedAt: { gte: d30 } },
      _count: { id: true },
    }),
    prisma.bid.groupBy({
      by: ["clerkUserId"],
      where: { ...itemScope, placedAt: { gte: d60 } },
      _count: { id: true },
    }),
    prisma.payment.groupBy({
      by: ["clerkUserId"],
      where: { status: "PAID", comped: false, ...itemScope },
      _sum: { amount: true, applicationFeeAmount: true },
      _count: { id: true },
    }),
  ]);

  const bidCountBy = new Map(bidAgg.map((b) => [b.clerkUserId, b._count.id]));
  const lastBidBy = new Map(bidAgg.map((b) => [b.clerkUserId, b._max.placedAt]));
  const wonBy = new Map(wonAgg.map((w) => [w.clerkUserId, w._count.id]));
  const active30 = new Set(active30Agg.map((a) => a.clerkUserId));
  const active60 = new Set(active60Agg.map((a) => a.clerkUserId));
  const spendBy = new Map(
    spendAgg.map((s) => [s.clerkUserId, num(s._sum.amount) + num(s._sum.applicationFeeAmount)])
  );
  const paidItemsBy = new Map(spendAgg.map((s) => [s.clerkUserId, s._count.id]));

  // Single-business site: every signed-up customer is one of our bidders, so the
  // universe is all profiles (matches the Bidders page). Spend/bids are still
  // attributed through this org's items via the aggregates above.
  const activityIds = new Set<string>([...bidCountBy.keys(), ...spendBy.keys()]);
  const profiles = await prisma.bidderProfile.findMany({
    select: {
      clerkUserId: true, name: true, email: true, phone: true,
      createdAt: true, blocked: true,
    },
    take: 10000,
  });

  const profById = new Map(profiles.map((p) => [p.clerkUserId, p]));
  // Include any active user missing a profile row (defensive — shouldn't happen).
  for (const id of activityIds) {
    if (!profById.has(id)) {
      profById.set(id, { clerkUserId: id, name: null, email: null, phone: null, createdAt: now, blocked: false });
    }
  }

  // ── Per-bidder rows ─────────────────────────────────────────────────────────
  const rows = [...profById.values()].map((p) => {
    const bids = bidCountBy.get(p.clerkUserId) ?? 0;
    const lastBid = lastBidBy.get(p.clerkUserId) ?? null;
    const daysSinceSignup = daysBetween(now, p.createdAt);
    const daysSinceLastBid = lastBid ? daysBetween(now, lastBid) : null;
    const isNew = daysSinceSignup <= 30;
    const neverBid = bids === 0;
    const inA30 = active30.has(p.clerkUserId);
    const inA60 = active60.has(p.clerkUserId);
    const stale = bids > 0 && !inA60; // bid before, none in 60 days

    // Single headline status for the table (most-actionable first).
    let status: string;
    if (neverBid) status = "Never bid";
    else if (inA30) status = "Active 30d";
    else if (inA60) status = "Active 60d";
    else status = "Stale";

    return {
      clerkUserId: p.clerkUserId,
      name: p.name || p.email || "Bidder",
      email: p.email ?? "",
      phone: p.phone ?? "",
      blocked: p.blocked,
      signupAt: p.createdAt.toISOString(),
      daysSinceSignup,
      bids,
      won: wonBy.get(p.clerkUserId) ?? 0,
      paidItems: paidItemsBy.get(p.clerkUserId) ?? 0,
      spend: r2(spendBy.get(p.clerkUserId) ?? 0),
      lastBidAt: lastBid ? lastBid.toISOString() : null,
      daysSinceLastBid,
      isNew, neverBid, active30: inA30, active60: inA60, stale,
    };
  });

  // ── Summary ─────────────────────────────────────────────────────────────────
  const totalBidders = rows.length;
  const everBid = rows.filter((r) => !r.neverBid).length;
  const payers = rows.filter((r) => r.spend > 0);
  const totalRevenue = r2(rows.reduce((s, r) => s + r.spend, 0));
  const summary = {
    totalBidders,
    newBidders: rows.filter((r) => r.isNew).length,
    neverBid: rows.filter((r) => r.neverBid).length,
    everBid,
    active30: rows.filter((r) => r.active30).length,
    active60: rows.filter((r) => r.active60).length,
    stale: rows.filter((r) => r.stale).length,
    blocked: rows.filter((r) => r.blocked).length,
    totalBids: rows.reduce((s, r) => s + r.bids, 0),
    totalRevenue,
    payers: payers.length,
    avgSpendPerPayer: payers.length ? r2(totalRevenue / payers.length) : 0,
    avgSpendPerBidder: totalBidders ? r2(totalRevenue / totalBidders) : 0,
  };

  // ── Weekly signup trend (last 12 rolling weeks, oldest → newest) ─────────────
  const signupTrend: { label: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(now.getTime() - (i + 1) * 7 * DAY);
    const end = new Date(now.getTime() - i * 7 * DAY);
    const count = rows.filter((r) => {
      const t = new Date(r.signupAt).getTime();
      return t >= start.getTime() && t < end.getTime();
    }).length;
    signupTrend.push({
      label: start.toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
      count,
    });
  }

  // ── Top spenders (leaderboard) ───────────────────────────────────────────────
  const topSpenders = [...rows]
    .filter((r) => r.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10)
    .map((r) => ({ name: r.name, spend: r.spend, won: r.won }));

  return NextResponse.json({ summary, signupTrend, topSpenders, bidders: rows });
}
