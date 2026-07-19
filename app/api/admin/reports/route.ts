import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

// Stripe standard pricing (US): 2.9% + $0.30 per successful charge.
const STRIPE_PCT = 0.029;
const STRIPE_FIXED = 0.3;

// Safety cap. One row per item sold, so this is years of runway for a single shop.
const ROW_CAP = 20000;

const num = (d: unknown) => (d == null ? 0 : Number(d));
const round = (n: number) => Math.round(n * 100) / 100;

type Bucket = {
  key: string;
  label: string;
  sub?: string | null;
  itemsSold: number;
  hammer: number;
  premium: number;
  tax: number;
  charged: number;
  compedCount: number;
  compedHammer: number;
  unpaidCount: number;
  unpaidAmount: number;
};

function newBucket(key: string, label: string, sub?: string | null): Bucket {
  return {
    key, label, sub: sub ?? null,
    itemsSold: 0, hammer: 0, premium: 0, tax: 0, charged: 0,
    compedCount: 0, compedHammer: 0, unpaidCount: 0, unpaidAmount: 0,
  };
}

/**
 * One query, then every report is aggregated from it in memory. Deliberately not a
 * pile of separate DB aggregates: the numbers on this page have to reconcile with
 * each other exactly, and the surest way to guarantee that is to compute them all
 * from one identical set of rows.
 *
 * COMPED ROWS are the subtle bit. An admin win writes a PAID Payment with amount 0
 * and no PaymentIntent. So it must be excluded from revenue (it earned nothing), from
 * the item-sold count (nothing was sold), and — this was a live bug — from the Stripe
 * fee estimate, where it was being treated as its own charge and billed a phantom 30¢.
 * It's reported on its own line instead, valued at the item's real winning bid.
 */
