"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Ower { name: string; email: string; phone: string; amountDue: number; items: string[]; }
interface ReportData {
  feePercent?: number;
  taxPercent?: number;
  totals: {
    grossSales: number; premiumCollected: number; taxCollected: number; totalCharged: number;
    stripeFees: number; netDeposited: number; netProfit: number;
    itemsSold: number; txnCount: number;
  };
  periods: { weekSales: number; monthSales: number; byMonth: { label: string; total: number }[] };
  outstanding: { total: number; count: number; owers: Ower[] };
}

interface WhBucket {
  net: number; sales: number; premium: number; tax: number; fees: number; credit: number; itemsSold: number;
}
interface WarehouseRow extends WhBucket {
  name: string;
  auctions: (WhBucket & { title: string })[];
}
interface WarehouseReport {
  warehouses: WarehouseRow[];
  grandTotal: WhBucket;
}

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Money({ label, value, dim }: { label: string; value: number; dim?: boolean }) {
  return (
    <div>
      <div className="text-xs text-[#8a7559]">{label}</div>
      <div className={`font-semibold ${dim ? "text-[#6f5b46]" : "text-[#241a12]"}`}>
        {dim ? "−" : ""}{money(value)}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "moss" | "leather" | "ink" }) {
  const color = accent === "moss" ? "text-[#5f7a45]" : accent === "leather" ? "text-[#6c4d39]" : "text-[#241a12]";
  return (
    <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 sm:p-7">
      <div className="text-sm font-semibold text-[#8a7559] uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-3xl sm:text-4xl font-extrabold font-display ${color}`}>{value}</div>
      {sub && <div className="text-sm text-[#8a7559] mt-2">{sub}</div>}
    </div>
  );
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [wh, setWh] = useState<WarehouseReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    Promise.all([
      fetch("/api/admin/reports").then((r) => r.json()),
      fetch("/api/admin/reports/by-warehouse").then((r) => r.json()).catch(() => null),
    ])
      .then(([d, w]) => {
        if (d.totals) setData(d); else setError(true);
        if (w && w.warehouses) setWh(w);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><p className="text-lg text-[#8a7559]">Loading reports…</p></div>;
  }
  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-[#6f5b46]">Couldn&apos;t load reports.</p>
          <button onClick={load} className="mt-3 bg-[#6c4d39] hover:bg-[#563e2c] text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">Try again</button>
        </div>
      </div>
    );
  }

  const { totals, periods, outstanding } = data;
  const maxMonth = Math.max(1, ...periods.byMonth.map((m) => m.total));

  return (
    <>
      <header className="border-b border-[#e3d6bf] px-6 sm:px-8 py-5">
        <h1 className="text-2xl sm:text-3xl font-bold">Reports</h1>
        <p className="text-base text-[#6f5b46] mt-1">Sales, taxes, payouts, and who still owes.</p>
      </header>

      <div className="flex-1 px-6 sm:px-8 py-6 space-y-8 overflow-auto">

        {/* Money summary */}
        <section>
          <h2 className="text-lg font-bold mb-4">The bottom line</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="Total Sales" value={money(totals.grossSales)} sub={`${totals.itemsSold} item${totals.itemsSold !== 1 ? "s" : ""} sold`} accent="ink" />
            <StatCard label="Take-Home (after fees & tax)" value={money(totals.netProfit)} sub="What's truly yours to keep" accent="moss" />
            <StatCard label="Deposited by Stripe" value={money(totals.netDeposited)} sub="After Stripe fees, before tax" accent="leather" />
            <StatCard label="Sales Tax to Remit" value={money(totals.taxCollected)} sub={`${data.taxPercent ?? 6}% — owed to Michigan`} accent="leather" />
          </div>
        </section>

        {/* Net take-home by warehouse */}
        {wh && wh.warehouses.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <h2 className="text-lg font-bold">Take-home by warehouse</h2>
              <span className="text-2xl font-extrabold font-display text-[#5f7a45]">{money(wh.grandTotal.net)}</span>
            </div>
            <p className="text-sm text-[#6f5b46] mb-4">
              Paid sales only — what you actually pocket: sale + buyer&apos;s premium − sales tax − Stripe fees{wh.grandTotal.credit > 0 ? " − Bid Bucks" : ""}.
            </p>

            <div className="space-y-4">
              {wh.warehouses.map((w) => (
                <div key={w.name} className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden">
                  {/* Warehouse header */}
                  <div className="px-5 sm:px-6 py-4 border-b border-[#e3d6bf] flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-lg font-bold text-[#241a12]">{w.name}</div>
                      <div className="text-sm text-[#8a7559]">{w.itemsSold} item{w.itemsSold !== 1 ? "s" : ""} sold</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-extrabold text-[#5f7a45]">{money(w.net)}</div>
                      <div className="text-xs text-[#8a7559]">net pocketed</div>
                    </div>
                  </div>

                  {/* Warehouse breakdown line */}
                  <div className="px-5 sm:px-6 py-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm border-b border-[#efe3d0] bg-[#faf6ee]">
                    <Money label="Sales" value={w.sales} />
                    <Money label="Premium" value={w.premium} />
                    <Money label="− Sales tax" value={w.tax} dim />
                    <Money label="− Stripe fees" value={w.fees} dim />
                  </div>

                  {/* Per-auction rows */}
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[#8a7559] border-b border-[#e3d6bf]">
                          <th className="px-5 sm:px-6 py-2.5">Auction</th>
                          <th className="px-3 py-2.5 text-right">Sales</th>
                          <th className="px-3 py-2.5 text-right">Premium</th>
                          <th className="px-3 py-2.5 text-right">Tax</th>
                          <th className="px-3 py-2.5 text-right">Fees</th>
                          {w.credit > 0 && <th className="px-3 py-2.5 text-right">Bid Bucks</th>}
                          <th className="px-5 sm:px-6 py-2.5 text-right">Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {w.auctions.map((a) => (
                          <tr key={a.title} className="border-b border-[#efe3d0] last:border-0">
                            <td className="px-5 sm:px-6 py-2.5 font-medium text-[#241a12]">{a.title}</td>
                            <td className="px-3 py-2.5 text-right">{money(a.sales)}</td>
                            <td className="px-3 py-2.5 text-right">{money(a.premium)}</td>
                            <td className="px-3 py-2.5 text-right text-[#8a7559]">−{money(a.tax)}</td>
                            <td className="px-3 py-2.5 text-right text-[#8a7559]">−{money(a.fees)}</td>
                            {w.credit > 0 && <td className="px-3 py-2.5 text-right text-[#8a7559]">−{money(a.credit)}</td>}
                            <td className="px-5 sm:px-6 py-2.5 text-right font-bold text-[#5f7a45]">{money(a.net)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Period sales */}
        <section>
          <h2 className="text-lg font-bold mb-4">Sales over time</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <StatCard label="This Week" value={money(periods.weekSales)} sub="Last 7 days (bid + tax)" />
            <StatCard label="This Month" value={money(periods.monthSales)} sub="Calendar month to date" />
          </div>
          <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 sm:p-7">
            <div className="text-sm font-semibold text-[#8a7559] uppercase tracking-wider mb-4">Last 6 Months</div>
            <div className="space-y-3">
              {periods.byMonth.map((m) => (
                <div key={m.label} className="flex items-center gap-3">
                  <span className="w-14 text-sm text-[#6f5b46] shrink-0">{m.label}</span>
                  <div className="flex-1 bg-[#efe3d0] rounded-lg h-7 overflow-hidden">
                    <div className="h-full bg-[#6c4d39] rounded-lg" style={{ width: `${(m.total / maxMonth) * 100}%` }} />
                  </div>
                  <span className="w-24 text-right text-base font-semibold text-[#241a12] shrink-0">{money(m.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Fee breakdown */}
        <section>
          <h2 className="text-lg font-bold mb-4">How the money breaks down</h2>
          <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 sm:p-7">
            <table className="w-full text-base">
              <tbody className="divide-y divide-[#e3d6bf]">
                <tr><td className="py-3 text-[#4a3a2b]">Item sales (winning bids)</td><td className="py-3 text-right font-semibold">{money(totals.grossSales)}</td></tr>
                <tr><td className="py-3 text-[#4a3a2b]">+ Buyer&apos;s premium ({data.feePercent ?? 15}%)</td><td className="py-3 text-right font-semibold">{money(totals.premiumCollected)}</td></tr>
                <tr><td className="py-3 text-[#4a3a2b]">+ Sales tax charged to buyers</td><td className="py-3 text-right font-semibold">{money(totals.taxCollected)}</td></tr>
                <tr><td className="py-3 text-[#4a3a2b]">= Total charged to buyers</td><td className="py-3 text-right font-semibold">{money(totals.totalCharged)}</td></tr>
                <tr><td className="py-3 text-[#4a3a2b]">− Stripe fees ({totals.txnCount} charge{totals.txnCount !== 1 ? "s" : ""} × 2.9% + 30¢)</td><td className="py-3 text-right font-semibold text-red-600">−{money(totals.stripeFees)}</td></tr>
                <tr><td className="py-3 text-[#4a3a2b]">= Deposited by Stripe</td><td className="py-3 text-right font-semibold">{money(totals.netDeposited)}</td></tr>
                <tr><td className="py-3 text-[#4a3a2b]">− Sales tax owed to Michigan</td><td className="py-3 text-right font-semibold text-red-600">−{money(totals.taxCollected)}</td></tr>
                <tr><td className="py-3.5 font-bold text-[#241a12]">Your take-home</td><td className="py-3.5 text-right font-extrabold text-[#5f7a45] text-lg">{money(totals.netProfit)}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Who owes — summary only; the full list with one-tap email/call lives on Winners & Payments */}
        <section>
          <h2 className="text-lg font-bold mb-4">
            Payments due {outstanding.count > 0 && <span className="text-[#6c4d39]">({money(outstanding.total)})</span>}
          </h2>
          {outstanding.owers.length === 0 ? (
            <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 text-base text-[#6f5b46]">
              Everyone&apos;s paid up — no outstanding balances. 🎉
            </div>
          ) : (
            <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-base text-[#241a12] font-semibold">
                  {outstanding.count} {outstanding.count === 1 ? "person owes" : "people owe"} {money(outstanding.total)}
                </div>
                <div className="text-sm text-[#8a7559] mt-1">
                  See the full list and contact each person on the Winners &amp; Payments page.
                </div>
              </div>
              <Link
                href="/admin/winners"
                className="bg-[#6c4d39] hover:bg-[#563e2c] text-white text-base font-semibold px-6 py-3.5 rounded-xl transition-colors whitespace-nowrap text-center"
              >
                View Winners &amp; Payments
              </Link>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
