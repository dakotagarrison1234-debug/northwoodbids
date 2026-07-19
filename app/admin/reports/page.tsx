"use client";
import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Ower { name: string; email: string; phone: string; amountDue: number; items: string[]; }
interface Bucket {
  key: string; label: string; sub: string | null;
  itemsSold: number; hammer: number; premium: number; tax: number; charged: number;
  compedCount: number; compedHammer: number; unpaidCount: number; unpaidAmount: number;
}
interface ReportData {
  feePercent: number;
  taxPercent: number;
  totals: {
    hammer: number; premium: number; tax: number; totalCharged: number;
    stripeFees: number; netDeposited: number; netProfit: number;
    itemsSold: number; txnCount: number;
    compedCount: number; compedHammer: number; averageSale: number;
  };
  periods: { weekSales: number; monthSales: number; byMonth: { label: string; total: number }[] };
  byAuction: Bucket[];
  byWarehouse: Bucket[];
  outstanding: { total: number; count: number; owers: Ower[] };
}

// Payout report (warehouse → auction). "Net" is what the business actually pockets:
// hammer + premium − Bid Bucks credit − Stripe's cut, with sales tax passed straight
// through (collected then remitted, so it nets to zero).
interface PayoutBucket {
  net: number; sales: number; premium: number; tax: number; fees: number; credit: number; itemsSold: number;
}
interface PayoutWarehouse extends PayoutBucket {
  name: string;
  auctions: (PayoutBucket & { title: string })[];
}
interface PayoutReport {
  warehouses: PayoutWarehouse[];
  grandTotal: PayoutBucket;
}

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) => "$" + Math.round(n).toLocaleString();

// ── Little building blocks ────────────────────────────────────────────────────

