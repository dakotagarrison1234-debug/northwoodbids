"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AreaTrend, Donut } from "./Charts";

type Bidder = {
  clerkUserId: string;
  name: string;
  email: string;
  phone: string;
  blocked: boolean;
  signupAt: string;
  daysSinceSignup: number;
  bids: number;
  won: number;
  paidItems: number;
  spend: number;
  lastBidAt: string | null;
  daysSinceLastBid: number | null;
  isNew: boolean;
  neverBid: boolean;
  active30: boolean;
  active60: boolean;
  stale: boolean;
};
type Summary = {
  totalBidders: number; newBidders: number; neverBid: number; everBid: number;
  active30: number; active60: number; stale: number; blocked: number;
  totalBids: number; totalRevenue: number; payers: number;
  avgSpendPerPayer: number; avgSpendPerBidder: number;
};
type Data = {
  summary: Summary;
  signupTrend: { label: string; count: number }[];
  topSpenders: { name: string; spend: number; won: number }[];
  bidders: Bidder[];
};

const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const dateShort = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const AGO = (days: number | null) => {
  if (days == null) return "never";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
};

type FilterKey = "all" | "new" | "never" | "active30" | "active60" | "stale" | "top";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New (30d)" },
  { key: "active30", label: "Active 30d" },
  { key: "active60", label: "Active 60d" },
  { key: "stale", label: "Stale" },
  { key: "never", label: "Never bid" },
  { key: "top", label: "Top spenders" },
];

type SortKey = "spend" | "bids" | "signup" | "lastbid";

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl bg-white border border-[#e3d6bf] p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[#8a7559]">{label}</div>
      <div className="text-2xl font-extrabold tabular-nums mt-0.5" style={{ color: accent ?? "#241a12" }}>{value}</div>
      {sub && <div className="text-xs text-[#8a7559] mt-0.5">{sub}</div>}
    </div>
  );
}

function StatusTag({ b }: { b: Bidder }) {
  const map: Record<string, [string, string, string]> = {
    "Never bid": ["Never bid", "#8a7559", "#f1e7d5"],
    "Active 30d": ["Active 30d", "#2f7a3f", "#e4f2e4"],
    "Active 60d": ["Active 60d", "#8a5a2b", "#f6ecda"],
    "Stale": ["Stale", "#b4462f", "#f7e2dc"],
  };
  const key = b.neverBid ? "Never bid" : b.active30 ? "Active 30d" : b.active60 ? "Active 60d" : "Stale";
  const [txt, fg, bg] = map[key];
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: fg, background: bg }}>
      {txt}
    </span>
  );
}

