"use client";
import { useEffect, useMemo, useState } from "react";
import { AreaTrend } from "../../reports/Charts";
import {
  PageHeader, PageBody, Panel, StatCard, Segmented, SearchBox, Pill, Btn, BtnLink, Empty, Eyebrow, Progress, Initials, Toolbar,
} from "../../ui";

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
  lastPaidAt: string | null;
  daysSinceLastPaid: number | null;
  source: "invite" | "code" | "direct";
  invitedBy: { clerkUserId: string; name: string; code: string; link: string; status: string } | null;
  welcomeCode: { code: string; label: string; claimedAt: string } | null;
  invited: number;
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
  viaInvite: number; viaCode: number; direct: number; signups7: number; bought30: number;
};
type Data = {
  summary: Summary;
  signupTrend: { label: string; count: number }[];
  topSpenders: { name: string; spend: number; won: number }[];
  topInviters: { name: string; invited: number }[];
  topCodes: { code: string; label: string; count: number }[];
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

type FilterKey = "all" | "new" | "bought" | "active30" | "stale" | "never" | "invited" | "code";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New 30d" },
  { key: "bought", label: "Bought" },
  { key: "active30", label: "Active 30d" },
  { key: "stale", label: "Stale" },
  { key: "never", label: "Never bid" },
  { key: "invited", label: "Invited" },
  { key: "code", label: "Welcome code" },
];

type SortKey = "signup" | "spend" | "lastbuy" | "lastbid";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "signup", label: "Newest" },
  { key: "spend", label: "Spend" },
  { key: "lastbuy", label: "Last buy" },
  { key: "lastbid", label: "Last bid" },
];

function StatusTag({ b }: { b: Bidder }) {
  if (b.neverBid) return <Pill tone="slate">Never bid</Pill>;
  if (b.active30) return <Pill tone="green" dot>Active</Pill>;
  if (b.active60) return <Pill tone="amber" dot>Cooling</Pill>;
  return <Pill tone="red">Stale</Pill>;
}

function SourceTag({ b }: { b: Bidder }) {
  if (b.invitedBy) return <Pill tone="leather">Invited by {b.invitedBy.name}</Pill>;
  if (b.welcomeCode) return <Pill tone="amber">Code {b.welcomeCode.code}</Pill>;
  return null;
}

