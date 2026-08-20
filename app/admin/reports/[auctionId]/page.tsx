export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserOrg } from "@/lib/auth";
import { Donut } from "../Charts";

// Match the aggregate reports endpoint exactly so a single-auction view can never
// disagree with the ranked list it was opened from.
const STRIPE_PCT = 0.029;
const STRIPE_FIXED = 0.3;
const ROW_CAP = 20000;
const SOLD_STATUSES = ["SOLD", "PENDING_PICKUP", "PICKED_UP"] as const;

const num = (d: unknown) => (d == null ? 0 : Number(d));
const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) => "$" + Math.round(n).toLocaleString();
const fmtDate = (d: Date | null) =>
  d ? d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

interface Props {
  params: Promise<{ auctionId: string }>;
}

export default async function AuctionReportPage({ params }: Props) {
  const { auctionId } = await params;
  const membership = await requireUserOrg();
  const orgId = membership.organization.id;
  const isNone = auctionId === "none";

  const orgConfig = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { platformFeePercent: true, taxPercent: true, taxExempt: true },
  });
  const feePercent = num(orgConfig?.platformFeePercent);
  const taxPercent = orgConfig?.taxExempt ? 0 : num(orgConfig?.taxPercent);

  const auction = isNone
    ? null
    : await prisma.auction.findFirst({
        where: { id: auctionId, organizationId: orgId },
        select: { id: true, title: true, startAt: true, endAt: true, status: true },
      });

  if (!isNone && !auction) {
    return (
      <div className="flex items-center justify-center flex-1 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Auction not found</h1>
          <Link href="/admin/reports" className="text-[#6c4d39] font-semibold">← Back to reports</Link>
        </div>
      </div>
    );
  }

  // ALL paid rows for the org, so a Stripe charge shared across auctions is split
  // the same proportional way it is on the main report; then we keep only this
  // auction's rows for the totals.
  const paidAll = await prisma.payment.findMany({
    where: { status: "PAID", comped: false, item: { organizationId: orgId } },
    select: {
      amount: true, applicationFeeAmount: true, taxAmount: true, creditApplied: true,
      stripePaymentIntentId: true,
      item: { select: { auctionId: true, soldLocation: { select: { id: true, name: true } }, location: { select: { id: true, name: true } } } },
    },
    take: ROW_CAP,
  });

  const grossOf = (p: (typeof paidAll)[number]) =>
    num(p.amount) + num(p.applicationFeeAmount) + num(p.taxAmount) - num(p.creditApplied ?? 0);
  const piGross = new Map<string, number>();
  for (const p of paidAll) {
    if (!p.stripePaymentIntentId) continue;
    piGross.set(p.stripePaymentIntentId, (piGross.get(p.stripePaymentIntentId) ?? 0) + grossOf(p));
  }
  const feeForRow = (p: (typeof paidAll)[number]): number => {
    const gross = grossOf(p);
    if (!p.stripePaymentIntentId) return gross > 0 ? gross * STRIPE_PCT + STRIPE_FIXED : 0;
    const total = piGross.get(p.stripePaymentIntentId) ?? 0;
    if (total <= 0) return 0;
    return (total * STRIPE_PCT + STRIPE_FIXED) * (gross / total);
  };

  const rows = paidAll.filter((p) =>
    isNone ? p.item?.auctionId == null : p.item?.auctionId === auctionId
  );

  let hammer = 0, premium = 0, tax = 0, credit = 0, fees = 0, itemsSold = 0;
  const byWarehouse = new Map<string, number>();
  const pis = new Set<string>();
  let soloCharges = 0;
  for (const p of rows) {
    const fee = feeForRow(p);
    const sale = num(p.amount), prem = num(p.applicationFeeAmount);
    const t = num(p.taxAmount), cr = num(p.creditApplied ?? 0);
    itemsSold += 1;
    hammer += sale; premium += prem; tax += t; credit += cr; fees += fee;
    // Commission stays with the source (sold-at) location, not the pickup one.
    const wLabel = (p.item?.soldLocation ?? p.item?.location)?.name ?? "Unassigned";
    byWarehouse.set(wLabel, (byWarehouse.get(wLabel) ?? 0) + (sale + prem - cr - fee));
    if (p.stripePaymentIntentId) pis.add(p.stripePaymentIntentId);
    else if (grossOf(p) > 0) soloCharges++;
  }
  const net = hammer + premium - credit - fees;
  const buyersPaid = hammer + premium + tax;
  const chargeCount = pis.size + soloCharges;
  const avgItem = itemsSold > 0 ? hammer / itemsSold : 0;
  const warehouses = [...byWarehouse.entries()].map(([label, n]) => ({ label, net: r2(n) })).sort((a, b) => b.net - a.net);

  // Sell-through — items that sold vs didn't in this auction.
  const auctionFilter = isNone ? { auctionId: null } : { auctionId };
  const [soldItemCount, unsoldItemCount] = await Promise.all([
    prisma.item.count({ where: { organizationId: orgId, ...auctionFilter, status: { in: [...SOLD_STATUSES] } } }),
    prisma.item.count({ where: { organizationId: orgId, ...auctionFilter, status: "UNSOLD" } }),
  ]);
  const offered = soldItemCount + unsoldItemCount;
  const sellThrough = offered > 0 ? Math.round((soldItemCount / offered) * 100) : 0;

  // Left on the table (headroom) — winners who set a max above what they paid.
  const wonBids = await prisma.bid.findMany({
    where: { status: "WON", item: { organizationId: orgId, ...auctionFilter } },
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
  let headroomTotal = 0, headroomItems = 0, biggestGap = 0;
  for (const b of wonBids) {
    const max = proxyByKey.get(`${b.itemId}:${b.clerkUserId}`);
    if (max == null) continue;
    const gap = max - num(b.amount);
    if (gap <= 0) continue;
    headroomTotal += gap; headroomItems += 1;
    if (gap > biggestGap) biggestGap = gap;
  }

  // Still owed on this auction (failed/pending cards).
  const owedRows = await prisma.payment.findMany({
    where: { status: { in: ["PENDING", "FAILED"] }, comped: false, item: { organizationId: orgId, ...auctionFilter } },
    select: { clerkUserId: true, amount: true, applicationFeeAmount: true, taxAmount: true },
    take: 2000,
  });
  const owedBy = new Map<string, { amountDue: number; count: number }>();
  for (const p of owedRows) {
    const cur = owedBy.get(p.clerkUserId) ?? { amountDue: 0, count: 0 };
    cur.amountDue += num(p.amount) + num(p.applicationFeeAmount) + num(p.taxAmount);
    cur.count += 1;
    owedBy.set(p.clerkUserId, cur);
  }
  const owedIds = [...owedBy.keys()];
  const owedProfiles = owedIds.length
    ? await prisma.bidderProfile.findMany({ where: { clerkUserId: { in: owedIds } }, select: { clerkUserId: true, name: true, phone: true } })
    : [];
  const owedNameById = new Map(owedProfiles.map((p) => [p.clerkUserId, p]));
  const owers = [...owedBy.entries()]
    .map(([uid, v]) => ({ name: owedNameById.get(uid)?.name ?? "Bidder", phone: owedNameById.get(uid)?.phone ?? "", amountDue: r2(v.amountDue), count: v.count }))
    .sort((a, b) => b.amountDue - a.amountDue);
  const owedTotal = owers.reduce((s, o) => s + o.amountDue, 0);

  const title = isNone ? "Items with no auction" : auction!.title;

  const moneyParts = [
    { label: "In your pocket", value: net, color: "#5f7a45" },
    { label: "Sales tax (to Michigan)", value: tax, color: "#c47b3e" },
    { label: "Stripe's cut", value: fees, color: "#a32d2d" },
    { label: "Bid Bucks used", value: credit, color: "#8a7559" },
  ].filter((p) => p.value > 0.005);
  const moneyTotal = moneyParts.reduce((s, p) => s + p.value, 0) || 1;

  return (
    <>
      <header className="border-b border-[#e3d6bf] px-5 sm:px-8 py-4">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/admin/reports" className="text-[#6f5b46] text-base font-semibold shrink-0">← Reports</Link>
          <span className="text-[#cdbda3]">/</span>
          <h1 className="text-xl sm:text-2xl font-semibold truncate">{title}</h1>
        </div>
        {auction && (
          <p className="text-sm text-[#8a7559] mt-1">
            {fmtDate(auction.startAt)} → {fmtDate(auction.endAt)} · {auction.status.toLowerCase()}
          </p>
        )}
      </header>

      <div className="px-4 sm:px-8 py-5 space-y-5 max-w-2xl mx-auto w-full pb-16">
        {/* Hero: net */}
        <div className="rounded-3xl bg-gradient-to-br from-[#4f6639] to-[#5f7a45] text-white p-6 shadow-[0_8px_28px_rgba(79,102,57,0.25)]">
          <div className="text-sm font-bold uppercase tracking-[0.15em] text-[#d8e6c8]">You made</div>
          <div className="text-5xl sm:text-6xl font-extrabold tracking-tight mt-1 tabular-nums">{money0(net)}</div>
          <div className="text-base text-[#d8e6c8] mt-2">
            {itemsSold} item{itemsSold !== 1 ? "s" : ""} sold{avgItem > 0 ? ` · ${money0(avgItem)} average` : ""}
          </div>
        </div>

        {/* Key figures */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {[
            { k: "Hammer (bids)", v: money0(hammer) },
            { k: `Premium (${feePercent}%)`, v: money0(premium) },
            { k: "Stripe fees", v: "−" + money0(fees) },
            { k: "Bid Bucks used", v: "−" + money0(credit) },
            { k: "Sell-through", v: `${sellThrough}%` },
            { k: "Card charges", v: String(chargeCount) },
          ].map((x) => (
            <div key={x.k} className="bg-white border border-[#e3d6bf] rounded-2xl px-3 py-3 text-center">
              <div className="text-[11px] font-bold text-[#8a7559] uppercase tracking-wide leading-tight">{x.k}</div>
              <div className="text-lg font-extrabold text-[#241a12] tabular-nums mt-1">{x.v}</div>
            </div>
          ))}
        </div>

        {/* Tax breakdown — the part you collect for Michigan */}
        <div className="bg-white border border-[#e3d6bf] rounded-2xl p-5">
          <h2 className="text-lg font-bold text-[#241a12]">Sales tax</h2>
          <p className="text-sm text-[#6f5b46] mb-3">Collected from buyers and passed to the state — never counted as your earnings.</p>
          <div className="space-y-2">
            {[
              { k: "Hammer (winning bids)", v: money(hammer) },
              { k: `Buyer's premium (${feePercent}%)`, v: money(premium) },
              { k: "Taxable subtotal", v: money(hammer + premium), strong: true },
              { k: `Tax rate`, v: `${taxPercent}%` },
              { k: "Tax collected", v: money(tax), tax: true },
            ].map((x) => (
              <div key={x.k} className={`flex items-center justify-between gap-3 ${x.strong ? "border-t border-[#efe3d0] pt-2" : ""}`}>
                <span className={`text-base ${x.strong ? "font-bold text-[#241a12]" : "text-[#4a3a2b]"}`}>{x.k}</span>
                <span className={`text-base font-bold tabular-nums ${x.tax ? "text-[#c47b3e]" : "text-[#241a12]"}`}>{x.v}</span>
              </div>
            ))}
          </div>
          <p className="text-sm text-[#8a7559] mt-3">
            Buyers paid <strong className="text-[#4a3a2b]">{money(buyersPaid)}</strong> total (hammer + premium + tax) across {chargeCount} charge{chargeCount !== 1 ? "s" : ""}.
          </p>
        </div>

        {/* Where the money went */}
        {moneyParts.length > 0 && (
          <div className="bg-white border border-[#e3d6bf] rounded-2xl p-5">
            <h2 className="text-lg font-bold text-[#241a12] mb-3">Where the money went</h2>
            <Donut slices={moneyParts} centerTop={money0(buyersPaid)} centerSub="buyers paid" />
            <div className="mt-4 space-y-2">
              {moneyParts.map((p) => (
                <div key={p.label} className="flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.color }} />
                  <span className="text-base text-[#4a3a2b] flex-1 min-w-0">{p.label}</span>
                  <span className="text-base font-bold text-[#241a12] tabular-nums shrink-0">{money(p.value)}</span>
                  <span className="text-sm text-[#8a7559] w-11 text-right shrink-0 tabular-nums">{Math.round((p.value / moneyTotal) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* By warehouse */}
        {warehouses.length > 0 && (
          <div className="bg-white border border-[#e3d6bf] rounded-2xl p-5">
            <h2 className="text-lg font-bold text-[#241a12] mb-1">By warehouse</h2>
            <p className="text-sm text-[#6f5b46] mb-3">This auction&apos;s net, split by where items were stored.</p>
            <div className="space-y-1.5">
              {warehouses.map((w) => (
                <div key={w.label} className="flex items-center justify-between gap-3 text-base">
                  <span className="text-[#4a3a2b] min-w-0 truncate">{w.label}</span>
                  <span className="font-bold text-[#241a12] tabular-nums shrink-0">{money0(w.net)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sell-through detail */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { k: "Sold", v: String(soldItemCount) },
            { k: "Didn't sell", v: String(unsoldItemCount) },
            { k: "Offered", v: String(offered) },
          ].map((x) => (
            <div key={x.k} className="bg-white border border-[#e3d6bf] rounded-2xl px-3 py-3 text-center">
              <div className="text-[11px] font-bold text-[#8a7559] uppercase tracking-wide">{x.k}</div>
              <div className="text-xl font-extrabold text-[#241a12] tabular-nums mt-0.5">{x.v}</div>
            </div>
          ))}
        </div>

        {/* Left on the table (per this auction) */}
        {headroomItems > 0 && (
          <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
            <div className="text-sm font-bold uppercase tracking-wide text-amber-800">Left on the table</div>
            <div className="text-3xl font-extrabold text-amber-700 tabular-nums mt-0.5">{money0(headroomTotal)}</div>
            <p className="text-base text-amber-900 mt-2 leading-snug">
              On <strong>{headroomItems}</strong> item{headroomItems !== 1 ? "s" : ""} the winner set a max
              bid higher than what they paid — the lot stopped one increment above the runner-up. Biggest gap{" "}
              <strong>{money0(biggestGap)}</strong>. That&apos;s demand you had but didn&apos;t capture.
            </p>
          </div>
        )}

        {/* Still owed */}
        {owers.length > 0 && (
          <div className="bg-white border-2 border-amber-200 rounded-2xl p-5">
            <h2 className="text-lg font-bold text-[#241a12]">Still owed on this auction</h2>
            <p className="text-sm text-[#6f5b46]">Cards that haven&apos;t gone through. Not counted above.</p>
            <div className="text-3xl font-extrabold text-[#a3701d] tabular-nums my-3">{money(owedTotal)}</div>
            <div className="space-y-2">
              {owers.map((o, i) => (
                <div key={i} className="flex items-center justify-between gap-3 bg-[#faf5ea] border border-[#e3d6bf] rounded-xl px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#241a12] truncate">{o.name}</div>
                    <div className="text-sm text-[#8a7559] truncate">{o.count} item{o.count !== 1 ? "s" : ""}{o.phone ? ` · ${o.phone}` : ""}</div>
                  </div>
                  <div className="font-extrabold text-[#a3701d] tabular-nums shrink-0">{money(o.amountDue)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {itemsSold === 0 && (
          <p className="text-base text-[#8a7559] bg-white border border-[#e3d6bf] rounded-2xl p-6 text-center">
            No paid sales recorded for this auction yet.
          </p>
        )}
      </div>
    </>
  );
}
