"use client";
import { useEffect, useMemo, useState } from "react";
import { AreaTrend } from "../../reports/Charts";
import {
  PageHeader, PageBody, Panel, StatCard, Segmented, SearchBox, Pill, Btn, BtnLink, Empty, Eyebrow, Progress, Initials, Toolbar, Disclosure,
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
type Person = { clerkUserId: string; name: string; phone: string; email: string };
type ShortList<T> = { total: number; rows: (Person & T)[] };
type Period = {
  days: number;
  kpis: {
    revenue: number; prevRevenue: number | null;
    buyers: number; prevBuyers: number | null;
    firstTimeBuyers: number; returningBuyers: number;
    signups: number; prevSignups: number | null;
    activeBidders: number; prevActiveBidders: number | null;
    bids: number; prevBids: number | null;
    lotsPaid: number;
    avgPerBuyer: number; prevAvgPerBuyer: number | null;
    winRate: number | null; lotsBidOn: number;
  };
  funnel: { joined: number; bid: number; won: number; paid: number };
  trend: { label: string; bids: number; signups: number; revenue: number }[];
  busiest: { byWeekday: { label: string; value: number }[]; topDay: string | null; topHour: string | null };
  lists: {
    topBidders: ShortList<{ spend: number; bids: number; won: number }>;
    newBuyers: ShortList<{ spend: number; lots: number }>;
    goneQuiet: ShortList<{ spend: number; daysSinceLastBid: number | null }>;
    neverBid: ShortList<{ daysSinceSignup: number }>;
    failedPayments: ShortList<{ owed: number; lots: number }> & { amount: number };
  };
};
type Data = {
  period: Period;
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

type PeriodKey = "7" | "30" | "90" | "0";
const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "0", label: "All time" },
];