export default function BidderReportPage() {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("signup");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
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
    else if (filter === "bought") rows = rows.filter((r) => r.spend > 0);
    else if (filter === "active30") rows = rows.filter((r) => r.active30);
    else if (filter === "stale") rows = rows.filter((r) => r.stale);
    else if (filter === "never") rows = rows.filter((r) => r.neverBid);
    else if (filter === "invited") rows = rows.filter((r) => r.source === "invite");
    else if (filter === "code") rows = rows.filter((r) => r.source === "code");

    const term = q.trim().toLowerCase();
    if (term) rows = rows.filter((r) =>
      r.name.toLowerCase().includes(term) ||
      r.email.toLowerCase().includes(term) ||
      r.phone.includes(term) ||
      (r.invitedBy?.name.toLowerCase().includes(term) ?? false) ||
      (r.welcomeCode?.code.toLowerCase().includes(term) ?? false)
    );

    const sorted = [...rows];
    if (sort === "spend") sorted.sort((a, b) => b.spend - a.spend || b.bids - a.bids);
    else if (sort === "signup") sorted.sort((a, b) => a.daysSinceSignup - b.daysSinceSignup);
    else if (sort === "lastbuy") sorted.sort((a, b) => (a.daysSinceLastPaid ?? 1e9) - (b.daysSinceLastPaid ?? 1e9));
    else if (sort === "lastbid") sorted.sort((a, b) => (a.daysSinceLastBid ?? 1e9) - (b.daysSinceLastBid ?? 1e9));
    return sorted;
  }, [d, filter, sort, q]);

  const counts = useMemo<Record<FilterKey, number>>(() => {
    const b = d?.bidders ?? [];
    return {
      all: b.length,
      new: b.filter((r) => r.isNew).length,
      bought: b.filter((r) => r.spend > 0).length,
      active30: b.filter((r) => r.active30).length,
      stale: b.filter((r) => r.stale).length,
      never: b.filter((r) => r.neverBid).length,
      invited: b.filter((r) => r.source === "invite").length,
      code: b.filter((r) => r.source === "code").length,
    };
  }, [d]);

  if (loading || error || !d) {
    return (
      <>
        <PageHeader title="Bidder report" back={{ href: "/admin/bidders", label: "Bidders" }} />
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
            <p className="text-[17px] text-[#8a7559] text-center py-12">Loading…</p>
          )}
        </PageBody>
      </>
    );
  }

  const s = d.summary;
  const spendMax = Math.max(1, ...d.topSpenders.map((t) => t.spend));
  const inviteMax = Math.max(1, ...d.topInviters.map((t) => t.invited));
  const codeMax = Math.max(1, ...d.topCodes.map((t) => t.count));
  const everBidShare = s.totalBidders > 0 ? s.everBid / s.totalBidders : 0;

  return (
    <>
      <PageHeader
        title="Bidder report"
        sub="Who signed up, when, who's buying, and how they found you."
        back={{ href: "/admin/bidders", label: "Bidders" }}
      />
      <PageBody className="pb-20">
        {/* Headline */}
        <div className="rounded-2xl bg-[#241a12] text-[#fbf4e6] p-5 sm:p-6 shadow-[0_10px_30px_-18px_rgba(36,26,18,0.7)]">
          <Eyebrow className="!text-[#b9a688]">Bidders</Eyebrow>
          <div className="font-display text-4xl sm:text-5xl font-black tracking-tight mt-1 tabular-nums leading-none text-[#f0a35a]">{s.totalBidders.toLocaleString()}</div>
          <div className="text-[15px] text-[#d9c7ab] mt-2">
            {s.signups7} joined this week · {s.newBidders} in 30 days · {s.payers} have bought · {money0(s.totalRevenue)} spent all-time
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="New this week" value={s.signups7} tone="green" sub="signed up in 7 days" />
          <StatCard label="New (30 days)" value={s.newBidders} sub="signed up in 30 days" />
          <StatCard label="Bought (30 days)" value={s.bought30} tone="green" sub="paid for a lot recently" />
          <StatCard label="Active (30d)" value={s.active30} sub="bid in last 30 days" />
          <StatCard label="Never bid" value={s.neverBid} tone="amber" sub="signed up, no bids yet" />
          <StatCard label="Stale" value={s.stale} tone="red" sub="bid before, quiet 60d+" />
        </div>

        {/* Signups */}
        <Panel title="New signups" sub="Last 12 weeks">
          <div className="px-4 sm:px-5 py-4">
            <AreaTrend data={d.signupTrend.map((t) => ({ label: t.label, value: t.count }))} height={130} valueFmt={(n) => String(n)} />
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <Eyebrow>Have placed a bid</Eyebrow>
                <span className="text-[15px] font-bold tabular-nums text-[#241a12]">{Math.round(everBidShare * 100)}%</span>
              </div>
              <Progress value={everBidShare} tone="green" />
            </div>
          </div>
        </Panel>

        {/* Where they came from */}
        <Panel title="How they found you" sub="Every bidder is one of these">
          <div className="px-4 sm:px-5 py-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Invited", v: s.viaInvite, sub: "by another bidder's link" },
                { label: "Welcome code", v: s.viaCode, sub: "QR card or poster" },
                { label: "On their own", v: s.direct, sub: "no link, no code" },
              ].map((x) => (
                <div key={x.label} className="rounded-xl bg-[#faf5ea] border border-[#eadfcb] p-3">
                  <div className="text-[13px] font-black uppercase tracking-[0.12em] text-[#8a7559]">{x.label}</div>
                  <div className="font-display text-3xl font-black text-[#241a12] tabular-nums mt-1 leading-none">{x.v}</div>
                  <div className="text-[13px] text-[#8a7559] mt-1 leading-snug">{x.sub}</div>
                </div>
              ))}
            </div>

            {d.topInviters.length > 0 && (
              <div>
                <Eyebrow className="mb-2">Best inviters</Eyebrow>
                <ul className="space-y-2.5">
                  {d.topInviters.map((t, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <Initials name={t.name} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[15px] font-bold text-[#241a12] truncate">{t.name}</span>
                          <span className="text-[15px] font-extrabold text-[#241a12] tabular-nums shrink-0">{t.invited} brought in</span>
                        </div>
                        <Progress value={t.invited / inviteMax} tone="leather" />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {d.topCodes.length > 0 && (
              <div>
                <Eyebrow className="mb-2">Welcome codes</Eyebrow>
                <ul className="space-y-2.5">
                  {d.topCodes.map((t) => (
                    <li key={t.code}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[15px] font-bold text-[#241a12] truncate">{t.label} <span className="text-[#8a7559] font-semibold">{t.code}</span></span>
                        <span className="text-[15px] font-extrabold text-[#241a12] tabular-nums shrink-0">{t.count} claimed</span>
                      </div>
                      <Progress value={t.count / codeMax} tone="amber" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Panel>

        {/* Top spenders */}
        {d.topSpenders.length > 0 && (
          <Panel title="Top spenders" sub={`${money0(s.avgSpendPerPayer)} average per buyer`}>
            <ul className="px-4 sm:px-5 py-4 space-y-3">
              {d.topSpenders.map((t, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="w-5 text-[13px] font-black text-[#a3927b] tabular-nums text-right shrink-0">{i + 1}</span>
                  <Initials name={t.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[15px] font-bold text-[#241a12] truncate">{t.name}</span>
                      <span className="text-[15px] font-extrabold text-[#241a12] tabular-nums shrink-0">{money0(t.spend)} · {t.won} won</span>
                    </div>
                    <Progress value={t.spend / spendMax} tone="leather" />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {/* Filter + search + sort */}
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
              placeholder="Name, email, phone, inviter, code"
              className="flex-1 min-w-[200px]"
            />
            <div className="flex items-center gap-2">
              <Eyebrow>Sort</Eyebrow>
              <Segmented value={sort} onChange={setSort} options={SORTS.map((k) => ({ value: k.key, label: k.label }))} />
            </div>
          </Toolbar>
        </div>

        {/* List */}
        <Panel
          title={`${filtered.length} bidder${filtered.length !== 1 ? "s" : ""}`}
          action={<BtnLink href="/admin/bidders" variant="ghost" size="sm">Manage bidders</BtnLink>}
          flush
        >
          {filtered.length === 0 ? (
            <Empty text="No bidders match." sub="Try another filter or clear the search." />
          ) : (
            <ul className="divide-y divide-[#f0e6d6]">
              {filtered.map((b) => {
                const open = openId === b.clerkUserId;
                return (
                  <li key={b.clerkUserId}>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : b.clerkUserId)}
                      className="w-full text-left flex items-start gap-3 px-4 py-3.5 min-h-[56px] hover:bg-[#faf5ea] active:bg-[#f4ede1] transition-colors"
                    >
                      <Initials name={b.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[17px] text-[#241a12] leading-tight truncate">{b.name}</span>
                          <StatusTag b={b} />
                          {b.blocked && <Pill tone="red">Blocked</Pill>}
                        </div>
                        <div className="text-[15px] text-[#8a7559] mt-0.5 leading-snug">
                          Joined {dateShort(b.signupAt)} ({AGO(b.daysSinceSignup)}) · last bought {AGO(b.daysSinceLastPaid)} · last bid {AGO(b.daysSinceLastBid)}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap mt-1.5">
                          <SourceTag b={b} />
                          {b.invited > 0 && <Pill tone="green">Brought in {b.invited}</Pill>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-display text-[19px] font-black text-[#241a12] tabular-nums leading-none">{money0(b.spend)}</div>
                        <div className="text-[13px] text-[#8a7559] mt-1 tabular-nums">{b.won} won · {b.bids} bid{b.bids !== 1 ? "s" : ""}</div>
                      </div>
                    </button>

                    {open && (
                      <div className="px-4 pb-4 pt-1 bg-[#fdfaf4] border-t border-[#f0e6d6]">
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[15px]">
                          <div className="flex justify-between gap-3"><dt className="text-[#8a7559]">Email</dt><dd className="text-[#241a12] font-semibold truncate">{b.email || "none"}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-[#8a7559]">Phone</dt><dd className="text-[#241a12] font-semibold">{b.phone || "none"}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-[#8a7559]">Signed up</dt><dd className="text-[#241a12] font-semibold">{dateShort(b.signupAt)}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-[#8a7559]">Last bought</dt><dd className="text-[#241a12] font-semibold">{b.lastPaidAt ? dateShort(b.lastPaidAt) : "never"}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-[#8a7559]">Last bid</dt><dd className="text-[#241a12] font-semibold">{b.lastBidAt ? dateShort(b.lastBidAt) : "never"}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-[#8a7559]">Lots paid for</dt><dd className="text-[#241a12] font-semibold tabular-nums">{b.paidItems}</dd></div>
                          <div className="flex justify-between gap-3 sm:col-span-2">
                            <dt className="text-[#8a7559]">How they found you</dt>
                            <dd className="text-[#241a12] font-semibold text-right">
                              {b.invitedBy
                                ? <>Invited by {b.invitedBy.name} · link <span className="font-mono">{b.invitedBy.link}</span> · {b.invitedBy.status === "EARNED" || b.invitedBy.status === "CAPPED" ? "has paid" : b.invitedBy.status === "BLOCKED" ? "blocked" : "hasn't paid yet"}</>
                                : b.welcomeCode
                                  ? <>Welcome code {b.welcomeCode.code} ({b.welcomeCode.label}) · claimed {dateShort(b.welcomeCode.claimedAt)}</>
                                  : "On their own"}
                            </dd>
                          </div>
                          {b.invited > 0 && (
                            <div className="flex justify-between gap-3 sm:col-span-2"><dt className="text-[#8a7559]">People they invited</dt><dd className="text-[#241a12] font-semibold tabular-nums">{b.invited}</dd></div>
                          )}
                        </dl>
                        <div className="mt-3">
                          <BtnLink href={`/admin/bidders?q=${encodeURIComponent(b.email || b.name)}`} variant="outline" size="sm">Open in Bidders</BtnLink>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
