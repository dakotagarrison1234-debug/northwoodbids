import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

  const payments = await prisma.payment.findMany({
    where: { item: { organizationId: orgId } },
    select: {
      amount: true,
      taxAmount: true,
      applicationFeeAmount: true,
      status: true,
      stripePaymentIntentId: true,
      createdAt: true,
      clerkUserId: true,
      item: { select: { title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const num = (d: unknown) => (d == null ? 0 : Number(d));

  const paid = payments.filter((p) => p.status === "PAID");
  const outstanding = payments.filter((p) => p.status === "PENDING" || p.status === "FAILED");

  // ── Totals on PAID sales ──
  let grossSales = 0;   // sum of winning-bid amounts
  let taxCollected = 0; // sum of sales tax (owed to Michigan)
  let totalCharged = 0; // what buyers actually paid (bid + tax + any fee)
  for (const p of paid) {
    const amt = num(p.amount);
    const tax = num(p.taxAmount);
    const fee = num(p.applicationFeeAmount);
    grossSales += amt;
    taxCollected += tax;
    totalCharged += amt + tax + fee;
  }

  // ── Stripe fees: one 2.9% + $0.30 charge per PaymentIntent ──
  const piGross = new Map<string, number>();
  for (const p of paid) {
    const pi = p.stripePaymentIntentId ?? `solo-${Math.random()}`;
    const gross = num(p.amount) + num(p.taxAmount) + num(p.applicationFeeAmount);
    piGross.set(pi, (piGross.get(pi) ?? 0) + gross);
  }
  const txnCount = piGross.size;
  let stripeFees = 0;
  for (const gross of piGross.values()) {
    stripeFees += gross * STRIPE_PCT + STRIPE_FIXED;
  }
  const netDeposited = totalCharged - stripeFees;          // what Stripe pays out
  const netProfit = netDeposited - taxCollected;           // after remitting MI tax

  // ── Who owes (unpaid / failed) ──
  const owedByUser = new Map<string, { amount: number; items: string[] }>();
  for (const p of outstanding) {
    const due = num(p.amount) + num(p.taxAmount);
    const cur = owedByUser.get(p.clerkUserId) ?? { amount: 0, items: [] };
    cur.amount += due;
    if (p.item?.title) cur.items.push(p.item.title);
    owedByUser.set(p.clerkUserId, cur);
  }
  const owedIds = [...owedByUser.keys()];
  const profiles = owedIds.length
    ? await prisma.bidderProfile.findMany({
        where: { clerkUserId: { in: owedIds } },
        select: { clerkUserId: true, name: true, email: true, phone: true },
      })
    : [];
  const pMap = new Map(profiles.map((pr) => [pr.clerkUserId, pr]));
  const owers = owedIds.map((id) => {
    const o = owedByUser.get(id)!;
    const pr = pMap.get(id);
    return {
      name: pr?.name ?? "Bidder",
      email: pr?.email ?? "",
      phone: pr?.phone ?? "",
      amountDue: Math.round(o.amount * 100) / 100,
      items: o.items,
    };
  }).sort((a, b) => b.amountDue - a.amountDue);
  const totalOutstanding = owers.reduce((s, o) => s + o.amountDue, 0);

  // ── Time periods (based on PAID sales) ──
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const sumPaidSince = (since: Date) =>
    paid.filter((p) => p.createdAt >= since).reduce((s, p) => s + num(p.amount) + num(p.taxAmount), 0);

  const weekSales = sumPaidSince(weekAgo);
  const monthSales = sumPaidSince(monthStart);

  // last 6 calendar months breakdown (bid + tax charged)
  const byMonth: { label: string; total: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const total = paid
      .filter((p) => p.createdAt >= start && p.createdAt < end)
      .reduce((s, p) => s + num(p.amount) + num(p.taxAmount), 0);
    byMonth.push({ label: start.toLocaleString("en-US", { month: "short", year: "2-digit" }), total: Math.round(total * 100) / 100 });
  }

  const round = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json({
    totals: {
      grossSales: round(grossSales),
      taxCollected: round(taxCollected),
      totalCharged: round(totalCharged),
      stripeFees: round(stripeFees),
      netDeposited: round(netDeposited),
      netProfit: round(netProfit),
      itemsSold: paid.length,
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
