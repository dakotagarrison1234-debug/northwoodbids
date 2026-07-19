"use client";
import { useState, useEffect, useCallback } from "react";

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
  totals: Bucket & { buyersPaid: number; chargeCount: number };
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

const RANGES = [
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "ytd", label: "Year" },
  { key: "all", label: "All" },
];

// Warehouse accent colors, assigned by position — used consistently everywhere.
const WH_COLORS = ["#6c4d39", "#4a7c59", "#c47b3e", "#3f6f8f", "#8a4f1c"];

// ── Trend chart ───────────────────────────────────────────────────────────────
function TrendChart({ data }: { data: { label: string; net: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.net));
  const W = 320, H = 90, pad = 4;
  const step = data.length > 1 ? (W - pad * 2) / (data.length - 1) : 0;
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const pts = data.map((d, i) => [pad + i * step, y(d.net)] as const);
  const line = pts.map(([x, yy], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${yy.toFixed(1)}`).join(" ");
  const area = `${line} L${(pad + (data.length - 1) * step).toFixed(1)} ${H - pad} L${pad} ${H - pad} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[90px]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5f7a45" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#5f7a45" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#tg)" />
        <path d={line} fill="none" stroke="#5f7a45" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {pts.map(([x, yy], i) => (
          <circle key={i} cx={x} cy={yy} r="3" fill="#fff" stroke="#5f7a45" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="flex justify-between mt-1">
        {data.map((d) => (
          <span key={d.label} className="text-[11px] font-semibold text-[#8a7559]">{d.label}</span>
        ))}
      </div>
    </div>
  );
}

// ── Where the money went: one stacked bar, no table ───────────────────────────
function MoneyBar({ t }: { t: Report["totals"] }) {
  const parts = [
    { label: "In your pocket", value: t.net, color: "#5f7a45" },
    { label: "Sales tax (to Michigan)", value: t.tax, color: "#c47b3e" },
    { label: "Stripe's cut", value: t.fees, color: "#a32d2d" },
    { label: "Bid Bucks used", value: t.credit, color: "#8a7559" },
  ].filter((p) => p.value > 0.005);
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;

  return (
    <div>
      <div className="flex h-11 rounded-xl overflow-hidden border border-[#e3d6bf]">
        {parts.map((p) => (
          <div
            key={p.label}
            style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
            title={`${p.label} ${money(p.value)}`}
          />
        ))}
      </div>
      <div className="mt-3 space-y-2">
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
    </div>
  );
}

/** A ranked earner card — used for both auctions and warehouses. */
function EarnerCard({
  rank, label, when, net, share, items, hammer, premium, fees, avgItem, splitTitle, split, color,
}: {
  rank: number; label: string; when?: string | null; net: number; share: number;
  items: number; hammer: number; premium: number; fees: number; avgItem: number;
  splitTitle: string; split: Split[]; color: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left p-4 hover:bg-[#faf5ea] transition-colors">
        <div className="flex items-start gap-3">
          <span
            className="w-7 h-7 shrink-0 rounded-full grid place-items-center text-sm font-extrabold text-white mt-0.5"
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
            <div className="text-2xl font-extrabold text-[#5f7a45] tabular-nums leading-none">{money0(net)}</div>
            <div className="text-[11px] font-bold text-[#8a7559] uppercase tracking-wide mt-1">You made</div>
          </div>
        </div>

        {/* Relative size — instantly shows which auctions carried the month. */}
        <div className="mt-3 h-2 rounded-full bg-[#efe3d0] overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.max(2, share * 100)}%`, background: color }} />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-[#efe3d0] pt-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { k: "Hammer", v: money0(hammer) },
              { k: "Premium", v: money0(premium) },
              { k: "Stripe", v: "−" + money0(fees) },
            ].map((x) => (
              <div key={x.k} className="bg-[#faf5ea] border border-[#e3d6bf] rounded-xl px-3 py-2.5 text-center">
                <div className="text-[11px] font-bold text-[#8a7559] uppercase tracking-wide">{x.k}</div>
                <div className="text-base font-extrabold text-[#241a12] tabular-nums mt-0.5">{x.v}</div>
              </div>
            ))}
          </div>
          {split.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-[#8a7559] uppercase tracking-wide mb-1.5">{splitTitle}</div>
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
    <div className="flex gap-1.5">
      {RANGES.map((r) => (
        <button
          key={r.key}
          onClick={() => setRange(r.key)}
          className={`px-3.5 py-2 rounded-lg text-sm font-bold border transition-colors ${
            range === r.key
              ? "bg-[#6c4d39] text-white border-[#6c4d39]"
              : "bg-white text-[#6f5b46] border-[#cdbda3]"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  if (loading || error || !d) {
    return (
      <>
        <header className="border-b border-[#e3d6bf] px-5 sm:px-8 py-4 flex items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-semibold">Reports</h1>
          {rangeChips}
        </header>
        <div className="flex-1 flex items-center justify-center p-8">
          {error ? (
            <div className="text-center">
              <p className="text-lg text-[#6f5b46]">Couldn&apos;t load reports.</p>
              <button onClick={() => load(range)} className="mt-3 bg-[#6c4d39] text-white text-base font-semibold px-5 py-2.5 rounded-xl">Try again</button>
            </div>
          ) : (
            <p className="text-lg text-[#8a7559]">Loading…</p>
          )}
        </div>
      </>
    );
  }

  const { totals, trend, auctions, warehouses, owed } = d;
  const topNet = Math.max(1, ...auctions.map((a) => a.net));
  const topWhNet = Math.max(1, ...warehouses.map((w) => w.net));
  const shownAuctions = showAllAuctions ? auctions : auctions.slice(0, 5);
  const best = auctions[0];

  return (
    <>
      <header className="border-b border-[#e3d6bf] px-5 sm:px-8 py-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-semibold">Reports</h1>
        {rangeChips}
      </header>

      <div className="px-4 sm:px-8 py-5 space-y-5 max-w-2xl mx-auto w-full pb-16">

        {/* ── Hero: what you made ── */}
        <div className="rounded-3xl bg-gradient-to-br from-[#4f6639] to-[#5f7a45] text-white p-6 shadow-[0_8px_28px_rgba(79,102,57,0.25)]">
          <div className="text-sm font-bold uppercase tracking-[0.15em] text-[#d8e6c8]">You made</div>
          <div className="text-5xl sm:text-6xl font-extrabold font-display tracking-tight mt-1 tabular-nums">
            {money0(totals.net)}
          </div>
          <div className="text-base text-[#d8e6c8] mt-2">
            {totals.itemsSold} item{totals.itemsSold !== 1 ? "s" : ""} sold across {auctions.length} auction
            {auctions.length !== 1 ? "s" : ""}
            {totals.avgItem > 0 ? ` · ${money0(totals.avgItem)} average` : ""}
          </div>
          <div className="mt-5 rounded-2xl bg-white/12 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#d8e6c8] mb-1 px-1">
              Last 6 months
            </div>
            <TrendChart data={trend} />
          </div>
        </div>

        {/* ── Best auction callout ── */}
        {best && best.net > 0 && (
          <div className="rounded-2xl bg-[#f6ecda] border border-[#e3c9a3] p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#c47b3e] grid place-items-center shrink-0">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 21h8M12 17v4M17 4H7v6a5 5 0 0 0 10 0V4z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#8a5a2b]">Best auction</div>
              <div className="font-bold text-[#241a12] leading-snug break-words">{best.label}</div>
              <div className="text-sm text-[#6f5b46] mt-0.5">
                {money0(best.net)} from {best.itemsSold} item{best.itemsSold !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
        )}

        {/* ── Auctions ── */}
        <div>
          <h2 className="text-lg font-bold text-[#241a12] px-1 mb-1">What each auction made</h2>
          <p className="text-sm text-[#6f5b46] px-1 mb-3">Biggest earner first. Tap one for the breakdown.</p>
          {auctions.length === 0 ? (
            <p className="text-base text-[#8a7559] bg-white border border-[#e3d6bf] rounded-2xl p-6 text-center">
              No sales in this period.
            </p>
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
                  color="#6c4d39"
                />
              ))}
              {auctions.length > 5 && (
                <button
                  onClick={() => setShowAllAuctions((v) => !v)}
                  className="w-full py-3 rounded-xl border border-[#cdbda3] bg-white text-[#6f5b46] font-bold text-base"
                >
                  {showAllAuctions ? "Show less" : `Show all ${auctions.length} auctions`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Warehouses ── */}
        {warehouses.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-[#241a12] px-1 mb-1">What each warehouse made</h2>
            <p className="text-sm text-[#6f5b46] px-1 mb-3">Same money, split by where the items were stored.</p>
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
          </div>
        )}

        {/* ── Money split ── */}
        <div className="bg-white border border-[#e3d6bf] rounded-2xl p-5">
          <h2 className="text-lg font-bold text-[#241a12]">Where the money went</h2>
          <p className="text-sm text-[#6f5b46] mb-4">Everything buyers paid you, and who ended up with it.</p>
          <MoneyBar t={totals} />
        </div>

        {/* ── Still owed ── */}
        {owed.count > 0 && (
          <div className="bg-white border-2 border-amber-200 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-1">
              <span className="w-9 h-9 rounded-xl bg-amber-100 grid place-items-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a3701d" strokeWidth="2.2" strokeLinecap="round"><path d="M12 8v5M12 16v.5" /><circle cx="12" cy="12" r="9" /></svg>
              </span>
              <div>
                <h2 className="text-lg font-bold text-[#241a12]">Still owed to you</h2>
                <p className="text-sm text-[#6f5b46]">Cards that didn&apos;t go through. Not counted above.</p>
              </div>
            </div>
            <div className="text-3xl font-extrabold text-[#a3701d] tabular-nums my-3">{money(owed.total)}</div>
            <div className="space-y-2">
              {owed.owers.map((o, i) => (
                <div key={i} className="flex items-center justify-between gap-3 bg-[#faf5ea] border border-[#e3d6bf] rounded-xl px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#241a12] truncate">{o.name}</div>
                    <div className="text-sm text-[#8a7559] truncate">
                      {o.itemCount} item{o.itemCount !== 1 ? "s" : ""}{o.phone ? ` · ${o.phone}` : ""}
                    </div>
                  </div>
                  <div className="font-extrabold text-[#a3701d] tabular-nums shrink-0">{money(o.amountDue)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-sm text-[#8a7559] px-1 leading-snug">
          &ldquo;You made&rdquo; = winning bids + your {d.feePercent}% premium, minus Stripe&apos;s cut and any
          Bid Bucks spent. Sales tax isn&apos;t included — you collect it and pass it to Michigan.
          Stripe&apos;s fee is estimated at 2.9% + 30¢ per charge; everything else is exact.
        </p>
      </div>
    </>
  );
}
