"use client";
import { useEffect, useMemo, useState } from "react";

type Flag = { label: string; kind: "warn" | "info" | "bad" };
type FItem = {
  id: string; code: string | null; title: string;
  where: string; inTransit: boolean;
  placed: "placed" | "needs" | "nospot";
  plan: string; planKind: "waiting" | "gathered" | "appt" | "staged" | "transit";
  detail: string;
};
type Customer = {
  clerkUserId: string; name: string | null; email: string | null; phone: string | null;
  preferredLocation: string | null; itemCount: number; waitingDays: number;
  flags: Flag[]; attention: number; items: FItem[];
};
type Data = {
  customers: Customer[];
  totals: { customers: number; items: number; flagged: number; needsPlacing: number };
};

const flagCls = (k: Flag["kind"]) =>
  k === "bad" ? "bg-red-100 text-red-700 border-red-200"
  : k === "warn" ? "bg-amber-100 text-amber-800 border-amber-200"
  : "bg-slate-100 text-slate-600 border-slate-200";

function PlacedChip({ p }: { p: FItem["placed"] }) {
  if (p === "needs") return <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">Needs placing</span>;
  if (p === "nospot") return <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">No spot</span>;
  return <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Placed</span>;
}
function PlanChip({ it }: { it: FItem }) {
  const cls =
    it.planKind === "staged" ? "bg-emerald-100 text-emerald-700"
    : it.planKind === "appt" ? "bg-blue-100 text-blue-700"
    : it.planKind === "gathered" ? "bg-indigo-100 text-indigo-700"
    : it.planKind === "transit" ? "bg-violet-100 text-violet-700"
    : "bg-slate-100 text-slate-600";
  return <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${cls} whitespace-nowrap`}>{it.plan}</span>;
}

export default function FulfillmentPage() {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "flagged" | "needs">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(false);
    fetch("/api/admin/fulfillment")
      .then((r) => r.json())
      .then((j) => { if (j.customers) setD(j); else setError(true); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    if (!d) return [];
    let r = d.customers;
    if (filter === "flagged") r = r.filter((c) => c.attention > 0);
    else if (filter === "needs") r = r.filter((c) => c.flags.some((f) => f.label === "Needs placing"));
    const term = q.trim().toLowerCase();
    if (term) r = r.filter((c) =>
      (c.name ?? "").toLowerCase().includes(term) ||
      (c.email ?? "").toLowerCase().includes(term) ||
      (c.phone ?? "").includes(term) ||
      c.items.some((i) => (i.code ?? "").toLowerCase().includes(term) || i.title.toLowerCase().includes(term))
    );
    return r;
  }, [d, filter, q]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 sm:px-6 py-3.5 sticky top-0 z-10">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-bold tracking-tight">Fulfillment</h1>
          {d && (
            <div className="text-xs text-slate-500 flex gap-4 tabular-nums">
              <span><b className="text-slate-800">{d.totals.customers}</b> customers</span>
              <span><b className="text-slate-800">{d.totals.items}</b> items</span>
              <span className="text-amber-700"><b>{d.totals.flagged}</b> flagged</span>
              <span className="text-red-700"><b>{d.totals.needsPlacing}</b> need placing</span>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-1">Read-only overview of every customer&apos;s outstanding items across all auctions. Most-urgent first.</p>
      </header>

      <div className="px-4 sm:px-6 py-4 max-w-5xl">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {(["all", "flagged", "needs"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${filter === f ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
              {f === "all" ? "All" : f === "flagged" ? "Flagged" : "Needs placing"}
            </button>
          ))}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer or item…"
            className="flex-1 min-w-[180px] bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-slate-500" />
        </div>

        {loading ? (
          <p className="text-slate-400 text-sm py-10 text-center">Loading…</p>
        ) : error ? (
          <p className="text-red-600 text-sm py-10 text-center">Couldn&apos;t load fulfillment.</p>
        ) : rows.length === 0 ? (
          <p className="text-slate-400 text-sm py-10 text-center">No customers match.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((c) => {
              const open = openId === c.clerkUserId;
              return (
                <div key={c.clerkUserId} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <button onClick={() => setOpenId(open ? null : c.clerkUserId)}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-3">
                    <svg className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2"><path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900 truncate">{c.name || c.email || "Bidder"}</span>
                        <span className="text-xs text-slate-400 tabular-nums">{c.itemCount} item{c.itemCount !== 1 ? "s" : ""}</span>
                        {c.preferredLocation && <span className="text-[11px] text-slate-500">→ {c.preferredLocation}</span>}
                      </div>
                      <div className="flex items-center gap-1 flex-wrap mt-1">
                        {c.flags.map((f, i) => (
                          <span key={i} className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${flagCls(f.kind)}`}>{f.label}</span>
                        ))}
                        {c.flags.length === 0 && <span className="text-[11px] text-emerald-600 font-semibold">Clear · {c.waitingDays}d</span>}
                      </div>
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-slate-100 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                            <th className="text-left font-semibold px-3.5 py-1.5">Item</th>
                            <th className="text-left font-semibold px-2 py-1.5">Where</th>
                            <th className="text-left font-semibold px-2 py-1.5">Placed?</th>
                            <th className="text-left font-semibold px-2 py-1.5 pr-3.5">Plan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.items.map((it) => (
                            <tr key={it.id} className="border-b border-slate-50 last:border-0">
                              <td className="px-3.5 py-1.5 align-top">
                                <div className="flex items-start gap-1.5 min-w-0">
                                  {it.code && <span className="font-mono text-xs font-bold text-slate-500 shrink-0">{it.code}</span>}
                                  <span className="text-slate-800 truncate max-w-[16rem]">{it.title}</span>
                                </div>
                              </td>
                              <td className="px-2 py-1.5 align-top whitespace-nowrap text-slate-600">{it.where}</td>
                              <td className="px-2 py-1.5 align-top"><PlacedChip p={it.placed} /></td>
                              <td className="px-2 py-1.5 pr-3.5 align-top">
                                <PlanChip it={it} />
                                {it.detail && <span className="text-[11px] text-slate-400 ml-1">{it.detail}</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
