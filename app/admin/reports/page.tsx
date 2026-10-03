"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import BidderReportView from "./BidderReportView";
import CashReportView from "./CashReportView";
import { AreaTrend, Donut, CHART } from "./Charts";
import {
  PageHeader, PageBody, Panel, StatCard, Segmented, Pill, Btn, Empty, Eyebrow, Progress, Initials,
} from "../ui";
import { IcoTrophy } from "@/app/components/BidIcons";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Split { label: string; net: number }
interface Bucket {
  key: string; label: string; when: string | null;
  itemsSold: number; hammer: number; premium: number; tax: number;
  credit: number; fees: number; net: number; avgItem: number;
  split: Split[];
}
interface Ower { name: string; email: string; phone: string; amountDue: number; itemCount: number }
interface Report {
  range: string;
  feePercent: number;
  taxPercent: number;
  totals: Bucket & { buyersPaid: number; chargeCount: number; cashCollected: number; cashItems: number };
  headroom: { total: number; items: number; biggest: number; avg: number };
  trendTitle: string;
  trend: { label: string; net: number }[];
  auctions: Bucket[];
  warehouses: Bucket[];
  owed: { total: number; count: number; owers: Ower[] };
}

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) => "$" + Math.round(n).toLocaleString();
const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

/** Tiny check / cross glyphs for the scope chips (no text characters as icons). */
const Tick = () => (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3 3 7-7" /></svg>
);
const Cross = () => (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
);

/**
 * What's actually counted in a given figure. Every report on this page carries one,
 * because "sales" silently means four different things depending on whether premium,
 * tax and your own comped wins are in or out — and a number you can't scope is a
 * number you can't trust.
 */