export async function GET() {
  const membership = await getUserOrg();
  if (!membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = membership.organizationId;

  const orgConfig = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { platformFeePercent: true, taxPercent: true, taxExempt: true },
  });
  const feePercent = num(orgConfig?.platformFeePercent);
  const taxPercent = orgConfig?.taxExempt ? 0 : num(orgConfig?.taxPercent);

  const rows = await prisma.payment.findMany({
    where: { item: { organizationId: orgId } },
    select: {
      amount: true,
      taxAmount: true,
      applicationFeeAmount: true,
      status: true,
      comped: true,
      stripePaymentIntentId: true,
      createdAt: true,
      clerkUserId: true,
      item: {
        select: {
          title: true,
          currentBid: true,
          auctionId: true,
          auction: { select: { title: true, endAt: true } },
          location: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: ROW_CAP,
  });

  // ── Headline totals ────────────────────────────────────────────────────────
  let hammer = 0, premium = 0, tax = 0, itemsSold = 0;
  let compedCount = 0, compedHammer = 0;

  const byAuction = new Map<string, Bucket>();
  const byWarehouse = new Map<string, Bucket>();
  // Stripe charges one fee per PaymentIntent, not per item — group by intent.
  const intents = new Map<string, number>();
  let soloGross = 0, soloCount = 0;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  let weekSales = 0, monthSales = 0;

  const monthWindows: { label: string; start: Date; end: Date; total: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    monthWindows.push({
      label: start.toLocaleString("en-US", { month: "short", year: "2-digit" }),
      start, end, total: 0,
    });
  }

  // Who still owes money.
  const owedBy = new Map<string, { amountDue: number; items: string[] }>();

  for (const r of rows) {
    const a = num(r.amount);
    const t = num(r.taxAmount);
    const p = num(r.applicationFeeAmount);
    const gross = a + t + p;
    const itemHammer = num(r.item?.currentBid);

    const aucKey = r.item?.auctionId ?? "none";
    const aucLabel = r.item?.auction?.title ?? "No auction";
    if (!byAuction.has(aucKey)) {
      byAuction.set(
        aucKey,
        newBucket(aucKey, aucLabel, r.item?.auction?.endAt ? r.item.auction.endAt.toISOString() : null)
      );
    }
    const ab = byAuction.get(aucKey)!;

    const whKey = r.item?.location?.id ?? "none";
    const whLabel = r.item?.location?.name ?? "No warehouse";
    if (!byWarehouse.has(whKey)) byWarehouse.set(whKey, newBucket(whKey, whLabel));
    const wb = byWarehouse.get(whKey)!;

    if (r.comped) {
      // Won by an admin — honored, never charged. Counted, never banked.
      compedCount++;
      compedHammer += itemHammer;
      ab.compedCount++; ab.compedHammer += itemHammer;
      wb.compedCount++; wb.compedHammer += itemHammer;
      continue;
    }

    if (r.status === "PAID") {
      hammer += a; premium += p; tax += t; itemsSold++;
      ab.itemsSold++; ab.hammer += a; ab.premium += p; ab.tax += t; ab.charged += gross;
      wb.itemsSold++; wb.hammer += a; wb.premium += p; wb.tax += t; wb.charged += gross;

      if (r.stripePaymentIntentId) {
        intents.set(r.stripePaymentIntentId, (intents.get(r.stripePaymentIntentId) ?? 0) + gross);
      } else {
        // A genuine no-intent charge (e.g. fully covered by Bid Bucks) — its own line.
        soloGross += gross; soloCount++;
      }

      if (r.createdAt >= weekAgo) weekSales += a + t;
      if (r.createdAt >= monthStart) monthSales += a + t;
      for (const w of monthWindows) {
        if (r.createdAt >= w.start && r.createdAt < w.end) { w.total += a + t; break; }
      }
    } else if (r.status === "PENDING" || r.status === "FAILED") {
      ab.unpaidCount++; ab.unpaidAmount += gross;
      wb.unpaidCount++; wb.unpaidAmount += gross;
      const cur = owedBy.get(r.clerkUserId) ?? { amountDue: 0, items: [] };
      cur.amountDue += gross;
      if (r.item?.title) cur.items.push(r.item.title);
      owedBy.set(r.clerkUserId, cur);
    }
  }

  const totalCharged = hammer + premium + tax;

  // Stripe fee estimate: one 2.9% + 30¢ per real charge.
  let stripeFees = 0;
  let txnCount = 0;
  for (const gross of intents.values()) { stripeFees += gross * STRIPE_PCT + STRIPE_FIXED; txnCount++; }
  stripeFees += soloGross * STRIPE_PCT + STRIPE_FIXED * soloCount;
  txnCount += soloCount;

  const netDeposited = totalCharged - stripeFees; // what Stripe actually pays out
  const netProfit = netDeposited - tax;           // after remitting sales tax to MI

  // ── Who owes ───────────────────────────────────────────────────────────────
  const owedIds = [...owedBy.keys()];
  const profiles = owedIds.length
    ? await prisma.bidderProfile.findMany({
        where: { clerkUserId: { in: owedIds } },
        select: { clerkUserId: true, name: true, email: true, phone: true },
      })
    : [];
  const pMap = new Map(profiles.map((pr) => [pr.clerkUserId, pr]));
  const owers = [...owedBy.entries()]
    .map(([uid, v]) => {
      const pr = pMap.get(uid);
      return {
        name: pr?.name ?? "Bidder",
        email: pr?.email ?? "",
        phone: pr?.phone ?? "",
        amountDue: round(v.amountDue),
        items: v.items,
      };
    })
    .sort((a, b) => b.amountDue - a.amountDue);
  const totalOutstanding = owers.reduce((s, o) => s + o.amountDue, 0);

  const finish = (b: Bucket) => ({
    ...b,
    hammer: round(b.hammer),
    premium: round(b.premium),
    tax: round(b.tax),
    charged: round(b.charged),
    compedHammer: round(b.compedHammer),
    unpaidAmount: round(b.unpaidAmount),
  });

  return NextResponse.json({
    feePercent,
    taxPercent,
    truncated: rows.length >= ROW_CAP,
    totals: {
      hammer: round(hammer),
      premium: round(premium),
      tax: round(tax),
      totalCharged: round(totalCharged),
      stripeFees: round(stripeFees),
      netDeposited: round(netDeposited),
      netProfit: round(netProfit),
      itemsSold,
      txnCount,
      compedCount,
      compedHammer: round(compedHammer),
      averageSale: itemsSold > 0 ? round(hammer / itemsSold) : 0,
    },
    periods: {
      weekSales: round(weekSales),
      monthSales: round(monthSales),
      byMonth: monthWindows.map((w) => ({ label: w.label, total: round(w.total) })),
    },
    byAuction: [...byAuction.values()]
      .map(finish)
      .sort((a, b) => (b.sub ?? "").localeCompare(a.sub ?? "")),
    byWarehouse: [...byWarehouse.values()].map(finish).sort((a, b) => b.hammer - a.hammer),
    outstanding: { total: round(totalOutstanding), count: owers.length, owers },
  });
}
