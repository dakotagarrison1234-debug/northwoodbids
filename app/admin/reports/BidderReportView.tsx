"use client";
import { useEffect, useMemo, useState } from "react";
import { AreaTrend, Donut, CHART } from "./Charts";
import {
  PageBody, Panel, StatCard, Segmented, SearchBox, Pill, Btn, BtnLink, Empty, Eyebrow, Progress, Initials, Row, Toolbar,
} from "../ui";

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
const SORTS: { key: SortKey; label: string }[] = [
  { key: "spend", label: "Spend" },
  { key: "bids", label: "Bids" },
  { key: "signup", label: "Newest" },
  { key: "lastbid", label: "Last bid" },
];

function StatusTag({ b }: { b: Bidder }) {
  if (b.neverBid) return <Pill tone="slate">Never bid</Pill>;
  if (b.active30) return <Pill tone="green" dot>Active 30d</Pill>;
  if (b.active60) return <Pill tone="amber" dot>Active 60d</Pill>;
  return <Pill tone="red">Stale</Pill>;
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

  // Counts for the filter tabs — same predicates as the filter above.
  const counts = useMemo<Record<FilterKey, number>>(() => {
    const b = d?.bidders ?? [];
    return {
      all: b.length,
      new: b.filter((r) => r.isNew).length,
      never: b.filter((r) => r.neverBid).length,
      active30: b.filter((r) => r.active30).length,
      active60: b.filter((r) => r.active60).length,
      stale: b.filter((r) => r.stale).length,
      top: b.filter((r) => r.spend > 0).length,
    };
  }, [d]);

  if (loading || error || !d) {
    return (
      <PageBody>
        {error ? (
          <Panel>
            <Empty
              text="Couldn't load the bidder report."
              sub="Check your connection and try again."
              action={<Btn size="sm" onClick={() => location.reload()}>Try again</Btn>}
            />
          </Panel>
        ) : (
          <p className="text-lg text-[#8a7559] text-center py-12">Loading…</p>
        )}
      </PageBody>
    );
  }

  const s = d.summary;
  const spendMax = Math.max(1, ...d.topSpenders.map((t) => t.spend));
  const everBidShare = s.totalBidders > 0 ? s.everBid / s.totalBidders : 0;

  // Bidder base, as mutually-exclusive segments (they sum to total bidders):
  //   Active ≤30d · Cooling 31–60d · Stale >60d · Never bid.
  const baseSlices = [
    { label: "Active (≤30d)", value: s.active30, color: CHART.moss },
    { label: "Cooling (31–60d)", value: Math.max(0, s.active60 - s.active30), color: CHART.amber },
    { label: "Stale (60d+)", value: s.stale, color: CHART.red },
    { label: "Never bid", value: s.neverBid, color: CHART.sand },
  ];

  return (
    <PageBody className="pb-20">
      {/* ── Money ── */}
      <div className="rounded-2xl bg-[#241a12] text-[#fbf4e6] p-5 sm:p-6 shadow-[0_10px_30px_-18px_rgba(36,26,18,0.7)]">
        <Eyebrow className="!text-[#b9a688]">Total customer spend</Eyebrow>
        <div className="font-display text-4xl sm:text-5xl font-black tracking-tight mt-1 tabular-nums leading-none text-[#f0a35a]">{money0(s.totalRevenue)}</div>
        <div className="text-base text-[#d9c7ab] mt-2">
          {s.payers} paying bidder{s.payers !== 1 ? "s" : ""} · {money0(s.avgSpendPerPayer)} avg each · {s.totalBids.toLocaleString()} total bids placed
        </div>
      </div>

      {/* ── Headline stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Total bidders" value={s.totalBidders.toLocaleString()} sub={`${s.everBid} have bid`} />
        <StatCard label="New (30 days)" value={s.newBidders.toLocaleString()} tone="green" sub="just signed up" />
        <StatCard label="Never bid" value={s.neverBid.toLocaleString()} tone="amber" sub="signed up, no bids" />
        <StatCard label="Active (30d)" value={s.active30.toLocaleString()} tone="green" sub="bid in last 30 days" />
        <StatCard label="Active (60d)" value={s.active60.toLocaleString()} sub="bid in last 60 days" />
        <StatCard label="Stale" value={s.stale.toLocaleString()} tone="red" sub="bid before, quiet 60d+" />
      </div>

      {/* ── Bidder base health ── */}
      <Panel title="Your bidder base" sub={`${s.everBid} of ${s.totalBidders} have ever bid`}>
        <div className="px-4 sm:px-5 py-4">
          <Donut slices={baseSlices} centerTop={s.totalBidders.toLocaleString()} centerSub="bidders" />
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <Eyebrow>Have placed a bid</Eyebrow>
              <span className="text-sm font-bold tabular-nums text-[#241a12]">{Math.round(everBidShare * 100)}%</span>
            </div>
            <Progress value={everBidShare} tone="green" />
          </div>
          <p className="text-sm text-[#8a7559] mt-3 leading-snug">
            Chasing the <strong className="text-[#a1321f]">stale</strong> and{" "}
            <strong className="text-[#6f5b46]">never-bid</strong> groups is where re-engagement lives.
          </p>
        </div>
      </Panel>

      {/* ── New signups per week ── */}
      <Panel title="New signups" sub="Last 12 weeks">
        <div className="px-4 sm:px-5 py-4">
          <AreaTrend data={d.signupTrend.map((t) => ({ label: t.label, value: t.count }))} height={130} valueFmt={(n) => String(n)} />
        </div>
      </Panel>

      {/* ── Top spenders ── */}
      {d.topSpenders.length > 0 && (
        <Panel title="Top spenders">
          <ul className="px-4 sm:px-5 py-4 space-y-3">
            {d.topSpenders.map((t, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="w-5 text-xs font-black text-[#a3927b] tabular-nums text-right shrink-0">{i + 1}</span>
                <Initials name={t.name} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-sm font-bold text-[#241a12] truncate">{t.name}</span>
                    <span className="text-sm font-extrabold text-[#241a12] tabular-nums shrink-0">{money0(t.spend)}</span>
                  </div>
                  <Progress value={t.spend / spendMax} tone="leather" />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* ── Filter + search + sort ── */}
      <div className="space-y-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ value: f.key, label: f.label, count: counts[f.key] }))}
          className="w-full"
        />
        <Toolbar>
          <SearchBox
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, phone…"
            className="flex-1 min-w-[200px]"
          />
          <div className="flex items-center gap-2">
            <Eyebrow>Sort</Eyebrow>
            <Segmented
              value={sort}
              onChange={setSort}
              options={SORTS.map((k) => ({ value: k.key, label: k.label }))}
            />
          </div>
        </Toolbar>
      </div>

      {/* ── Bidder list ── */}
      <Panel
        title={`${filtered.length} bidder${filtered.length !== 1 ? "s" : ""}`}
        action={<BtnLink href="/admin/bidders" variant="ghost" size="sm">Manage bidders</BtnLink>}
      >
        {filtered.length === 0 ? (
          <Empty text="No bidders match." sub="Try another filter or clear the search." />
        ) : (
          <ul className="divide-y divide-[#f0e6d6]">
            {filtered.map((b) => (
              <li key={b.clerkUserId}>
                <Row
                  leading={<Initials name={b.name} />}
                  title={
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="truncate min-w-0">{b.name}</span>
                      <StatusTag b={b} />
                      {b.blocked && <Pill tone="red">Blocked</Pill>}
                    </span>
                  }
                  sub={
                    <>
                      <span className="block truncate">{b.email || "no email"}{b.phone ? ` · ${b.phone}` : ""}</span>
                      <span className="block truncate">Joined {dateShort(b.signupAt)} · {b.daysSinceSignup}d ago · last bid {AGO(b.daysSinceLastBid)}</span>
                    </>
                  }
                  trailing={
                    <>
                      <div className="font-display text-lg font-black text-[#241a12] tabular-nums leading-none">{money0(b.spend)}</div>
                      <div className="text-xs text-[#8a7559] mt-1 tabular-nums">{b.bids} bid{b.bids !== 1 ? "s" : ""} · {b.won} won</div>
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageBody>
  );
}
