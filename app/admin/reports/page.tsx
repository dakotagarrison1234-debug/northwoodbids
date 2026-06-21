"use client";
import { useState, useEffect } from "react";

interface Ower { name: string; email: string; phone: string; amountDue: number; items: string[]; }
interface ReportData {
  totals: {
    grossSales: number; taxCollected: number; totalCharged: number;
    stripeFees: number; netDeposited: number; netProfit: number;
    itemsSold: number; txnCount: number;
  };
  periods: { weekSales: number; monthSales: number; byMonth: { label: string; total: number }[] };
  outstanding: { total: number; count: number; owers: Ower[] };
}

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/reports")
      .then((r) => r.json())
      .then((d) => { if (d.totals) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><p className="text-lg text-[#8a7559]">Loading reports…</p></div>;
  }
  if (!data) {
    return <div className="flex-1 flex items-center justify-center"><p className="text-lg text-[#8a7559]">Could not load reports.</p></div>;
  }

  const { totals, periods, outstanding } = data;
  const maxMonth = Math.max(1, ...periods.byMonth.map((m) => m.total));

  return (
    <>
      <header className="border-b border-[#e3d6bf] px-4 sm:px-8 py-5">
        <h1 className="text-2xl sm:text-3xl font-bold">Reports</h1>
        <p className="text-base text-[#6f5b46] mt-1">Sales, taxes, payouts, and who still owes.</p>
      </header>

      <div className="flex-1 px-4 sm:px-8 py-6 space-y-8 overflow-auto">

        {/* Money summary */}
        <section>
          <h2 className="text-lg font-bold mb-4">The bottom line</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="Total Sales" value={money(totals.grossSales)} sub={`${totals.itemsSold} item${totals.itemsSold !== 1 ? "s" : ""} sold`} accent="ink" />
            <StatCard label="Take-Home (after fees & tax)" value={money(totals.netProfit)} sub="What's truly yours to keep" accent="moss" />
            <StatCard label="Deposited by Stripe" value={money(totals.netDeposited)} sub="After Stripe fees, before tax" accent="leather" />
            <StatCard label="Sales Tax to Remit" value={money(totals.taxCollected)} sub="6% — owed to Michigan" accent="leather" />
          </div>
        </section>

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

        {/* Who owes */}
        <section>
          <h2 className="text-lg font-bold mb-4">
            Payments due {outstanding.count > 0 && <span className="text-[#6c4d39]">({money(outstanding.total)})</span>}
          </h2>
          {outstanding.owers.length === 0 ? (
            <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 text-base text-[#6f5b46]">
              Everyone&apos;s paid up — no outstanding balances. 🎉
            </div>
          ) : (
            <div className="bg-white border border-[#e3d6bf] rounded-2xl divide-y divide-[#e3d6bf]">
              {outstanding.owers.map((o, i) => (
                <div key={i} className="px-5 sm:px-6 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-[#241a12]">{o.name}</div>
                    <div className="text-sm text-[#8a7559] truncate">{o.email}{o.phone ? ` · ${o.phone}` : ""}</div>
                    {o.items.length > 0 && <div className="text-sm text-[#8a7559] truncate mt-0.5">{o.items.join(", ")}</div>}
                  </div>
                  <div className="text-lg font-bold text-[#6c4d39] shrink-0">{money(o.amountDue)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
