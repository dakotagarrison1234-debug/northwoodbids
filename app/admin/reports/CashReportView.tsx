"use client";
import { useEffect, useState, useCallback } from "react";
import { PageBody, Panel, StatCard, Segmented, Btn, Empty, Eyebrow, Initials, Row } from "../ui";

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
    <PageBody className="pb-16">
      <Segmented
        value={range}
        onChange={setRange}
        options={RANGES.map((r) => ({ value: r.key, label: r.label }))}
      />

      {loading || error || !d ? (
        error ? (
          <Panel>
            <Empty
              text="Couldn't load the cash report."
              sub="Check your connection and try again."
              action={<Btn size="sm" onClick={() => load(range)}>Try again</Btn>}
            />
          </Panel>
        ) : (
          <p className="text-lg text-[#8a7559] text-center py-12">Loading…</p>
        )
      ) : (
        <>
          {/* Hero */}
          <div className="rounded-2xl bg-[#241a12] text-[#fbf4e6] p-5 sm:p-6 shadow-[0_10px_30px_-18px_rgba(36,26,18,0.7)]">
            <Eyebrow className="!text-[#b9a688]">Cash collected in person</Eyebrow>
            <div className="font-display text-5xl sm:text-6xl font-black tracking-tight mt-1 tabular-nums leading-none text-[#f0a35a]">
              {money0(d.totals.collected)}
            </div>
            <div className="text-base text-[#d9c7ab] mt-2">Full amount handed over, tax included.</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Items" value={d.totals.items.toLocaleString()} sub="paid in cash" tone="green" />
            <StatCard label="Customers" value={d.totals.people.toLocaleString()} sub="paid at the counter" />
          </div>

          {d.rows.length === 0 ? (
            <Panel>
              <Empty text="No cash payments in this period." sub="Mark a balance paid in cash from Winners & payments and it lands here." />
            </Panel>
          ) : (
            <Panel title="Who paid cash" sub="Tap a name for the items.">
              <ul className="divide-y divide-[#f0e6d6]">
                {d.rows.map((g) => {
                  const isOpen = open === g.clerkUserId;
                  return (
                    <li key={g.clerkUserId}>
                      <Row
                        onClick={() => setOpen(isOpen ? null : g.clerkUserId)}
                        leading={<Initials name={g.name} />}
                        title={g.name}
                        sub={
                          <>
                            {g.items} item{g.items !== 1 ? "s" : ""}
                            {g.lastPaidAt ? ` · last ${dt(g.lastPaidAt)}` : ""}
                            {g.phone ? ` · ${g.phone}` : ""}
                          </>
                        }
                        trailing={
                          <>
                            <div className="font-display text-xl font-black text-[#2f5d3a] tabular-nums leading-none">{money0(g.collected)}</div>
                            <div className="text-[11px] font-black text-[#8a7559] uppercase tracking-wide mt-1">{isOpen ? "Hide" : "Details"}</div>
                          </>
                        }
                        className={isOpen ? "bg-[#faf5ea]" : ""}
                      />
                      {isOpen && (
                        <ul className="px-4 pb-4 pt-3 bg-[#faf5ea] border-t border-[#f0e6d6] space-y-2.5">
                          {g.lines.map((l) => (
                            <li key={l.itemId} className="flex items-start justify-between gap-3">
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
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}

          <p className="text-sm text-[#8a7559] px-1 leading-snug">
            Cash payments are counted as real revenue in the Sales report (with no Stripe fee, since nothing
            was processed). The totals here are the full amount the customer handed over — hammer + buyer&apos;s
            premium + sales tax.
          </p>
        </>
      )}
    </PageBody>
  );
}