/** A report section: plain-English title, one line saying what it is, then content. */
function Section({
  title, what, children, defaultOpen = true,
}: { title: string; what: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-5 sm:px-6 py-4 hover:bg-[#faf5ea] transition-colors flex items-start justify-between gap-3"
      >
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold text-[#241a12]">{title}</h2>
          <p className="text-sm text-[#6f5b46] mt-0.5">{what}</p>
        </div>
        <span className={`text-[#8a7559] shrink-0 mt-1 transition-transform ${open ? "rotate-180" : ""}`}>
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
        </span>
      </button>
      {open && <div className="px-5 sm:px-6 pb-6 border-t border-[#efe3d0] pt-5">{children}</div>}
    </section>
  );
}

/** One headline number with a sentence under it saying what it actually means. */
function BigStat({
  label, value, explain, tone = "ink",
}: { label: string; value: string; explain: string; tone?: "ink" | "good" | "leather" | "warn" }) {
  const color =
    tone === "good" ? "text-[#5f7a45]" :
    tone === "leather" ? "text-[#6c4d39]" :
    tone === "warn" ? "text-[#a3701d]" : "text-[#241a12]";
  return (
    <div className="bg-white border border-[#e3d6bf] rounded-2xl p-5 sm:p-6">
      <div className="text-sm font-bold text-[#8a7559] uppercase tracking-wider">{label}</div>
      <div className={`text-3xl sm:text-4xl font-extrabold font-display mt-1.5 ${color}`}>{value}</div>
      <p className="text-sm text-[#6f5b46] mt-2 leading-snug">{explain}</p>
    </div>
  );
}

/** A row in the "where every dollar goes" walkthrough. */
function FlowRow({
  label, note, value, sign = "plus", strong = false,
}: { label: string; note?: string; value: number; sign?: "plus" | "minus" | "equals" | "none"; strong?: boolean }) {
  const color = sign === "minus" ? "text-red-600" : strong ? "text-[#241a12]" : "text-[#4a3a2b]";
  const prefix = sign === "minus" ? "−" : sign === "plus" ? "+" : "";
  return (
    <div className={`flex items-start justify-between gap-4 py-3 ${strong ? "border-t-2 border-[#cdbda3]" : "border-t border-[#efe3d0]"}`}>
      <div className="min-w-0">
        <div className={`${strong ? "font-bold" : "font-medium"} text-[#241a12]`}>{label}</div>
        {note && <div className="text-sm text-[#8a7559] leading-snug mt-0.5">{note}</div>}
      </div>
      <div className={`shrink-0 tabular-nums font-bold ${strong ? "text-lg" : ""} ${color}`}>
        {prefix}{money(value)}
      </div>
    </div>
  );
}

/** Shared breakdown table for "by auction" and "by warehouse". */
function BreakdownTable({ rows, emptyText }: { rows: Bucket[]; emptyText: string }) {
  if (rows.length === 0) return <p className="text-base text-[#8a7559]">{emptyText}</p>;
  return (
    <div className="overflow-x-auto -mx-5 sm:-mx-6 px-5 sm:px-6">
      <table className="w-full text-base border-collapse min-w-[640px]">
        <thead>
          <tr className="text-left text-sm font-bold text-[#8a7559] uppercase tracking-wide">
            <th className="pb-2 pr-3">Name</th>
            <th className="pb-2 px-3 text-right">Items</th>
            <th className="pb-2 px-3 text-right">Item sales</th>
            <th className="pb-2 px-3 text-right">Premium</th>
            <th className="pb-2 px-3 text-right">Tax</th>
            <th className="pb-2 px-3 text-right">Buyers paid</th>
            <th className="pb-2 pl-3 text-right">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-[#efe3d0]">
              <td className="py-3 pr-3 font-semibold text-[#241a12]">{r.label}</td>
              <td className="py-3 px-3 text-right tabular-nums">{r.itemsSold}</td>
              <td className="py-3 px-3 text-right tabular-nums">{money(r.hammer)}</td>
              <td className="py-3 px-3 text-right tabular-nums text-[#6f5b46]">{money(r.premium)}</td>
              <td className="py-3 px-3 text-right tabular-nums text-[#6f5b46]">{money(r.tax)}</td>
              <td className="py-3 px-3 text-right tabular-nums font-bold text-[#241a12]">{money(r.charged)}</td>
              <td className="py-3 pl-3 text-right text-sm whitespace-nowrap">
                {r.compedCount > 0 && (
                  <span className="inline-block bg-[#efe3d0] text-[#6c4d39] border border-[#cdbda3] rounded-full px-2 py-0.5 font-bold ml-1">
                    {r.compedCount} comp
                  </span>
                )}
                {r.unpaidCount > 0 && (
                  <span className="inline-block bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-bold ml-1">
                    {money0(r.unpaidAmount)} unpaid
                  </span>
                )}
                {r.compedCount === 0 && r.unpaidCount === 0 && <span className="text-[#b3a085]">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
const RANGES: { key: string; label: string }[] = [
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "ytd", label: "This year" },
  { key: "all", label: "All time" },
];

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Payout report (warehouse → auction), with its own time range.
  const [payout, setPayout] = useState<PayoutReport | null>(null);
  const [payoutRange, setPayoutRange] = useState("90d");
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [openWarehouse, setOpenWarehouse] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch("/api/admin/reports")
      .then((r) => r.json())
      .then((d) => { if (d.totals) setData(d); else setError(true); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const loadPayout = useCallback((range: string) => {
    setPayoutLoading(true);
    fetch(`/api/admin/reports/by-warehouse?range=${range}`)
      .then((r) => r.json())
      .then((w) => setPayout(w && w.warehouses ? w : null))
      .catch(() => setPayout(null))
      .finally(() => setPayoutLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadPayout(payoutRange); }, [payoutRange, loadPayout]);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><p className="text-lg text-[#8a7559]">Loading reports…</p></div>;
  }
  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-[#6f5b46]">Couldn&apos;t load reports.</p>
          <button onClick={load} className="mt-3 bg-[#6c4d39] hover:bg-[#563e2c] text-white text-base font-semibold px-5 py-2.5 rounded-xl transition-colors">Try again</button>
        </div>
      </div>
    );
  }

  const { totals, periods, byAuction, byWarehouse, outstanding, feePercent, taxPercent } = data;
  const maxMonth = Math.max(1, ...periods.byMonth.map((m) => m.total));

  return (
    <>
      <header className="border-b border-[#e3d6bf] px-6 sm:px-8 py-5">
        <h1 className="text-2xl sm:text-3xl font-semibold">Reports</h1>
        <p className="text-base text-[#6f5b46] mt-1">
          Every number here is explained in plain English. Nothing is estimated except Stripe&apos;s fee.
        </p>
      </header>

      <div className="px-4 sm:px-8 py-6 space-y-4 max-w-5xl">

        {/* ── The four numbers that matter ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <BigStat
            label="Item sales"
            value={money(totals.hammer)}
            explain={`What ${totals.itemsSold} item${totals.itemsSold !== 1 ? "s" : ""} sold for, added up. Just the winning bids — no premium, no tax.`}
          />
          <BigStat
            label="Buyers paid you"
            value={money(totals.totalCharged)}
            tone="leather"
            explain="Item sales plus buyer's premium plus sales tax. The full amount charged to cards."
          />
          <BigStat
            label="Stripe deposits"
            value={money(totals.netDeposited)}
            tone="leather"
            explain="What actually lands in your bank, after Stripe takes its cut. Sales tax is still sitting in here."
          />
          <BigStat
            label="Yours to keep"
            value={money(totals.netProfit)}
            tone="good"
            explain="After Stripe's fee AND after you send the sales tax to Michigan. This is the real number."
          />
        </div>

        {/* ── Money walkthrough ── */}
        <Section
          title="Where every dollar goes"
          what="Start at what items sold for, end at what you keep. Each line adds or subtracts."
        >
          <div>
            <FlowRow
              label="Item sales (the hammer price)"
              note="What people actually bid and won at."
              value={totals.hammer}
              sign="none"
            />
            <FlowRow
              label={`Buyer's premium (${feePercent}%)`}
              note="Your fee, added on top of the bid. The buyer pays this, not you."
              value={totals.premium}
              sign="plus"
            />
            <FlowRow
              label={`Sales tax (${taxPercent}%)`}
              note="Collected from the buyer on the bid + premium. This is not your money — you're holding it for the state."
              value={totals.tax}
              sign="plus"
            />
            <FlowRow label="Buyers paid you this much" value={totals.totalCharged} sign="equals" strong />
            <FlowRow
              label={`Stripe's fee (${totals.txnCount} charge${totals.txnCount !== 1 ? "s" : ""})`}
              note="Estimated at 2.9% + 30¢ per charge. One charge per buyer per auction, not per item."
              value={totals.stripeFees}
              sign="minus"
            />
            <FlowRow label="Stripe deposits to your bank" value={totals.netDeposited} sign="equals" strong />
            <FlowRow
              label="Sales tax you owe Michigan"
              note="Set this aside. It was never yours."
              value={totals.tax}
              sign="minus"
            />
            <FlowRow label="Yours to keep" value={totals.netProfit} sign="equals" strong />
          </div>
        </Section>

        {/* ── Per auction ── */}
        <Section
          title="Each auction"
          what="How every auction performed. Newest first."
        >
          <BreakdownTable rows={byAuction} emptyText="No completed sales yet." />
        </Section>

        {/* ── Per warehouse ── */}
        <Section
          title="Each warehouse"
          what="The same money, split by where the items were stored."
        >
          <BreakdownTable rows={byWarehouse} emptyText="No completed sales yet." />
        </Section>

        {/* ── Payout: warehouse → auction ── */}
        <Section
          title="Payout by warehouse"
          what="What each warehouse earned, broken down by auction. Tap a warehouse to see its auctions."
        >
          <div className="flex flex-wrap gap-2 mb-4">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setPayoutRange(r.key)}
                className={`px-3.5 py-2 rounded-xl text-sm font-bold border transition-colors ${
                  payoutRange === r.key
                    ? "bg-[#6c4d39] text-white border-[#6c4d39]"
                    : "bg-white text-[#4a3a2b] border-[#cdbda3] hover:bg-[#efe3d0]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {payoutLoading ? (
            <p className="text-base text-[#8a7559]">Loading…</p>
          ) : !payout || payout.warehouses.length === 0 ? (
            <p className="text-base text-[#8a7559]">No paid sales in this period.</p>
          ) : (
            <div className="space-y-3">
              {/* Grand total first, so the headline number is the one you came for. */}
              <div className="bg-[#6c4d39] text-white rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold uppercase tracking-wider text-[#e8d9c2]">
                    Total payout — all warehouses
                  </div>
                  <div className="text-sm text-[#e8d9c2] mt-0.5">
                    {payout.grandTotal.itemsSold} item{payout.grandTotal.itemsSold !== 1 ? "s" : ""} sold
                  </div>
                </div>
                <div className="text-3xl font-extrabold tabular-nums">{money(payout.grandTotal.net)}</div>
              </div>

              {payout.warehouses.map((w) => {
                const open = openWarehouse === w.name;
                return (
                  <div key={w.name} className="border border-[#e3d6bf] rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenWarehouse(open ? null : w.name)}
                      className="w-full text-left px-5 py-4 bg-[#faf5ea] hover:bg-[#f1e7d5] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-lg font-bold text-[#241a12]">{w.name}</div>
                          <div className="text-sm text-[#6f5b46] mt-0.5">
                            {w.itemsSold} item{w.itemsSold !== 1 ? "s" : ""} · {w.auctions.length} auction
                            {w.auctions.length !== 1 ? "s" : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-xs font-bold text-[#8a7559] uppercase tracking-wide">Payout</div>
                            <div className="text-xl font-extrabold text-[#5f7a45] tabular-nums">{money(w.net)}</div>
                          </div>
                          <span className={`text-[#8a7559] transition-transform ${open ? "rotate-180" : ""}`}>
                            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
                          </span>
                        </div>
                      </div>

                      {/* The math, spelled out on one line. */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm text-[#6f5b46]">
                        <span>Hammer <strong className="text-[#241a12]">{money(w.sales)}</strong></span>
                        <span>+ Premium <strong className="text-[#241a12]">{money(w.premium)}</strong></span>
                        {w.credit > 0 && <span>− Bid Bucks <strong className="text-red-600">{money(w.credit)}</strong></span>}
                        <span>− Stripe <strong className="text-red-600">{money(w.fees)}</strong></span>
                        <span className="text-[#8a7559]">(tax {money(w.tax)} collected &amp; remitted)</span>
                      </div>
                    </button>

                    {open && (
                      <div className="border-t border-[#efe3d0] overflow-x-auto">
                        <table className="w-full text-base border-collapse min-w-[620px]">
                          <thead>
                            <tr className="text-left text-sm font-bold text-[#8a7559] uppercase tracking-wide bg-white">
                              <th className="py-2.5 px-5">Auction</th>
                              <th className="py-2.5 px-3 text-right">Items</th>
                              <th className="py-2.5 px-3 text-right">Hammer</th>
                              <th className="py-2.5 px-3 text-right">Premium</th>
                              <th className="py-2.5 px-3 text-right">Tax</th>
                              <th className="py-2.5 px-3 text-right">Stripe</th>
                              <th className="py-2.5 px-5 text-right">Payout</th>
                            </tr>
                          </thead>
                          <tbody>
                            {w.auctions.map((a) => (
                              <tr key={a.title} className="border-t border-[#efe3d0] bg-white">
                                <td className="py-3 px-5 font-semibold text-[#241a12]">{a.title}</td>
                                <td className="py-3 px-3 text-right tabular-nums">{a.itemsSold}</td>
                                <td className="py-3 px-3 text-right tabular-nums">{money(a.sales)}</td>
                                <td className="py-3 px-3 text-right tabular-nums text-[#6f5b46]">{money(a.premium)}</td>
                                <td className="py-3 px-3 text-right tabular-nums text-[#8a7559]">{money(a.tax)}</td>
                                <td className="py-3 px-3 text-right tabular-nums text-red-600">−{money(a.fees)}</td>
                                <td className="py-3 px-5 text-right tabular-nums font-extrabold text-[#5f7a45]">{money(a.net)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="bg-[#efe3d0] border border-[#cdbda3] rounded-xl p-4 text-base text-[#4a3a2b] leading-relaxed">
                <strong>How payout is worked out.</strong> Hammer price + buyer&apos;s premium,
                minus any Bid Bucks credit the buyer used, minus Stripe&apos;s cut. Sales tax isn&apos;t
                in the payout because you collect it and hand it straight to Michigan — in and out, nets to zero.
                <br /><br />
                When one buyer wins items across two warehouses, Stripe charges them once. That single
                fee is split between the warehouses in proportion to what each was owed, so no warehouse
                is charged for the other&apos;s share. Your own comped wins are excluded entirely.
              </div>
            </div>
          )}
        </Section>

        {/* ── Admin comps ── */}
        <Section
          title="Your own wins (comped)"
          what="Items you won yourself. Real bids, but your card is never charged."
          defaultOpen={totals.compedCount > 0}
        >
          {totals.compedCount === 0 ? (
            <p className="text-base text-[#8a7559]">
              You haven&apos;t won any items yourself yet. When you do, they&apos;ll be listed here and kept out of your sales numbers.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-[#faf5ea] border border-[#e3d6bf] rounded-xl p-4">
                  <div className="text-sm font-bold text-[#8a7559] uppercase tracking-wide">Items you won</div>
                  <div className="text-3xl font-extrabold text-[#6c4d39] mt-1">{totals.compedCount}</div>
                </div>
                <div className="bg-[#faf5ea] border border-[#e3d6bf] rounded-xl p-4">
                  <div className="text-sm font-bold text-[#8a7559] uppercase tracking-wide">What they bid up to</div>
                  <div className="text-3xl font-extrabold text-[#6c4d39] mt-1">{money(totals.compedHammer)}</div>
                </div>
              </div>
              <div className="bg-[#efe3d0] border border-[#cdbda3] rounded-xl p-4 text-base text-[#4a3a2b] leading-relaxed">
                <strong>Why this is separate.</strong> When you bid, it&apos;s a real bid — it raises the price
                and can outbid customers. But if you win, nothing is charged. So that {money(totals.compedHammer)}{" "}
                is <strong>not</strong> counted in item sales, and those {totals.compedCount} item
                {totals.compedCount !== 1 ? "s are" : " is"} <strong>not</strong> counted as sold.
                <br /><br />
                This is why the total on an auction&apos;s manage page can be higher than the sales here.
                That page shows what everything <em>bid up to</em>, including your own wins. This page only
                counts money that actually moved.
              </div>
            </div>
          )}
        </Section>

        {/* ── Recent months ── */}
        <Section title="Last 6 months" what="Item sales plus tax collected, month by month.">
          <div className="space-y-2.5">
            {periods.byMonth.map((m) => (
              <div key={m.label} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-sm font-semibold text-[#6f5b46]">{m.label}</span>
                <div className="flex-1 h-7 bg-[#efe3d0] rounded-lg overflow-hidden">
                  <div className="h-full bg-[#6c4d39] rounded-lg" style={{ width: `${(m.total / maxMonth) * 100}%` }} />
                </div>
                <span className="w-24 text-right text-base font-semibold text-[#241a12] shrink-0 tabular-nums">{money0(m.total)}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 mt-5">
            <div className="bg-[#faf5ea] border border-[#e3d6bf] rounded-xl p-4">
              <div className="text-sm font-bold text-[#8a7559] uppercase tracking-wide">Last 7 days</div>
              <div className="text-2xl font-extrabold text-[#241a12] mt-1">{money(periods.weekSales)}</div>
            </div>
            <div className="bg-[#faf5ea] border border-[#e3d6bf] rounded-xl p-4">
              <div className="text-sm font-bold text-[#8a7559] uppercase tracking-wide">This month</div>
              <div className="text-2xl font-extrabold text-[#241a12] mt-1">{money(periods.monthSales)}</div>
            </div>
          </div>
        </Section>

        {/* ── Who owes ── */}
        <Section
          title="Who still owes you money"
          what="Winners whose card hasn't gone through yet."
          defaultOpen={outstanding.count > 0}
        >
          {outstanding.count === 0 ? (
            <p className="text-base text-[#5f7a45] font-semibold">Nobody. Everyone has paid.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-base text-[#4a3a2b]">
                <strong>{outstanding.count}</strong> {outstanding.count === 1 ? "person owes" : "people owe"}{" "}
                <strong>{money(outstanding.total)}</strong> in total. This money is not in any number above.
              </p>
              {outstanding.owers.map((o, i) => (
                <div key={i} className="bg-[#faf5ea] border border-[#e3d6bf] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#241a12]">{o.name}</div>
                    <div className="text-sm text-[#8a7559]">
                      {o.items.length} item{o.items.length !== 1 ? "s" : ""}
                      {o.email ? ` · ${o.email}` : ""}
                      {o.phone ? ` · ${o.phone}` : ""}
                    </div>
                  </div>
                  <div className="text-xl font-extrabold text-[#a3701d] tabular-nums shrink-0">{money(o.amountDue)}</div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Glossary ── */}
        <Section title="What these words mean" what="Plain definitions, no accounting background needed." defaultOpen={false}>
          <dl className="space-y-4 text-base">
            {[
              ["Hammer price / item sales", "What an item sold for. If someone won a lamp at $30, the hammer price is $30. This is the number auctioneers quote each other."],
              ["Buyer's premium", `Your service fee, added on top of the winning bid. At ${feePercent}%, a $30 win becomes $${(30 * (1 + feePercent / 100)).toFixed(2)}. The buyer pays it — it's income for you.`],
              ["Sales tax", `Charged to the buyer on the bid plus the premium, currently ${taxPercent}%. You collect it and send it to Michigan. It passes through you; it is never your money.`],
              ["Buyers paid", "Bid + premium + tax. The number the customer actually sees on their card statement."],
              ["Stripe fee", "Roughly 2.9% + 30¢ every time a card is charged. A buyer who wins five items in one auction is charged once, so you pay one fee, not five."],
              ["Yours to keep", "What's left after Stripe's fee and after setting aside the sales tax. The only number that reflects what you actually earned."],
              ["Comped", "An item you won yourself. The bid was real, but your card was never charged, so it counts as $0 of sales."],
              ["Unpaid", "A winner whose card declined or hasn't been charged yet. Not counted as sales until the money actually arrives."],
            ].map(([term, def]) => (
              <div key={term}>
                <dt className="font-bold text-[#241a12]">{term}</dt>
                <dd className="text-[#4a3a2b] leading-snug mt-0.5">{def}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <p className="text-sm text-[#8a7559] px-1 pb-4">
          Stripe&apos;s fee is an estimate using standard US pricing (2.9% + 30¢). Every other number
          comes straight from your actual payment records. For filing taxes, always confirm against
          your Stripe dashboard.
        </p>
      </div>
    </>
  );
}