export default function BidderReportView() {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("spend");
  const [q, setQ] = useState("");

  useEffect(() => {
    setLoading(true); setError(false);
    fetch("/api/admin/bidders/report")
      .then((r) => r.json())
      .then((j) => { if (j.summary) setD(j); else setError(true); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!d) return [];
    let rows = d.bidders;
    if (filter === "new") rows = rows.filter((r) => r.isNew);
    else if (filter === "never") rows = rows.filter((r) => r.neverBid);
    else if (filter === "active30") rows = rows.filter((r) => r.active30);
    else if (filter === "active60") rows = rows.filter((r) => r.active60);
    else if (filter === "stale") rows = rows.filter((r) => r.stale);
    else if (filter === "top") rows = rows.filter((r) => r.spend > 0);

    const term = q.trim().toLowerCase();
    if (term) rows = rows.filter((r) =>
      r.name.toLowerCase().includes(term) ||
      r.email.toLowerCase().includes(term) ||
      r.phone.includes(term)
    );

    const sorted = [...rows];
    if (sort === "spend") sorted.sort((a, b) => b.spend - a.spend || b.bids - a.bids);
    else if (sort === "bids") sorted.sort((a, b) => b.bids - a.bids || b.spend - a.spend);
    else if (sort === "signup") sorted.sort((a, b) => a.daysSinceSignup - b.daysSinceSignup);
    else if (sort === "lastbid") sorted.sort((a, b) => (a.daysSinceLastBid ?? 1e9) - (b.daysSinceLastBid ?? 1e9));
    return sorted;
  }, [d, filter, sort, q]);

  if (loading || error || !d) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        {error ? (
          <div className="text-center">
            <p className="text-lg text-[#6f5b46]">Couldn&apos;t load the bidder report.</p>
            <button onClick={() => location.reload()} className="mt-3 bg-[#6c4d39] text-white text-base font-semibold px-5 py-2.5 rounded-xl">Try again</button>
          </div>
        ) : (
          <p className="text-lg text-[#8a7559]">Loading…</p>
        )}
      </div>
    );
  }

  const s = d.summary;
  const spendMax = Math.max(1, ...d.topSpenders.map((t) => t.spend));

  // Bidder base, as mutually-exclusive segments (they sum to total bidders):
  //   Active ≤30d · Cooling 31–60d · Stale >60d · Never bid.
  const baseSlices = [
    { label: "Active (≤30d)", value: s.active30, color: "#4a7c59" },
    { label: "Cooling (31–60d)", value: Math.max(0, s.active60 - s.active30), color: "#c47b3e" },
    { label: "Stale (60d+)", value: s.stale, color: "#b4462f" },
    { label: "Never bid", value: s.neverBid, color: "#b3a085" },
  ];

  return (
    <div className="px-4 sm:px-8 py-5 space-y-6 max-w-3xl mx-auto w-full pb-20">
      {/* ── Headline stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Total bidders" value={s.totalBidders.toLocaleString()} sub={`${s.everBid} have bid`} />
        <StatCard label="New (30 days)" value={s.newBidders.toLocaleString()} accent="#2f7a3f" sub="just signed up" />
        <StatCard label="Never bid" value={s.neverBid.toLocaleString()} accent="#8a5a2b" sub="signed up, no bids" />
        <StatCard label="Active (30d)" value={s.active30.toLocaleString()} accent="#2f7a3f" sub="bid in last 30 days" />
        <StatCard label="Active (60d)" value={s.active60.toLocaleString()} sub="bid in last 60 days" />
        <StatCard label="Stale" value={s.stale.toLocaleString()} accent="#b4462f" sub="bid before, quiet 60d+" />
      </div>

      {/* ── Money ── */}
      <div className="rounded-3xl bg-gradient-to-br from-[#4f6639] to-[#5f7a45] text-white p-6 shadow-[0_8px_28px_rgba(79,102,57,0.25)]">
        <div className="text-sm font-bold uppercase tracking-[0.15em] text-[#d8e6c8]">Total customer spend</div>
        <div className="text-4xl sm:text-5xl font-extrabold font-display tracking-tight mt-1 tabular-nums">{money0(s.totalRevenue)}</div>
        <div className="text-base text-[#d8e6c8] mt-2">
          {s.payers} paying bidder{s.payers !== 1 ? "s" : ""} · {money0(s.avgSpendPerPayer)} avg each · {s.totalBids.toLocaleString()} total bids placed
        </div>
      </div>

      {/* ── Bidder base health ── */}
      <div className="rounded-2xl bg-white border border-[#e3d6bf] p-4">
        <div className="text-sm font-bold text-[#241a12] mb-3">Your bidder base</div>
        <Donut slices={baseSlices} centerTop={s.totalBidders.toLocaleString()} centerSub="bidders" />
        <p className="text-xs text-[#8a7559] mt-3 leading-snug">
          {s.everBid} of {s.totalBidders} have ever bid. Chasing the <strong className="text-[#b4462f]">stale</strong>{" "}
          and <strong className="text-[#8a7559]">never-bid</strong> groups is where re-engagement lives.
        </p>
      </div>

      {/* ── New signups per week ── */}
      <div className="rounded-2xl bg-white border border-[#e3d6bf] p-4">
        <div className="text-sm font-bold text-[#241a12] mb-2">New signups · last 12 weeks</div>
        <AreaTrend data={d.signupTrend.map((t) => ({ label: t.label, value: t.count }))} height={130} valueFmt={(n) => String(n)} />
      </div>

      {/* ── Top spenders ── */}
      {d.topSpenders.length > 0 && (
        <div className="rounded-2xl bg-white border border-[#e3d6bf] p-4">
          <div className="text-sm font-bold text-[#241a12] mb-3">Top spenders</div>
          <div className="space-y-2">
            {d.topSpenders.map((t, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-5 text-xs font-bold text-[#b3a085] tabular-nums text-right shrink-0">{i + 1}</div>
                <div className="w-28 sm:w-40 text-sm font-semibold text-[#241a12] truncate shrink-0">{t.name}</div>
                <div className="flex-1 h-5 rounded bg-[#f1e7d5] overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#6c4d39] to-[#8a5a2b] rounded" style={{ width: `${(t.spend / spendMax) * 100}%` }} />
                </div>
                <div className="w-16 text-sm font-bold text-[#241a12] tabular-nums text-right shrink-0">{money0(t.spend)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Filter + search + sort ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors ${filter === f.key ? "bg-[#6c4d39] text-white border-[#6c4d39]" : "bg-white text-[#6f5b46] border-[#cdbda3]"}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, phone…"
            className="flex-1 min-w-[180px] bg-white border border-[#e3d6bf] rounded-xl px-3.5 py-2 text-sm text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39]/60"
          />
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-[#8a7559] font-semibold">Sort</span>
            {(["spend", "bids", "signup", "lastbid"] as SortKey[]).map((k) => (
              <button key={k} onClick={() => setSort(k)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${sort === k ? "bg-[#241a12] text-white border-[#241a12]" : "bg-white text-[#6f5b46] border-[#cdbda3]"}`}>
                {k === "spend" ? "Spend" : k === "bids" ? "Bids" : k === "signup" ? "Newest" : "Last bid"}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-[#8a7559] px-1">
          {filtered.length} bidder{filtered.length !== 1 ? "s" : ""}
          {" · "}
          <Link href="/admin/bidders" className="font-semibold text-[#6c4d39] hover:underline">manage bidders →</Link>
        </div>
      </div>

      {/* ── Bidder list ── */}
      <div className="space-y-2">
        {filtered.map((b) => (
          <div key={b.clerkUserId} className="rounded-2xl bg-white border border-[#e3d6bf] p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[#241a12] truncate">{b.name}</span>
                  <StatusTag b={b} />
                  {b.blocked && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#f7e2dc] text-[#b4462f]">Blocked</span>}
                </div>
                <div className="text-xs text-[#8a7559] mt-0.5 truncate">
                  {b.email || "no email"}{b.phone ? ` · ${b.phone}` : ""}
                </div>
                <div className="text-xs text-[#8a7559] mt-0.5">
                  Joined {dateShort(b.signupAt)} · {b.daysSinceSignup}d ago · last bid {AGO(b.daysSinceLastBid)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-extrabold text-[#241a12] tabular-nums leading-none">{money0(b.spend)}</div>
                <div className="text-xs text-[#8a7559] mt-1 tabular-nums">{b.bids} bid{b.bids !== 1 ? "s" : ""} · {b.won} won</div>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-base text-[#8a7559] bg-white border border-[#e3d6bf] rounded-2xl p-6 text-center">
            No bidders match.
          </p>
        )}
      </div>
    </div>
  );
}
