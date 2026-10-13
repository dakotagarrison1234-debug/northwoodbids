"use client";
import { useState, useEffect } from "react";
import { fmtMoney0 } from "../format";
import { AreaTrend } from "./Charts";
import { PageHeader, PageBody, Panel, StatCard, Segmented, Btn, Empty, Eyebrow, Progress, Row } from "../ui";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Bucket {
  key: string; label: string; when: string | null;
  itemsSold: number; net: number; avgItem: number;
}
interface Report {
  range: string;
  totals: Bucket & { buyersPaid: number; chargeCount: number; tax: number; cashCollected: number; shipping?: number };
  trendTitle: string;
  trend: { label: string; net: number }[];
  auctions: Bucket[];
  warehouses: Bucket[];
}

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

const RANGES = [
  { key: "7d", label: "Week" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "ytd", label: "Year" },
  { key: "all", label: "All" },
];

const SHOW_FIRST = 8;

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [d, setD] = useState<Report | null>(null);
  const [range, setRange] = useState("90d");
  // The range that last failed to load (so switching range clears the error).
  const [failedRange, setFailedRange] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [showAllAuctions, setShowAllAuctions] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/reports?range=${range}`)
      .then((r) => r.json())
      .then((j) => { if (!alive) return; if (j.totals) setD(j); else setFailedRange(range); })
      .catch(() => { if (alive) setFailedRange(range); });
    return () => { alive = false; };
  }, [range, attempt]);

  const error = failedRange === range;
  // The API echoes the range it answered for, so "loaded" is derived, not tracked.
  const loading = !error && (!d || d.range !== range);
  const retry = () => { setFailedRange(null); setAttempt((n) => n + 1); };

  const rangeChips = (
    <Segmented
      value={range}
      onChange={setRange}
      options={RANGES.map((r) => ({ value: r.key, label: r.label }))}
    />
  );

  if (loading || error || !d) {
    return (
      <>
        <PageHeader title="Reports" />
        <PageBody>
          {rangeChips}
          {error ? (
            <Panel>
              <Empty text="Couldn't load reports." action={<Btn onClick={retry} size="sm">Try again</Btn>} />
            </Panel>
          ) : (
            <p className="text-lg text-[#8a7559] text-center py-12">Loading…</p>
          )}
        </PageBody>
      </>
    );
  }

  const { totals, trend, trendTitle, auctions, warehouses } = d;
  const topWhNet = Math.max(1, ...warehouses.map((w) => w.net));
  const shownAuctions = showAllAuctions ? auctions : auctions.slice(0, SHOW_FIRST);

  return (
    <>
      <PageHeader title="Reports" />

      <PageBody className="pb-16">
        {rangeChips}

        {/* Hero: what you made */}
        <div className="rounded-2xl bg-[#241a12] text-[#fbf4e6] p-5 sm:p-6 shadow-[0_10px_30px_-18px_rgba(36,26,18,0.7)]">
          <Eyebrow className="!text-[#b9a688]">You made</Eyebrow>
          <div className="font-display text-5xl sm:text-6xl font-black tracking-tight mt-1 tabular-nums leading-none text-[#f0a35a]">
            {fmtMoney0(totals.net)}
          </div>
          <div className="text-[#d9c7ab] mt-2">
            {totals.itemsSold} lot{totals.itemsSold !== 1 ? "s" : ""} sold · {auctions.length} auction{auctions.length !== 1 ? "s" : ""}
            {totals.avgItem > 0 ? ` · ${fmtMoney0(totals.avgItem)} average` : ""}
          </div>
          <div className="mt-4 rounded-xl bg-white/[0.06] p-3">
            <Eyebrow className="!text-[#b9a688] mb-1 px-1">{trendTitle}</Eyebrow>
            <AreaTrend data={trend.map((t) => ({ label: t.label, value: t.net }))} dark valueFmt={fmtMoney0} />
          </div>
        </div>

        {/* Headline numbers */}
        <div className={`grid gap-3 ${(totals.shipping ?? 0) > 0 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
          <StatCard label="Buyers paid" value={fmtMoney0(totals.buyersPaid)} />
          <StatCard label="Sales tax held" value={fmtMoney0(totals.tax)} tone="amber" />
          <StatCard label="Cash taken" value={fmtMoney0(totals.cashCollected)} tone="green" />
          {(totals.shipping ?? 0) > 0 && (
            <StatCard label="Shipping collected" value={fmtMoney0(totals.shipping ?? 0)} />
          )}
        </div>

        {/* By auction */}
        <Panel title="By auction">
          {auctions.length === 0 ? (
            <Empty text="No sales in this period." />
          ) : (
            <>
              <ul className="divide-y divide-[#f0e6d6]">
                {shownAuctions.map((a, i) => (
                  <li key={a.key}>
                    <Row
                      href={`/admin/reports/${a.key}`}
                      leading={
                        <span className="w-9 h-9 rounded-full grid place-items-center bg-[#f4ede1] text-[15px] font-black tabular-nums text-[#6f5b46]">
                          {i + 1}
                        </span>
                      }
                      title={a.label}
                      sub={`${a.itemsSold} lot${a.itemsSold !== 1 ? "s" : ""}${a.when ? ` · ${shortDate(a.when)}` : ""}`}
                      trailing={<span className="font-display text-2xl font-black text-[#2f5d3a] tabular-nums">{fmtMoney0(a.net)}</span>}
                    />
                  </li>
                ))}
              </ul>
              {auctions.length > SHOW_FIRST && (
                <div className="px-4 py-3 border-t border-[#f0e6d6]">
                  <Btn tone="slate" variant="outline" size="sm" full onClick={() => setShowAllAuctions((v) => !v)}>
                    {showAllAuctions ? "Show less" : `Show all ${auctions.length}`}
                  </Btn>
                </div>
              )}
            </>
          )}
        </Panel>

        {/* By warehouse */}
        {warehouses.length > 0 && (
          <Panel title="By warehouse">
            <ul className="px-4 sm:px-5 py-4 space-y-3">
              {warehouses.map((w) => (
                <li key={w.key}>
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <span className="font-bold text-[#241a12] min-w-0 truncate">{w.label}</span>
                    <span className="font-extrabold text-[#241a12] tabular-nums shrink-0">{fmtMoney0(w.net)}</span>
                  </div>
                  <Progress value={w.net / topWhNet} tone="leather" />
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </PageBody>
    </>
  );
}
