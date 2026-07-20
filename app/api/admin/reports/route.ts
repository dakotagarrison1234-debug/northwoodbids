export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

// Stripe standard US pricing: 2.9% + $0.30 per successful charge (per PaymentIntent).
const STRIPE_PCT = 0.029;
const STRIPE_FIXED = 0.3;
const ROW_CAP = 20000;

const num = (d: unknown) => (d == null ? 0 : Number(d));
const r2 = (n: number) => Math.round(n * 100) / 100;

type Bucket = {
  key: string;
  label: string;
  when: string | null;
  itemsSold: number;
  hammer: number;
  premium: number;
  tax: number;
  credit: number;
  fees: number;
  net: number;
  /** Cross-split: for an auction this is its warehouses, and vice versa. */
  split: Map<string, number>;
};

const newBucket = (key: string, label: string, when: string | null = null): Bucket => ({
  key, label, when,
  itemsSold: 0, hammer: 0, premium: 0, tax: 0, credit: 0, fees: 0, net: 0,
  split: new Map(),
});

/**
 * Every report on the page comes from this one endpoint, computed from one set of
 * rows, so the figures can't drift apart from each other.
 *
 * NET is the only number that matters to the operator: hammer + premium − Bid Bucks
 * credit − Stripe's cut. Sales tax is deliberately absent — it's collected from the
 * buyer and handed to Michigan, so it passes through and nets to zero.
 *
 * Two subtleties that would otherwise produce wrong numbers:
 *  1. Stripe charges once per PaymentIntent, not per item. A buyer winning six lots
 *     across two auctions is ONE fee, which is then split across those rows in
 *     proportion to what each was worth — never counted once per row.
 *  2. Admin comps are PAID rows worth $0. They're excluded outright: they earned
 *     nothing and would otherwise count as items sold and drag every average down.
 */
