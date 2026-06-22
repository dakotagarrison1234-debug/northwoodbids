import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { PaymentStatus } from "@prisma/client";
import { getUserOrg } from "@/lib/auth";

// Stripe standard pricing (US): 2.9% + $0.30 per successful charge.
const STRIPE_PCT = 0.029;
const STRIPE_FIXED = 0.30;

export async function GET() {
  const membership = await getUserOrg();
  if (!membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = membership.organizationId;

  const num = (d: unknown) => (d == null ? 0 : Number(d));

  // Live fee/tax percentages so report labels never drift from configured values.
  const orgConfig = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { platformFeePercent: true, taxPercent: true },
  });
  const feePercent = num(orgConfig?.platformFeePercent);
  const taxPercent = num(orgConfig?.taxPercent);

  const itemFilter = { item: { organizationId: orgId } };
  const paidWhere = { ...itemFilter, status: "PAID" as const };
  const outstandingWhere = {
    ...itemFilter,
    status: { in: ["PENDING", "FAILED"] as PaymentStatus[] },
  };

  // ── Time periods ──
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Build the 6 calendar-month windows up front so we can aggregate each in the DB.
  const monthWindows: { label: string; start: Date; end: Date }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    monthWindows.push({
      label: start.toLocaleString("en-US", { month: "short", year: "2-digit" }),
      start,
      end,
    });
  }

  const [
    paidTotals,
    itemsSold,
    feeGroups,
    soloPaid,
    weekAgg,
    monthAgg,
    monthBuckets,
    owedGroups,
    outstandingRows,
  ] = await Promise.all([
    // Totals on PAID sales — summed in the DB.
    prisma.payment.aggregate({
      where: paidWhere,
      _sum: { amount: true, taxAmount: true, applicationFeeAmount: true },
    }),
    prisma.payment.count({ where: paidWhere }),
    // Stripe fees: one charge per PaymentIntent. Group PAID rows by intent and sum gross.
    prisma.payment.groupBy({
      by: ["stripePaymentIntentId"],
      where: { ...paidWhere, stripePaymentIntentId: { not: null } },
      _sum: { amount: true, taxAmount: true, applicationFeeAmount: true },
    }),
    // PAID rows with no PaymentIntent are each their own (solo) transaction — keep per-row.
    prisma.payment.findMany({
      where: { ...paidWhere, stripePaymentIntentId: null },
      select: { amount: true, taxAmount: true, applicationFeeAmount: true },
    }),
    // Period sales (bid + tax) for the last 7 days and current calendar month.
    prisma.payment.aggregate({
      where: { ...paidWhere, createdAt: { gte: weekAgo } },
      _sum: { amount: true, taxAmount: true },
    }),
    prisma.payment.aggregate({
      where: { ...paidWhere, createdAt: { gte: monthStart } },
      _sum: { amount: true, taxAmount: true },
    }),
    // Last 6 calendar months, one aggregate per month window.
    Promise.all(
      monthWindows.map((w) =>
        prisma.payment.aggregate({
          where: { ...paidWhere, createdAt: { gte: w.start, lt: w.end } },
          _sum: { amount: true, taxAmount: true },
        })
      )
    ),
    // Who owes: sum due (bid + premium + tax) per buyer in the DB.
    prisma.payment.groupBy({
      by: ["clerkUserId"],
      where: outstandingWhere,
      _sum: { amount: true, taxAmount: true, applicationFeeAmount: true },
    }),
    // Item titles for the owers (outstanding rows only — a small, bounded subset).
    prisma.payment.findMany({
      where: outstandingWhere,
      select: { clerkUserId: true, item: { select: { title: true } } },
    }),
  ]);

  // ── Totals on PAID sales ──
  const grossSales = num(paidTotals._sum.amount);           // hammer amounts
  const taxCollected = num(paidTotals._sum.taxAmount);      // sales tax (owed to MI)
  const premiumCollected = num(paidTotals._sum.applicationFeeAmount); // buyer's premium
  const totalCharged = grossSales + taxCollected + premiumCollected;  // what buyers paid

  // ── Stripe fees: 2.9% + $0.30 per PaymentIntent (and per solo charge) ──
  let stripeFees = 0;
  let txnCount = 0;
  for (const g of feeGroups) {
    const gross = num(g._sum.amount) + num(g._sum.taxAmount) + num(g._sum.applicationFeeAmount);
    stripeFees += gross * STRIPE_PCT + STRIPE_FIXED;
    txnCount++;
  }
  for (const p of soloPaid) {
    const gross = num(p.amount) + num(p.taxAmount) + num(p.applicationFeeAmount);
    stripeFees += gross * STRIPE_PCT + STRIPE_FIXED;
    txnCount++;
  }
  const netDeposited = totalCharged - stripeFees;  // what Stripe pays out
  const netProfit = netDeposited - taxCollected;   // after remitting MI tax

  // ── Who owes (unpaid / failed) ──
  const titlesByUser = new Map<string, string[]>();
  for (const r of outstandingRows) {
    if (!r.item?.title) continue;
    const list = titlesByUser.get(r.clerkUserId) ?? [];
    list.push(r.item.title);
    titlesByUser.set(r.clerkUserId, list);
  }
  const owedIds = owedGroups.map((g) => g.clerkUserId);
  const profiles = owedIds.length
    ? await prisma.bidderProfile.findMany({
        where: { clerkUserId: { in: owedIds } },
        select: { clerkUserId: true, name: true, email: true, phone: true },
      })
    : [];
  const pMap = new Map(profiles.map((pr) => [pr.clerkUserId, pr]));
  const owers = owedGroups
    .map((g) => {
      const pr = pMap.get(g.clerkUserId);
      const amountDue = num(g._sum?.amount) + num(g._sum?.taxAmount) + num(g._sum?.applicationFeeAmount);
      return {
        name: pr?.name ?? "Bidder",
        email: pr?.email ?? "",
        phone: pr?.phone ?? "",
        amountDue: Math.round(amountDue * 100) / 100,
        items: titlesByUser.get(g.clerkUserId) ?? [],
      };
    })
    .sort((a, b) => b.amountDue - a.amountDue);
  const totalOutstanding = owers.reduce((s, o) => s + o.amountDue, 0);

  // ── Time periods (based on PAID sales) ──
  const weekSales = num(weekAgg._sum.amount) + num(weekAgg._sum.taxAmount);
  const monthSales = num(monthAgg._sum.amount) + num(monthAgg._sum.taxAmount);
  const byMonth = monthWindows.map((w, idx) => ({
    label: w.label,
    total:
      Math.round(
        (num(monthBuckets[idx]._sum.amount) + num(monthBuckets[idx]._sum.taxAmount)) * 100
      ) / 100,
  }));

  const round = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json({
    feePercent,
    taxPercent,
    totals: {
      grossSales: round(grossSales),
      premiumCollected: round(premiumCollected),
      taxCollected: round(taxCollected),
      totalCharged: round(totalCharged),
      stripeFees: round(stripeFees),
      netDeposited: round(netDeposited),
      netProfit: round(netProfit),
      itemsSold,
      txnCount,
    },
    periods: {
      weekSales: round(weekSales),
      monthSales: round(monthSales),
      byMonth,
    },
    outstanding: {
      total: round(totalOutstanding),
      count: owers.length,
      owers,
    },
  });
}
