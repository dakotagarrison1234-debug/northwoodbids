"use client";
import { useEffect, useState, useCallback } from "react";

type Line = {
  itemId: string; title: string; itemCode: string | null; auctionTitle: string | null;
  hammer: number; premium: number; tax: number; total: number; when: string | null; note: string | null;
};
type Group = {
  clerkUserId: string; name: string; email: string; phone: string;
  collected: number; items: number; lastPaidAt: string | null; lines: Line[];
};
type Data = { range: string; totals: { collected: number; items: number; people: number }; rows: Group[] };

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) => "$" + Math.round(n).toLocaleString();
const dt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

const RANGES = [
  { key: "7d", label: "Week" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "ytd", label: "Year" },
  { key: "all", label: "All" },
];

export default function CashReportView() {
  const [d, setD] = useState<Data | null>(null);
  const [range, setRange] = useState("90d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback((rg: string) => {
    setLoading(true); setError(false);
    fetch(`/api/admin/reports/cash?range=${rg}`)
      .then((r) => r.json())
      .then((j) => { if (j.totals) setD(j); else setError(true); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(range); }, [range, load]);

  return (
    <div className="px-4 sm:px-8 py-5 space-y-5 max-w-2xl mx-auto w-full pb-16">
      <div className="flex gap-1.5 flex-wrap">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`px-3.5 py-2 rounded-lg text-sm font-bold border transition-colors ${
              range === r.key ? "bg-[#6c4d39] text-white border-[#6c4d39]" : "bg-white text-[#6f5b46] border-[#cdbda3]"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading || error || !d ? (
        <div className="flex items-center justify-center p-10">
          {error ? (
            <div className="text-center">
              <p className="text-lg text-[#6f5b46]">Couldn&apos;t load the cash report.</p>
              <button onClick={() => load(range)} className="mt-3 bg-[#6c4d39] text-white text-base font-semibold px-5 py-2.5 rounded-xl">Try again</button>
            </div>
          ) : (
            <p className="text-lg text-[#8a7559]">Loading…</p>
          )}
        </div>
      ) : (
        <>
          {/* Hero */}
          <div className="rounded-3xl bg-gradient-to-br from-[#3f5226] to-[#5f7a45] text-white p-6 shadow-[0_8px_28px_rgba(79,102,57,0.25)]">
            <div className="text-sm font-bold uppercase tracking-[0.15em] text-[#d8e6c8]">Cash collected in person</div>
            <div className="text-5xl sm:text-6xl font-extrabold font-display tracking-tight mt-1 tabular-nums">
              {money0(d.totals.collected)}
            </div>
            <div className="text-base text-[#d8e6c8] mt-2">
              {d.totals.items} item{d.totals.items !== 1 ? "s" : ""} · {d.totals.people} customer{d.totals.people !== 1 ? "s" : ""} · full amount incl. tax
            </div>
          </div>

          {d.rows.length === 0 ? (
            <p className="text-base text-[#8a7559] bg-white border border-[#e3d6bf] rounded-2xl p-6 text-center">
              No cash payments in this period.
            </p>
          ) : (
            <div className="space-y-2.5">
              {d.rows.map((g) => {
                const isOpen = open === g.clerkUserId;
                return (
                  <div key={g.clerkUserId} className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : g.clerkUserId)}
                      className="w-full text-left p-4 hover:bg-[#faf5ea] transition-colors flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-[#241a12] truncate">{g.name}</div>
                        <div className="text-sm text-[#8a7559] truncate">
                          {g.items} item{g.items !== 1 ? "s" : ""}
                          {g.lastPaidAt ? ` · last ${dt(g.lastPaidAt)}` : ""}
                          {g.phone ? ` · ${g.phone}` : ""}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-2xl font-extrabold text-[#3f5226] tabular-nums leading-none">{money0(g.collected)}</div>
                        <div className="text-[11px] font-bold text-[#8a7559] uppercase tracking-wide mt-1">
                          {isOpen ? "Hide" : "Details"} ›
                        </div>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 border-t border-[#efe3d0] pt-3 space-y-2">
                        {g.lines.map((l) => (
                          <div key={l.itemId} className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-base text-[#241a12] flex items-center gap-1.5 flex-wrap">
                                {l.itemCode && <span className="font-mono font-bold text-[#6c4d39] text-sm">{l.itemCode}</span>}
                                <span className="truncate">{l.title}</span>
                              </div>
                              <div className="text-xs text-[#8a7559]">
                                {l.auctionTitle ? `${l.auctionTitle} · ` : ""}{dt(l.when)}
                                {l.note ? ` · “${l.note}”` : ""}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-bold text-[#241a12] tabular-nums">{money(l.total)}</div>
                              <div className="text-[11px] text-[#8a7559] tabular-nums">
                                {money(l.hammer)} + {money(l.premium)} prem{l.tax > 0 ? ` + ${money(l.tax)} tax` : ""}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-sm text-[#8a7559] px-1 leading-snug">
            Cash payments are counted as real revenue in the Sales report (with no Stripe fee, since nothing
            was processed). The totals here are the full amount the customer handed over — hammer + buyer&apos;s
            premium + sales tax.
          </p>
        </>
      )}
    </div>
  );
}