export async function GET(req: NextRequest) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;

  const orgConfig = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { platformFeePercent: true, taxPercent: true, taxExempt: true },
  });
  const feePercent = num(orgConfig?.platformFeePercent);
  const taxPercent = orgConfig?.taxExempt ? 0 : num(orgConfig?.taxPercent);

  const range = req.nextUrl.searchParams.get("range") || "90d";
  const now = new Date();
  let from: Date | null = null;
  if (range === "30d") from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  else if (range === "90d") from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  else if (range === "ytd") from = new Date(now.getFullYear(), 0, 1);

  const paidRows = await prisma.payment.findMany({
    where: {
      status: "PAID",
      comped: false,
      item: { organizationId: orgId },
      ...(from ? { createdAt: { gte: from } } : {}),
    },
    select: {
      amount: true, applicationFeeAmount: true, taxAmount: true, creditApplied: true,
      stripePaymentIntentId: true, createdAt: true,
      item: {
        select: {
          auctionId: true,
          auction: { select: { title: true, endAt: true } },
          location: { select: { id: true, name: true } },
        },
      },
    },
    take: ROW_CAP,
  });

  // ── Allocate each Stripe charge across the rows that shared it ───────────────
  const grossOf = (p: (typeof paidRows)[number]) =>
    num(p.amount) + num(p.applicationFeeAmount) + num(p.taxAmount) - num(p.creditApplied ?? 0);

  const piGross = new Map<string, number>();
  for (const p of paidRows) {
    if (!p.stripePaymentIntentId) continue;
    piGross.set(p.stripePaymentIntentId, (piGross.get(p.stripePaymentIntentId) ?? 0) + grossOf(p));
  }
  const feeForRow = (p: (typeof paidRows)[number]): number => {
    const gross = grossOf(p);
    if (!p.stripePaymentIntentId) return gross > 0 ? gross * STRIPE_PCT + STRIPE_FIXED : 0;
    const total = piGross.get(p.stripePaymentIntentId) ?? 0;
    if (total <= 0) return 0;
    const totalFee = total * STRIPE_PCT + STRIPE_FIXED;
    return totalFee * (gross / total);
  };

  // ── Aggregate ───────────────────────────────────────────────────────────────
  const byAuction = new Map<string, Bucket>();
  const byWarehouse = new Map<string, Bucket>();
  const totals = newBucket("all", "All");
  const uniqueCharges = new Set<string>();
  let soloCharges = 0;

  const monthWindows: { label: string; start: Date; end: Date; net: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    monthWindows.push({
      label: start.toLocaleString("en-US", { month: "short" }),
      start, end, net: 0,
    });
  }

  const add = (b: Bucket, p: (typeof paidRows)[number], fee: number) => {
    const sale = num(p.amount);
    const prem = num(p.applicationFeeAmount);
    const tax = num(p.taxAmount);
    const credit = num(p.creditApplied ?? 0);
    b.itemsSold += 1;
    b.hammer += sale;
    b.premium += prem;
    b.tax += tax;
    b.credit += credit;
    b.fees += fee;
    b.net += sale + prem - credit - fee;
  };

  for (const p of paidRows) {
    const fee = feeForRow(p);
    if (p.stripePaymentIntentId) uniqueCharges.add(p.stripePaymentIntentId);
    else if (grossOf(p) > 0) soloCharges++;

    const aKey = p.item?.auctionId ?? "none";
    const aLabel = p.item?.auction?.title ?? "No auction";
    if (!byAuction.has(aKey)) {
      byAuction.set(aKey, newBucket(aKey, aLabel, p.item?.auction?.endAt?.toISOString() ?? null));
    }
    const wKey = p.item?.location?.id ?? "none";
    const wLabel = p.item?.location?.name ?? "Unassigned";
    if (!byWarehouse.has(wKey)) byWarehouse.set(wKey, newBucket(wKey, wLabel));

    const ab = byAuction.get(aKey)!;
    const wb = byWarehouse.get(wKey)!;
    add(ab, p, fee);
    add(wb, p, fee);
    add(totals, p, fee);

    const rowNet = num(p.amount) + num(p.applicationFeeAmount) - num(p.creditApplied ?? 0) - fee;
    ab.split.set(wLabel, (ab.split.get(wLabel) ?? 0) + rowNet);
    wb.split.set(aLabel, (wb.split.get(aLabel) ?? 0) + rowNet);

    for (const m of monthWindows) {
      if (p.createdAt >= m.start && p.createdAt < m.end) { m.net += rowNet; break; }
    }
  }

  // ── Money left on the table ─────────────────────────────────────────────────
  // Every winner who had a max bid set usually pays LESS than that max — the item
  // stops at one increment over the runner-up. The gap between what their max would
  // have paid and what they actually paid is demand you had but didn't capture.
  // A large number here says items are closing too cheaply: too few bidders in the
  // room, increments too small, or reserves set too low.
  const wonBids = await prisma.bid.findMany({
    where: {
      status: "WON",
      item: { organizationId: orgId },
      ...(from ? { placedAt: { gte: from } } : {}),
    },
    select: { itemId: true, clerkUserId: true, amount: true },
    take: ROW_CAP,
  });
  const wonItemIds = wonBids.map((b) => b.itemId);
  const proxies = wonItemIds.length
    ? await prisma.proxyBid.findMany({
        where: { itemId: { in: wonItemIds } },
        select: { itemId: true, clerkUserId: true, maxAmount: true },
      })
    : [];
  const proxyByKey = new Map(proxies.map((p) => [`${p.itemId}:${p.clerkUserId}`, num(p.maxAmount)]));

  let headroomTotal = 0;
  let headroomItems = 0;
  let biggestGap = 0;
  for (const b of wonBids) {
    const max = proxyByKey.get(`${b.itemId}:${b.clerkUserId}`);
    if (max == null) continue;                 // won by hand, no max was set
    const gap = max - num(b.amount);
    if (gap <= 0) continue;                    // paid their full max — nothing left
    headroomTotal += gap;
    headroomItems += 1;
    if (gap > biggestGap) biggestGap = gap;
  }

  // ── Still owed ──────────────────────────────────────────────────────────────
  const owedRows = await prisma.payment.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      comped: false,
      item: { organizationId: orgId },
    },
    select: {
      clerkUserId: true, amount: true, applicationFeeAmount: true, taxAmount: true,
      item: { select: { title: true } },
    },
    take: 2000,
  });
  const owedBy = new Map<string, { amountDue: number; items: string[] }>();
  for (const p of owedRows) {
    const cur = owedBy.get(p.clerkUserId) ?? { amountDue: 0, items: [] };
    cur.amountDue += num(p.amount) + num(p.applicationFeeAmount) + num(p.taxAmount);
    if (p.item?.title) cur.items.push(p.item.title);
    owedBy.set(p.clerkUserId, cur);
  }
  const owedIds = [...owedBy.keys()];
  const profiles = owedIds.length
    ? await prisma.bidderProfile.findMany({
        where: { clerkUserId: { in: owedIds } },
        select: { clerkUserId: true, name: true, email: true, phone: true },
      })
    : [];
  const pMap = new Map(profiles.map((x) => [x.clerkUserId, x]));
  const owers = [...owedBy.entries()]
    .map(([uid, v]) => ({
      name: pMap.get(uid)?.name ?? "Bidder",
      email: pMap.get(uid)?.email ?? "",
      phone: pMap.get(uid)?.phone ?? "",
      amountDue: r2(v.amountDue),
      itemCount: v.items.length,
    }))
    .sort((a, b) => b.amountDue - a.amountDue);

  const out = (b: Bucket) => ({
    key: b.key,
    label: b.label,
    when: b.when,
    itemsSold: b.itemsSold,
    hammer: r2(b.hammer),
    premium: r2(b.premium),
    tax: r2(b.tax),
    credit: r2(b.credit),
    fees: r2(b.fees),
    net: r2(b.net),
    avgItem: b.itemsSold > 0 ? r2(b.hammer / b.itemsSold) : 0,
    split: [...b.split.entries()]
      .map(([label, net]) => ({ label, net: r2(net) }))
      .sort((x, y) => y.net - x.net),
  });

  return NextResponse.json({
    range,
    feePercent,
    taxPercent,
    totals: {
      ...out(totals),
      buyersPaid: r2(totals.hammer + totals.premium + totals.tax),
      chargeCount: uniqueCharges.size + soloCharges,
    },
    headroom: {
      total: r2(headroomTotal),
      items: headroomItems,
      biggest: r2(biggestGap),
      avg: headroomItems > 0 ? r2(headroomTotal / headroomItems) : 0,
    },
    trend: monthWindows.map((m) => ({ label: m.label, net: r2(m.net) })),
    auctions: [...byAuction.values()].map(out).sort((a, b) => b.net - a.net),
    warehouses: [...byWarehouse.values()].map(out).sort((a, b) => b.net - a.net),
    owed: {
      total: r2(owers.reduce((s, o) => s + o.amountDue, 0)),
      count: owers.length,
      owers: owers.slice(0, 25),
    },
  });
}