/** "+12% vs prior 7 days" — words, not arrows. */
function vsPrior(cur: number, prev: number | null, days: number): string | undefined {
  if (prev == null) return undefined;
  const span = `prior ${days} days`;
  if (prev === 0) return cur === 0 ? `none in ${span} either` : `none in ${span}`;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return `same as ${span}`;
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}% vs ${span}`;
}

/** A capped list: 5 rows, "Show more" to 10, and a count of the rest. */
function Capped<T extends Person>({
  title, sub, list, render, empty,
}: { title: string; sub?: string; list: ShortList<T extends Person & infer X ? X : never> | { total: number; rows: T[] }; render: (r: T) => React.ReactNode; empty: string }) {
  const [more, setMore] = useState(false);
  const rows = (list.rows as T[]).slice(0, more ? 10 : 5);
  const rest = list.total - rows.length;
  return (
    <Panel title={title} sub={sub ?? (list.total ? `${list.total} total` : undefined)}>
      {list.total === 0 ? (
        <p className="px-4 sm:px-5 py-5 text-[15px] text-[#8a7559]">{empty}</p>
      ) : (
        <>
          <ul className="divide-y divide-[#f0e6d6]">
            {rows.map((r) => (
              <li key={r.clerkUserId}>
                <a
                  href={`/admin/bidders?q=${encodeURIComponent(r.email || r.phone || r.name)}`}
                  className="flex items-center gap-3 px-4 sm:px-5 py-3 min-h-[56px] hover:bg-[#faf5ea] transition-colors"
                >
                  <Initials name={r.name} size={34} />
                  <div className="min-w-0 flex-1">{render(r)}</div>
                </a>
              </li>
            ))}
          </ul>
          {rest > 0 && (
            <div className="px-4 sm:px-5 py-2.5 border-t border-[#f0e6d6] flex items-center justify-between gap-3">
              <span className="text-[15px] text-[#8a7559]">{rest} more</span>
              {!more && list.rows.length > 5 && <Btn size="sm" variant="ghost" onClick={() => setMore(true)}>Show more</Btn>}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function RowLine({ name, right, sub }: { name: string; right: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold text-[16px] text-[#241a12] truncate">{name}</span>
        <span className="shrink-0 font-display font-black text-[17px] text-[#241a12] tabular-nums">{right}</span>
      </div>
      {sub && <div className="text-[14px] text-[#8a7559] truncate mt-0.5">{sub}</div>}
    </>
  );
}

export default function BidderReportPage() {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("signup");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("7");
  const [metric, setMetric] = useState<"bids" | "signups" | "revenue">("bids");
  const [listOpen, setListOpen] = useState(false);
  const [shown, setShown] = useState(15);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/bidders/report?days=${period}`)
      .then((r) => r.json())
      .then((j) => { if (!live) return; if (j.summary && j.period) { setD(j); setError(false); } else setError(true); })
      .catch(() => { if (live) setError(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [period]);

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

  // Only the first load blanks the page; switching periods keeps it up (dimmed).
  if (!d) {
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
  const P = d.period;
  const k = P.kpis;
  const days = P.days;
  const span = days ? `last ${days} days` : "all time";
  const inviteMax = Math.max(1, ...d.topInviters.map((t) => t.invited));
  const codeMax = Math.max(1, ...d.topCodes.map((t) => t.count));
  const wdMax = Math.max(1, ...P.busiest.byWeekday.map((w) => w.value));
  const fpct = (n: number) => (P.funnel.joined ? Math.round((n / P.funnel.joined) * 100) : 0);
  const trendFmt = metric === "revenue" ? money0 : (n: number) => String(n);

  return (
    <>
      <PageHeader
        title="Bidder report"
        sub="How bidding and buying went, who to follow up with, and how people found you."
        back={{ href: "/admin/bidders", label: "Bidders" }}
      />
      <PageBody className="pb-20">
        <Segmented value={period} onChange={(v) => { setPeriod(v); setLoading(true); }} options={PERIODS} className="w-full sm:w-auto" />

        {/* Headline: money in the period */}
        <div className={`rounded-2xl bg-[#241a12] text-[#fbf4e6] p-5 sm:p-6 shadow-[0_10px_30px_-18px_rgba(36,26,18,0.7)] transition-opacity ${loading ? "opacity-60" : ""}`}>
          <Eyebrow className="!text-[#b9a688]">Sold · {span}</Eyebrow>
          <div className="font-display text-4xl sm:text-5xl font-black tracking-tight mt-1 tabular-nums leading-none text-[#f0a35a]">{money0(k.revenue)}</div>
          <div className="text-[15px] text-[#d9c7ab] mt-2">
            {k.buyers} buyer{k.buyers !== 1 ? "s" : ""} · {k.lotsPaid} lot{k.lotsPaid !== 1 ? "s" : ""} paid
            {vsPrior(k.revenue, k.prevRevenue, days) ? ` · ${vsPrior(k.revenue, k.prevRevenue, days)}` : ""}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="New signups" value={k.signups} tone="green" sub={vsPrior(k.signups, k.prevSignups, days) ?? "joined"} />
          <StatCard label="Bidding" value={k.activeBidders} sub={vsPrior(k.activeBidders, k.prevActiveBidders, days) ?? "people who bid"} />
          <StatCard label="Bids placed" value={k.bids.toLocaleString()} sub={vsPrior(k.bids, k.prevBids, days) ?? `on ${k.lotsBidOn} lots`} />
          <StatCard label="Buyers" value={k.buyers} tone="green" sub={`${k.firstTimeBuyers} first-time · ${k.returningBuyers} returning`} />
          <StatCard label="Per buyer" value={money0(k.avgPerBuyer)} sub={vsPrior(k.avgPerBuyer, k.prevAvgPerBuyer, days) ?? "average spent"} />
          <StatCard label="Win rate" value={k.winRate == null ? "—" : `${k.winRate}%`} sub="of finished lots bid on" />
        </div>

        {/* Trend */}
        <Panel
          title="Trend"
          sub={days === 7 || days === 30 ? "By day" : days === 90 ? "By week" : "By month, last 12"}
          action={
            <Segmented
              value={metric}
              onChange={setMetric}
              options={[{ value: "bids", label: "Bids" }, { value: "signups", label: "Signups" }, { value: "revenue", label: "Sold" }]}
            />
          }
        >
          <div className="px-4 sm:px-5 py-4">
            <AreaTrend data={P.trend.map((t) => ({ label: t.label, value: t[metric] }))} height={140} valueFmt={trendFmt} />
          </div>
        </Panel>

        {/* Busiest times + signup funnel */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Panel title="When people bid" sub={days ? span : "last 90 days"}>
            <div className="px-4 sm:px-5 py-4">
              {P.busiest.topDay ? (
                <p className="text-[15px] text-[#4a3a2b] mb-3">
                  Busiest day <span className="font-bold text-[#241a12]">{P.busiest.topDay}</span>, busiest hour{" "}
                  <span className="font-bold text-[#241a12]">{P.busiest.topHour}</span>.
                </p>
              ) : (
                <p className="text-[15px] text-[#8a7559] mb-3">No bids yet in this period.</p>
              )}
              <div className="flex items-end gap-2 h-24">
                {P.busiest.byWeekday.map((w) => (
                  <div key={w.label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <div
                      className={`w-full rounded-t-md ${w.label === P.busiest.topDay ? "bg-[#c47b3e]" : "bg-[#d9c7ab]"}`}
                      style={{ height: `${Math.max(4, (w.value / wdMax) * 100)}%` }}
                      title={`${w.value} bids`}
                    />
                    <span className="text-[13px] font-bold text-[#8a7559]">{w.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="New signups" sub={`Joined ${span} · where they got to`}>
            <div className="px-4 sm:px-5 py-4 space-y-3">
              {[
                { label: "Joined", n: P.funnel.joined, pct: 100, tone: "slate" as const },
                { label: "Placed a bid", n: P.funnel.bid, pct: fpct(P.funnel.bid), tone: "leather" as const },
                { label: "Won a lot", n: P.funnel.won, pct: fpct(P.funnel.won), tone: "amber" as const },
                { label: "Paid", n: P.funnel.paid, pct: fpct(P.funnel.paid), tone: "green" as const },
              ].map((f) => (
                <div key={f.label}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-[15px] font-bold text-[#241a12]">{f.label}</span>
                    <span className="text-[15px] font-extrabold tabular-nums text-[#241a12]">{f.n}{f.label !== "Joined" ? ` · ${f.pct}%` : ""}</span>
                  </div>
                  <Progress value={f.pct / 100} tone={f.tone} />
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Who: short, actionable lists */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Capped
            title="Top bidders"
            sub={span}
            list={P.lists.topBidders}
            empty="Nobody bid in this period."
            render={(r) => (
              <RowLine name={r.name} right={money0(r.spend)} sub={`${r.bids} bid${r.bids !== 1 ? "s" : ""} · ${r.won} won`} />
            )}
          />
          <Capped
            title="New buyers"
            sub={`First purchase ${days ? `in the ${span}` : "ever"}`}
            list={P.lists.newBuyers}
            empty="No first-time buyers in this period."
            render={(r) => <RowLine name={r.name} right={money0(r.spend)} sub={`${r.lots} lot${r.lots !== 1 ? "s" : ""} paid`} />}
          />
          <Capped
            title="Gone quiet"
            sub="Bought before, no bids in 30+ days · worth a text"
            list={P.lists.goneQuiet}
            empty="Nobody's drifted off. Nice."
            render={(r) => (
              <RowLine name={r.name} right={money0(r.spend)} sub={`spent all-time · last bid ${AGO(r.daysSinceLastBid)}${r.phone ? ` · ${r.phone}` : ""}`} />
            )}
          />
          <Capped
            title="Joined, never bid"
            sub="Signed up in the last 30 days · easy follow-up"
            list={P.lists.neverBid}
            empty="Every recent signup has bid."
            render={(r) => (
              <RowLine name={r.name} right={<span className="text-[15px] font-bold text-[#8a7559]">{AGO(r.daysSinceSignup)}</span>} sub={r.phone || r.email || "no contact"} />
            )}
          />
        </div>

        {P.lists.failedPayments.total > 0 && (
          <Capped
            title="Failed payments"
            sub={`${money0(P.lists.failedPayments.amount)} owed by ${P.lists.failedPayments.total} bidder${P.lists.failedPayments.total !== 1 ? "s" : ""}`}
            list={P.lists.failedPayments}
            empty=""
            render={(r) => <RowLine name={r.name} right={money0(r.owed)} sub={`${r.lots} lot${r.lots !== 1 ? "s" : ""}${r.phone ? ` · ${r.phone}` : ""}`} />}
          />
        )}

        {/* Where they came from (all time) */}
        <Panel title="How they found you" sub={`All ${s.totalBidders.toLocaleString()} bidders`}>
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
                  {d.topInviters.slice(0, 5).map((t, i) => (
                    <li key={i}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[15px] font-bold text-[#241a12] truncate">{t.name}</span>
                        <span className="text-[15px] font-extrabold text-[#241a12] tabular-nums shrink-0">{t.invited} brought in</span>
                      </div>
                      <Progress value={t.invited / inviteMax} tone="leather" />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {d.topCodes.length > 0 && (
              <div>
                <Eyebrow className="mb-2">Welcome codes</Eyebrow>
                <ul className="space-y-2.5">
                  {d.topCodes.slice(0, 5).map((t) => (
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

        {/* Every bidder: tucked away, 15 at a time */}
        <Disclosure label={`All bidders · ${s.totalBidders.toLocaleString()}`} open={listOpen} onToggle={setListOpen}>
        <div className="p-3 sm:p-4 space-y-3">
        {/* Filter + search + sort */}
        <div className="space-y-3">
          <Segmented
            value={filter}
            onChange={(v) => { setFilter(v); setShown(15); }}
            options={FILTERS.map((f) => ({ value: f.key, label: f.label, count: counts[f.key] }))}
            className="w-full"
          />
          <Toolbar>
            <SearchBox
              value={q} onChange={(e) => { setQ(e.target.value); setShown(15); }}
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
              {filtered.slice(0, shown).map((b) => {
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
          {filtered.length > shown && (
            <div className="px-4 py-3 border-t border-[#f0e6d6] flex items-center justify-between gap-3">
              <span className="text-[15px] text-[#8a7559]">Showing {shown} of {filtered.length}</span>
              <Btn size="sm" variant="outline" onClick={() => setShown((n) => n + 15)}>Show 15 more</Btn>
            </div>
          )}
        </Panel>
        </div>
        </Disclosure>
      </PageBody>
    </>
  );
}
