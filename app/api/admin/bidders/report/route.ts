export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
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

const TZ = "America/Detroit";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Weekday (0-6) and hour (0-23) of an instant in Michigan time. */
function dayHour(d: Date): { wd: number; h: number } {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(d);
  const wd = WEEKDAYS.indexOf(p.find((x) => x.type === "weekday")?.value ?? "Sun");
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0) % 24;
  return { wd: wd < 0 ? 0 : wd, h };
}
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

export async function GET(request: NextRequest) {
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
      _max: { paidAt: true, createdAt: true },
    }),
  ]);

  // How each bidder got here: invited by another bidder (referral link), or a
  // welcome code (QR card / poster). Both are small tables — read whole.
  const [referrals, claims] = await Promise.all([
    prisma.referral.findMany({
      select: { referredUserId: true, referrerUserId: true, code: true, status: true, createdAt: true },
    }),
    prisma.promoClaim.findMany({
      where: { promoCode: { organizationId: orgId } },
      select: { clerkUserId: true, createdAt: true, promoCode: { select: { code: true, label: true } } },
    }),
  ]);
  const referralBy = new Map(referrals.map((r) => [r.referredUserId, r]));
  const claimBy = new Map<string, (typeof claims)[number]>();
  for (const c of claims) if (!claimBy.has(c.clerkUserId)) claimBy.set(c.clerkUserId, c);
  // Invites sent per inviter, for the "brought in N bidders" line.
  const invitedCountBy = new Map<string, number>();
  for (const r of referrals) invitedCountBy.set(r.referrerUserId, (invitedCountBy.get(r.referrerUserId) ?? 0) + 1);

  const bidCountBy = new Map(bidAgg.map((b) => [b.clerkUserId, b._count.id]));
  const lastBidBy = new Map(bidAgg.map((b) => [b.clerkUserId, b._max.placedAt]));
  const wonBy = new Map(wonAgg.map((w) => [w.clerkUserId, w._count.id]));
  const active30 = new Set(active30Agg.map((a) => a.clerkUserId));
  const active60 = new Set(active60Agg.map((a) => a.clerkUserId));
  const spendBy = new Map(
    spendAgg.map((s) => [s.clerkUserId, num(s._sum.amount) + num(s._sum.applicationFeeAmount)])
  );
  const paidItemsBy = new Map(spendAgg.map((s) => [s.clerkUserId, s._count.id]));
  // Most recent purchase: paidAt when recorded, else the payment row's createdAt.
  const lastPaidBy = new Map(spendAgg.map((s) => [s.clerkUserId, s._max.paidAt ?? s._max.createdAt ?? null]));

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
  const nameOf = (id: string) => {
    const pr = profById.get(id);
    return pr ? pr.name || pr.email || "Bidder" : "Bidder";
  };
  const rows = [...profById.values()].map((p) => {
    const bids = bidCountBy.get(p.clerkUserId) ?? 0;
    const lastBid = lastBidBy.get(p.clerkUserId) ?? null;
    const lastPaid = lastPaidBy.get(p.clerkUserId) ?? null;
    const ref = referralBy.get(p.clerkUserId);
    const claim = claimBy.get(p.clerkUserId);
    // Where they came from, in one word: "invite", "code", or "direct".
    const source: "invite" | "code" | "direct" = ref ? "invite" : claim ? "code" : "direct";
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
      lastPaidAt: lastPaid ? lastPaid.toISOString() : null,
      daysSinceLastPaid: lastPaid ? daysBetween(now, lastPaid) : null,
      source,
      invitedBy: ref
        ? { clerkUserId: ref.referrerUserId, name: nameOf(ref.referrerUserId), code: ref.code, link: `/r/${ref.code}`, status: ref.status }
        : null,
      welcomeCode: claim ? { code: claim.promoCode.code, label: claim.promoCode.label, claimedAt: claim.createdAt.toISOString() } : null,
      invited: invitedCountBy.get(p.clerkUserId) ?? 0,
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
    // Where bidders came from.
    viaInvite: rows.filter((r) => r.source === "invite").length,
    viaCode: rows.filter((r) => r.source === "code").length,
    direct: rows.filter((r) => r.source === "direct").length,
    signups7: rows.filter((r) => r.daysSinceSignup <= 7).length,
    bought30: rows.filter((r) => r.daysSinceLastPaid != null && r.daysSinceLastPaid <= 30).length,
  };

  // Best inviters — who's bringing people in.
  const topInviters = [...rows]
    .filter((r) => r.invited > 0)
    .sort((a, b) => b.invited - a.invited)
    .slice(0, 8)
    .map((r) => ({ name: r.name, invited: r.invited }));
  // Welcome codes by claims.
  const codeCounts = new Map<string, { code: string; label: string; count: number }>();
  for (const c of claims) {
    const k = c.promoCode.code;
    const cur = codeCounts.get(k) ?? { code: k, label: c.promoCode.label, count: 0 };
    cur.count += 1;
    codeCounts.set(k, cur);
  }
  const topCodes = [...codeCounts.values()].sort((a, b) => b.count - a.count).slice(0, 8);

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

  // ══ Period view (?days=7|30|90|0 — 0 = all time) ═══════════════════════════
  // Everything a "how was this week?" look needs, compared with the period
  // before it. Lists are capped at 10 server-side (the page shows 5 + "more").
  const daysParam = Number(request.nextUrl.searchParams.get("days") ?? 7);
  const days = [7, 30, 90, 0].includes(daysParam) ? daysParam : 7;
  const start = days ? new Date(now.getTime() - days * DAY) : null;
  const prevStart = days ? new Date(now.getTime() - 2 * days * DAY) : null;
  // Raw bid rows for the trend + busiest times. All time looks at the last year.
  const rawFrom = start ?? new Date(now.getTime() - 365 * DAY);

  const paidWhere = (from: Date | null, to: Date | null) => ({
    status: "PAID" as const,
    comped: false,
    ...itemScope,
    ...(from || to
      ? {
          OR: [
            { paidAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } },
            { paidAt: null, createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } },
          ],
        }
      : {}),
  });

  const [periodBids, prevBidAgg, periodPays, prevPays, firstPaidAgg, failedPays] = await Promise.all([
    prisma.bid.findMany({
      where: { ...itemScope, placedAt: { gte: rawFrom } },
      select: { clerkUserId: true, placedAt: true, itemId: true, status: true, item: { select: { status: true } } },
      take: 200_000,
    }),
    prevStart && start
      ? prisma.bid.groupBy({ by: ["clerkUserId"], where: { ...itemScope, placedAt: { gte: prevStart, lt: start } }, _count: { id: true } })
      : Promise.resolve([] as { clerkUserId: string; _count: { id: number } }[]),
    prisma.payment.findMany({
      where: paidWhere(start, null),
      select: { clerkUserId: true, amount: true, applicationFeeAmount: true, paidAt: true, createdAt: true },
      take: 100_000,
    }),
    prevStart && start
      ? prisma.payment.findMany({
          where: paidWhere(prevStart, start),
          select: { clerkUserId: true, amount: true, applicationFeeAmount: true },
          take: 100_000,
        })
      : Promise.resolve([] as { clerkUserId: string; amount: unknown; applicationFeeAmount: unknown }[]),
    prisma.payment.groupBy({ by: ["clerkUserId"], where: paidWhere(null, null), _min: { paidAt: true, createdAt: true } }),
    prisma.payment.findMany({
      where: { status: "FAILED", comped: false, ...itemScope },
      select: { clerkUserId: true, amount: true, applicationFeeAmount: true, taxAmount: true, createdAt: true },
      take: 5000,
    }),
  ]);

  const inPeriod = (d: Date) => !start || d.getTime() >= start.getTime();
  const bidsInPeriod = periodBids.filter((b) => inPeriod(b.placedAt));
  const payValue = (p: { amount: unknown; applicationFeeAmount: unknown }) => num(p.amount) + num(p.applicationFeeAmount);

  // Per-person spend / bids / wins in the period.
  const pSpend = new Map<string, number>();
  const pLots = new Map<string, number>();
  for (const p of periodPays) {
    pSpend.set(p.clerkUserId, (pSpend.get(p.clerkUserId) ?? 0) + payValue(p));
    pLots.set(p.clerkUserId, (pLots.get(p.clerkUserId) ?? 0) + 1);
  }
  const pBids = new Map<string, number>();
  const pWonItems = new Map<string, Set<string>>();
  const bidItems = new Set<string>();
  const decidedItems = new Set<string>();
  const wonItems = new Set<string>();
  for (const b of bidsInPeriod) {
    pBids.set(b.clerkUserId, (pBids.get(b.clerkUserId) ?? 0) + 1);
    bidItems.add(b.itemId);
    const decided = b.item.status !== "ACTIVE" && b.item.status !== "DRAFT";
    if (decided) decidedItems.add(b.itemId);
    if (b.status === "WON") {
      wonItems.add(b.itemId);
      if (!pWonItems.has(b.clerkUserId)) pWonItems.set(b.clerkUserId, new Set());
      pWonItems.get(b.clerkUserId)!.add(b.itemId);
    }
  }

  const firstPaidBy = new Map(firstPaidAgg.map((f) => [f.clerkUserId, f._min.paidAt ?? f._min.createdAt ?? null]));
  const firstTimeIds = [...pSpend.keys()].filter((id) => {
    const f = firstPaidBy.get(id);
    return f ? inPeriod(f) : false;
  });

  const revenue = r2(periodPays.reduce((t, p) => t + payValue(p), 0));
  const prevRevenue = r2(prevPays.reduce((t, p) => t + payValue(p), 0));
  const buyers = pSpend.size;
  const prevBuyers = new Set(prevPays.map((p) => p.clerkUserId)).size;
  const signupIds = rows.filter((r) => inPeriod(new Date(r.signupAt))).map((r) => r.clerkUserId);
  const prevSignups = start && prevStart
    ? rows.filter((r) => { const t = new Date(r.signupAt).getTime(); return t >= prevStart.getTime() && t < start.getTime(); }).length
    : null;

  const kpis = {
    revenue,
    prevRevenue: days ? prevRevenue : null,
    buyers,
    prevBuyers: days ? prevBuyers : null,
    firstTimeBuyers: firstTimeIds.length,
    returningBuyers: buyers - firstTimeIds.length,
    signups: signupIds.length,
    prevSignups,
    activeBidders: pBids.size,
    prevActiveBidders: days ? prevBidAgg.length : null,
    bids: bidsInPeriod.length,
    prevBids: days ? prevBidAgg.reduce((t, b) => t + b._count.id, 0) : null,
    lotsPaid: periodPays.length,
    avgPerBuyer: buyers ? r2(revenue / buyers) : 0,
    prevAvgPerBuyer: days ? (prevBuyers ? r2(prevRevenue / prevBuyers) : 0) : null,
    // Won ÷ bid-on, counting only lots whose auction has finished.
    winRate: decidedItems.size ? Math.round(([...wonItems].filter((i) => decidedItems.has(i)).length / decidedItems.size) * 100) : null,
    lotsBidOn: bidItems.size,
  };

  // Signup funnel for people who joined in the period.
  const funnel = {
    joined: signupIds.length,
    bid: signupIds.filter((id) => (bidCountBy.get(id) ?? 0) > 0).length,
    won: signupIds.filter((id) => (wonBy.get(id) ?? 0) > 0).length,
    paid: signupIds.filter((id) => (spendBy.get(id) ?? 0) > 0).length,
  };

  // Trend buckets: daily for 7/30, weekly for 90, monthly for all time.
  type Bucket = { label: string; from: number; to: number; bids: number; signups: number; revenue: number };
  const buckets: Bucket[] = [];
  const fmtDay = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", { timeZone: TZ, ...opts });
  if (days === 7 || days === 30) {
    for (let i = days - 1; i >= 0; i--) {
      const from = now.getTime() - (i + 1) * DAY, to = now.getTime() - i * DAY;
      buckets.push({ label: fmtDay(new Date(to), days === 7 ? { weekday: "short" } : { month: "numeric", day: "numeric" }), from, to, bids: 0, signups: 0, revenue: 0 });
    }
  } else if (days === 90) {
    for (let i = 12; i >= 0; i--) {
      const from = now.getTime() - (i + 1) * 7 * DAY, to = now.getTime() - i * 7 * DAY;
      buckets.push({ label: fmtDay(new Date(from), { month: "numeric", day: "numeric" }), from, to, bids: 0, signups: 0, revenue: 0 });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const from = now.getTime() - (i + 1) * 30 * DAY, to = now.getTime() - i * 30 * DAY;
      buckets.push({ label: fmtDay(new Date(to), { month: "short" }), from, to, bids: 0, signups: 0, revenue: 0 });
    }
  }
  const bucketOf = (t: number) => buckets.find((b) => t >= b.from && t < b.to);
  for (const b of periodBids) { const k = bucketOf(b.placedAt.getTime()); if (k) k.bids++; }
  for (const r of rows) { const k = bucketOf(new Date(r.signupAt).getTime()); if (k) k.signups++; }
  for (const p of periodPays) { const k = bucketOf((p.paidAt ?? p.createdAt).getTime()); if (k) k.revenue += payValue(p); }
  const trend = buckets.map((b) => ({ label: b.label, bids: b.bids, signups: b.signups, revenue: r2(b.revenue) }));

  // Busiest times (Michigan time). All time uses the last 90 days so it's current.
  const timesFrom = start ?? new Date(now.getTime() - 90 * DAY);
  const byWeekday = Array(7).fill(0) as number[];
  const byHour = Array(24).fill(0) as number[];
  for (const b of periodBids) {
    if (b.placedAt < timesFrom) continue;
    const { wd, h } = dayHour(b.placedAt);
    byWeekday[wd]++; byHour[h]++;
  }
  const topWd = byWeekday.indexOf(Math.max(...byWeekday));
  const topH = byHour.indexOf(Math.max(...byHour));
  const anyTimes = byWeekday.some((n) => n > 0);
  const busiest = {
    byWeekday: WEEKDAYS.map((d, i) => ({ label: d, value: byWeekday[i] })),
    topDay: anyTimes ? WEEKDAYS[topWd] : null,
    topHour: anyTimes ? `${hourLabel(topH)}–${hourLabel((topH + 1) % 24)}` : null,
  };

  // ── Short lists (max 10 each; the page shows 5 then "more") ──
  const person = (id: string) => {
    const r = rows.find((x) => x.clerkUserId === id);
    return { clerkUserId: id, name: r?.name ?? "Bidder", phone: r?.phone ?? "", email: r?.email ?? "" };
  };
  const topBidderIds = [...new Set([...pSpend.keys(), ...pBids.keys()])]
    .sort((a, b) => (pSpend.get(b) ?? 0) - (pSpend.get(a) ?? 0) || (pBids.get(b) ?? 0) - (pBids.get(a) ?? 0));
  const lists = {
    topBidders: {
      total: topBidderIds.length,
      rows: topBidderIds.slice(0, 10).map((id) => ({ ...person(id), spend: r2(pSpend.get(id) ?? 0), bids: pBids.get(id) ?? 0, won: pWonItems.get(id)?.size ?? 0 })),
    },
    newBuyers: {
      total: firstTimeIds.length,
      rows: [...firstTimeIds].sort((a, b) => (pSpend.get(b) ?? 0) - (pSpend.get(a) ?? 0)).slice(0, 10)
        .map((id) => ({ ...person(id), spend: r2(pSpend.get(id) ?? 0), lots: pLots.get(id) ?? 0 })),
    },
    // Bought before, no bids in 30+ days (and not long gone): worth a text.
    goneQuiet: (() => {
      const all = rows.filter((r) => r.spend > 0 && r.daysSinceLastBid != null && r.daysSinceLastBid > 30 && r.daysSinceLastBid <= 180 && !r.blocked)
        .sort((a, b) => b.spend - a.spend);
      return { total: all.length, rows: all.slice(0, 10).map((r) => ({ clerkUserId: r.clerkUserId, name: r.name, phone: r.phone, email: r.email, spend: r.spend, daysSinceLastBid: r.daysSinceLastBid })) };
    })(),
    // Signed up 1–30 days ago, never bid: the easiest follow-up.
    neverBid: (() => {
      const all = rows.filter((r) => r.neverBid && r.daysSinceSignup >= 1 && r.daysSinceSignup <= 30 && !r.blocked)
        .sort((a, b) => a.daysSinceSignup - b.daysSinceSignup);
      return { total: all.length, rows: all.slice(0, 10).map((r) => ({ clerkUserId: r.clerkUserId, name: r.name, phone: r.phone, email: r.email, daysSinceSignup: r.daysSinceSignup })) };
    })(),
    // Card charges that failed and are still owed.
    failedPayments: (() => {
      const owed = new Map<string, { amount: number; lots: number }>();
      for (const f of failedPays) {
        const cur = owed.get(f.clerkUserId) ?? { amount: 0, lots: 0 };
        cur.amount += num(f.amount) + num(f.applicationFeeAmount) + num(f.taxAmount);
        cur.lots += 1;
        owed.set(f.clerkUserId, cur);
      }
      const all = [...owed.entries()].sort((a, b) => b[1].amount - a[1].amount);
      return {
        total: all.length,
        amount: r2(all.reduce((t, [, v]) => t + v.amount, 0)),
        rows: all.slice(0, 10).map(([id, v]) => ({ ...person(id), owed: r2(v.amount), lots: v.lots })),
      };
    })(),
  };

  // Who already got the "$5 to get you bidding" nudge (one per person).
  const [nudgedRows, teamRows] = await Promise.all([
    prisma.creditLedger.findMany({ where: { reason: "adjustment: gift: bid nudge" }, select: { clerkUserId: true } }),
    prisma.orgMember.findMany({ where: { organizationId: orgId }, select: { clerkUserId: true } }),
  ]);

  return NextResponse.json({
    summary, signupTrend, topSpenders, topInviters, topCodes, bidders: rows,
    nudged: [...new Set(nudgedRows.map((n) => n.clerkUserId))],
    team: teamRows.map((t) => t.clerkUserId),
    canManage: membership.role === "OWNER" || membership.role === "ADMIN",
    period: { days, kpis, funnel, trend, busiest, lists },
  });
}