function Scope({ items }: { items: { label: string; on: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {items.map((i) => (
        <Pill key={i.label} tone={i.on ? "green" : "slate"}>
          {i.on ? <Tick /> : <Cross />} {i.label}
        </Pill>
      ))}
    </div>
  );
}

// The three inclusions that change what a money figure means.
const SCOPE_NET = [
  { label: "Premium", on: true },
  { label: "Tax", on: false },
  { label: "Your wins", on: false },
];
const SCOPE_PAID = [
  { label: "Premium", on: true },
  { label: "Tax", on: true },
  { label: "Your wins", on: false },
];

const RANGES = [
  { key: "7d", label: "Week" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "ytd", label: "Year" },
  { key: "all", label: "All" },
];

// Warehouse accent colors, assigned by position — used consistently everywhere.
const WH_COLORS = [CHART.leather, CHART.moss, CHART.amber, CHART.gold, CHART.mute];

// ── Where the money went: donut + legend with dollar amounts ──────────────────
function MoneyBar({ t }: { t: Report["totals"] }) {
  const parts = [
    { label: "In your pocket", value: t.net, color: CHART.moss },
    { label: "Sales tax (to Michigan)", value: t.tax, color: CHART.amber },
    { label: "Stripe's cut", value: t.fees, color: CHART.red },
    { label: "Bid Bucks used", value: t.credit, color: CHART.mute },
  ].filter((p) => p.value > 0.005);
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;

  return (
    <div>
      <Donut
        slices={parts}
        centerTop={money0(t.buyersPaid)}
        centerSub="buyers paid"
      />
      <div className="mt-4 space-y-2">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-base text-[#4a3a2b] flex-1 min-w-0">{p.label}</span>
            <span className="text-base font-bold text-[#241a12] tabular-nums shrink-0">{money(p.value)}</span>
            <span className="text-sm text-[#8a7559] w-11 text-right shrink-0 tabular-nums">
              {Math.round((p.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
      <p className="text-sm text-[#8a7559] mt-3 leading-snug">
        Buyers paid <strong className="text-[#4a3a2b]">{money(t.buyersPaid)}</strong> in total across{" "}
        {t.chargeCount} card charge{t.chargeCount !== 1 ? "s" : ""}. The green slice is what&apos;s
        actually yours — tax was never your money, and Stripe takes its cut before you see it.
      </p>
      {t.cashCollected > 0 && (
        <p className="text-sm text-[#2f5d3a] mt-2 leading-snug font-semibold">
          Includes {money(t.cashCollected)} collected in cash across {t.cashItems} item{t.cashItems !== 1 ? "s" : ""} —
          no Stripe fee on those. Full breakdown in the <strong>Cash</strong> tab.
        </p>
      )}
    </div>
  );
}

/**
 * A ranked earner card. For auctions we pass `href` so the whole card links to the
 * full per-auction report. For warehouses (no href) it stays an expandable inline
 * breakdown.
 */
function EarnerCard({
  rank, label, when, net, share, items, hammer, premium, fees, avgItem, splitTitle, split, color, href,
}: {
  rank: number; label: string; when?: string | null; net: number; share: number;
  items: number; hammer: number; premium: number; fees: number; avgItem: number;
  splitTitle: string; split: Split[]; color: string; href?: string;
}) {
  const [open, setOpen] = useState(false);

  const summary = (
    <>
      <div className="flex items-start gap-3">
        <span
          className="w-8 h-8 shrink-0 rounded-full grid place-items-center text-sm font-black text-white mt-0.5"
          style={{ background: color }}
        >
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[#241a12] leading-snug break-words">{label}</div>
          <div className="text-sm text-[#8a7559] mt-0.5">
            {items} item{items !== 1 ? "s" : ""}
            {when ? ` · ${shortDate(when)}` : ""}
            {avgItem > 0 ? ` · ${money0(avgItem)} avg` : ""}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display text-2xl font-black text-[#2f5d3a] tabular-nums leading-none">{money0(net)}</div>
          <div className="text-[11px] font-black text-[#8a7559] uppercase tracking-wide mt-1 inline-flex items-center gap-0.5">
            {href ? "Full report" : open ? "Hide" : "You made"}
            {href ? (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3l5 5-5 5" /></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? "rotate-180" : ""}`}><path d="M3 6l5 5 5-5" /></svg>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-[#efe3d0] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, share * 100)}%`, background: color }} />
      </div>
    </>
  );

  // Auctions: whole card links to the full breakdown page.
  if (href) {
    return (
      <Link href={href} className="block bg-white border border-[#e6dac6] rounded-2xl p-4 nb-lift-sm hover:border-[#c47b3e]/50 transition-colors">
        {summary}
      </Link>
    );
  }

  // Warehouses: expandable inline breakdown.
  return (
    <div className="bg-white border border-[#e6dac6] rounded-2xl overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left p-4 min-h-[44px] hover:bg-[#faf5ea] transition-colors">
        {summary}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-[#f0e6d6] pt-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { k: "Hammer", v: money0(hammer) },
              { k: "Premium", v: money0(premium) },
              { k: "Stripe", v: "−" + money0(fees) },
            ].map((x) => (
              <div key={x.k} className="bg-[#faf5ea] border border-[#e6dac6] rounded-xl px-3 py-2.5 text-center">
                <Eyebrow>{x.k}</Eyebrow>
                <div className="text-base font-extrabold text-[#241a12] tabular-nums mt-0.5">{x.v}</div>
              </div>
            ))}
          </div>
          {split.length > 0 && (
            <div>
              <Eyebrow className="mb-1.5">{splitTitle}</Eyebrow>
              <div className="space-y-1.5">
                {split.map((s) => (
                  <div key={s.label} className="flex items-center justify-between gap-3 text-base">
                    <span className="text-[#4a3a2b] min-w-0 truncate">{s.label}</span>
                    <span className="font-bold text-[#241a12] tabular-nums shrink-0">{money0(s.net)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [d, setD] = useState<Report | null>(null);
  const [range, setRange] = useState("90d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAllAuctions, setShowAllAuctions] = useState(false);
  const [view, setView] = useState<"sales" | "bidders" | "cash">("sales");

  const load = useCallback((rg: string) => {
    setLoading(true);
    setError(false);
    fetch(`/api/admin/reports?range=${rg}`)
      .then((r) => r.json())
      .then((j) => { if (j.totals) setD(j); else setError(true); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(range); }, [range, load]);

  const rangeChips = (
    <Segmented
      value={range}
      onChange={setRange}
      options={RANGES.map((r) => ({ value: r.key, label: r.label }))}
    />
  );

  const viewToggle = (
    <Segmented
      value={view}
      onChange={setView}
      options={[
        { value: "sales", label: "Sales" },
        { value: "bidders", label: "Bidders" },
        { value: "cash", label: "Cash" },
      ]}
    />
  );

  const header = (
    <PageHeader
      title="Reports"
      sub={view === "sales" ? "What you made, and where it went." : view === "bidders" ? "Who's bidding, who's gone quiet." : "Cash taken in person."}
      actions={viewToggle}
    />
  );

  // Bidder analytics is its own self-contained view (own data + loading state).
  if (view === "bidders") {
    return (
      <>
        {header}
        <BidderReportView />
      </>
    );
  }

  // Cash payments — its own self-contained view (own range + data).
  if (view === "cash") {
    return (
      <>
        {header}
        <CashReportView />
      </>
    );
  }

  if (loading || error || !d) {
    return (
      <>
        {header}
        <PageBody>
          {rangeChips}
          {error ? (
            <Panel>
              <Empty
                text="Couldn't load reports."
                sub="Check your connection and try again."
                action={<Btn onClick={() => load(range)} size="sm">Try again</Btn>}
              />
            </Panel>
          ) : (
            <p className="text-lg text-[#8a7559] text-center py-12">Loading…</p>
          )}
        </PageBody>
      </>
    );
  }

  const { totals, trend, trendTitle, auctions, warehouses, owed, headroom } = d;
  const topNet = Math.max(1, ...auctions.map((a) => a.net));
  const topWhNet = Math.max(1, ...warehouses.map((w) => w.net));
  const shownAuctions = showAllAuctions ? auctions : auctions.slice(0, 5);
  const best = auctions[0];
  const pocketShare = totals.buyersPaid > 0 ? totals.net / totals.buyersPaid : 0;

  return (
    <>
      {header}

      <PageBody className="pb-16">
        {rangeChips}

        {/* ── Hero: what you made ── */}
        <div className="rounded-2xl bg-[#241a12] text-[#fbf4e6] p-5 sm:p-6 shadow-[0_10px_30px_-18px_rgba(36,26,18,0.7)]">
          <Eyebrow className="!text-[#b9a688]">You made</Eyebrow>
          <div className="font-display text-5xl sm:text-6xl font-black tracking-tight mt-1 tabular-nums leading-none text-[#f0a35a]">
            {money0(totals.net)}
          </div>
          <div className="text-base text-[#d9c7ab] mt-2">
            {totals.itemsSold} item{totals.itemsSold !== 1 ? "s" : ""} sold across {auctions.length} auction
            {auctions.length !== 1 ? "s" : ""}
            {totals.avgItem > 0 ? ` · ${money0(totals.avgItem)} average` : ""}
          </div>
          <Scope items={SCOPE_NET} />
          <div className="mt-4 rounded-xl bg-white/[0.06] p-3">
            <Eyebrow className="!text-[#b9a688] mb-1 px-1">{trendTitle}</Eyebrow>
            <AreaTrend data={trend.map((t) => ({ label: t.label, value: t.net }))} dark valueFmt={money0} />
          </div>
        </div>

        {/* ── Headline numbers ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Buyers paid" value={money0(totals.buyersPaid)} sub={`${totals.chargeCount} charge${totals.chargeCount !== 1 ? "s" : ""}`} />
          <StatCard label="Items sold" value={totals.itemsSold.toLocaleString()} sub={totals.avgItem > 0 ? `${money0(totals.avgItem)} average` : "no sales yet"} />
          <StatCard label="Sales tax held" value={money0(totals.tax)} sub="passed to Michigan" tone="amber" />
          <StatCard label="Stripe's cut" value={money0(totals.fees)} sub="estimated 2.9% + 30¢" tone="red" />
        </div>

        {/* ── Best auction callout ── */}
        {best && best.net > 0 && (
          <Link href={`/admin/reports/${best.key}`} className="rounded-2xl bg-white border border-[#eed3ab] p-4 flex items-center gap-4 nb-lift-sm hover:border-[#c47b3e]/50">
            <div className="w-12 h-12 rounded-2xl bg-[#fbeed8] text-[#c47b3e] grid place-items-center shrink-0">
              <IcoTrophy className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <Eyebrow className="!text-[#a85f28]">Best auction</Eyebrow>
              <div className="font-bold text-[#241a12] leading-snug break-words">{best.label}</div>
              <div className="text-sm text-[#8a7559] mt-0.5">
                {money0(best.net)} from {best.itemsSold} item{best.itemsSold !== 1 ? "s" : ""}
              </div>
            </div>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#cdbda3] shrink-0"><path d="M6 3l5 5-5 5" /></svg>
          </Link>
        )}

        {/* ── Auctions ── */}
        <section>
          <h2 className="font-display text-lg font-black text-[#241a12] px-1">What each auction made</h2>
          <p className="text-sm text-[#8a7559] px-1">Biggest earner first. Tap one for the breakdown.</p>
          <div className="px-1 mb-3"><Scope items={SCOPE_NET} /></div>
          {auctions.length === 0 ? (
            <Panel>
              <Empty text="No sales in this period." sub="Widen the range or wait for the next auction to close." />
            </Panel>
          ) : (
            <div className="space-y-2.5">
              {shownAuctions.map((a, i) => (
                <EarnerCard
                  key={a.key}
                  rank={i + 1}
                  label={a.label}
                  when={a.when}
                  net={a.net}
                  share={a.net / topNet}
                  items={a.itemsSold}
                  hammer={a.hammer}
                  premium={a.premium}
                  fees={a.fees}
                  avgItem={a.avgItem}
                  splitTitle="By warehouse"
                  split={a.split}
                  color={CHART.leather}
                  href={`/admin/reports/${a.key}`}
                />
              ))}
              {auctions.length > 5 && (
                <Btn tone="slate" variant="outline" full onClick={() => setShowAllAuctions((v) => !v)}>
                  {showAllAuctions ? "Show less" : `Show all ${auctions.length} auctions`}
                </Btn>
              )}
            </div>
          )}
        </section>

        {/* ── Warehouses ── */}
        {warehouses.length > 0 && (
          <section>
            <h2 className="font-display text-lg font-black text-[#241a12] px-1">What each warehouse made</h2>
            <p className="text-sm text-[#8a7559] px-1">Same money, split by where the items were stored.</p>
            <div className="px-1 mb-3"><Scope items={SCOPE_NET} /></div>
            <div className="space-y-2.5">
              {warehouses.map((w, i) => (
                <EarnerCard
                  key={w.key}
                  rank={i + 1}
                  label={w.label}
                  net={w.net}
                  share={w.net / topWhNet}
                  items={w.itemsSold}
                  hammer={w.hammer}
                  premium={w.premium}
                  fees={w.fees}
                  avgItem={w.avgItem}
                  splitTitle="By auction"
                  split={w.split}
                  color={WH_COLORS[i % WH_COLORS.length]}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Money split ── */}
        <Panel title="Where the money went" sub="Everything buyers paid you, and who ended up with it.">
          <div className="p-4 sm:p-5">
            <div className="mb-4 -mt-1"><Scope items={SCOPE_PAID} /></div>
            <MoneyBar t={totals} />
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <Eyebrow>Kept per dollar paid</Eyebrow>
                <span className="text-sm font-bold tabular-nums text-[#241a12]">{Math.round(pocketShare * 100)}%</span>
              </div>
              <Progress value={pocketShare} tone="green" />
            </div>
          </div>
        </Panel>

        {/* ── Money left on the table (bid headroom) ── */}
        {headroom.items > 0 && (
          <Panel title="Money left on the table" tone="amber">
            <div className="p-4 sm:p-5">
              <p className="text-sm text-[#8a7559] mb-3">
                Winners with a max bid usually pay less than their max — the lot stops one increment over the
                runner-up. That gap is demand you had but didn&apos;t capture.
              </p>
              <div className="font-display text-3xl font-black text-[#8a4f1c] tabular-nums">{money0(headroom.total)}</div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {[
                  { k: "Lots", v: headroom.items.toLocaleString() },
                  { k: "Avg gap", v: money0(headroom.avg) },
                  { k: "Biggest", v: money0(headroom.biggest) },
                ].map((x) => (
                  <div key={x.k} className="bg-[#faf5ea] border border-[#e6dac6] rounded-xl px-3 py-2.5 text-center">
                    <Eyebrow>{x.k}</Eyebrow>
                    <div className="text-base font-extrabold text-[#241a12] tabular-nums mt-0.5">{x.v}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[#8a7559] mt-3 leading-snug">
                A big number here means lots are closing cheap — too few bidders in the room, increments too
                small, or reserves set too low.
              </p>
            </div>
          </Panel>
        )}

        {/* ── Still owed ── */}
        {owed.count > 0 && (
          <Panel
            tone="red"
            title="Still owed to you"
            sub="Cards that didn't go through. Not counted above."
            action={<Link href="/admin/winners" className="text-sm font-bold text-[#6c4d39] px-2 py-2">Collect</Link>}
          >
            <div className="px-4 sm:px-5 pt-3">
              <Scope items={SCOPE_PAID} />
              <div className="font-display text-3xl font-black text-[#a1321f] tabular-nums my-3">{money(owed.total)}</div>
            </div>
            <ul className="divide-y divide-[#f0e6d6] border-t border-[#f0e6d6]">
              {owed.owers.map((o, i) => (
                <li key={i} className="flex items-center gap-3 px-4 sm:px-5 py-3 min-h-[56px]">
                  <Initials name={o.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[#241a12] truncate">{o.name}</div>
                    <div className="text-sm text-[#8a7559] truncate">
                      {o.itemCount} item{o.itemCount !== 1 ? "s" : ""}{o.phone ? ` · ${o.phone}` : ""}
                    </div>
                  </div>
                  <span className="shrink-0 font-extrabold tabular-nums text-[#a1321f]">{money(o.amountDue)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {/* Legend for the scope chips above every report. */}
        <Panel title="What the tags on each report mean">
          <dl className="px-4 sm:px-5 py-4 text-sm text-[#4a3a2b] space-y-3">
            <div className="flex gap-2 items-start">
              <dt className="shrink-0 mt-0.5"><Pill tone="green"><Tick /> Premium</Pill></dt>
              <dd>your {d.feePercent}% buyer&apos;s premium is counted in that figure.</dd>
            </div>
            <div className="flex gap-2 items-start">
              <dt className="shrink-0 mt-0.5"><Pill tone="green"><Tick /> Tax</Pill></dt>
              <dd>
                sales tax is counted. Most reports show it crossed out on purpose: tax isn&apos;t your money,
                you just hold it for Michigan.
              </dd>
            </div>
            <div className="flex gap-2 items-start">
              <dt className="shrink-0 mt-0.5"><Pill tone="green"><Tick /> Your wins</Pill></dt>
              <dd>
                items you won yourself are counted. Every money report crosses this out — you&apos;re never
                charged, so they earned $0 and would inflate the numbers.
              </dd>
            </div>
          </dl>
        </Panel>

        <p className="text-sm text-[#8a7559] px-1 leading-snug">
          &ldquo;You made&rdquo; = winning bids + your {d.feePercent}% premium, minus Stripe&apos;s cut and any
          Bid Bucks spent. Sales tax isn&apos;t included — you collect it and pass it to Michigan.
          Stripe&apos;s fee is estimated at 2.9% + 30¢ per charge; everything else is exact.
        </p>
      </PageBody>
    </>
  );
}
