"use client";
import { useState } from "react";
import Link from "next/link";
import { fmtMoney0 } from "../format";
import { Pill } from "../ui";

export type AuctionSummary = {
  id: string;
  title: string;
  status: string;
  isScheduled: boolean;
  itemsCount: number;
  raised: number;
  totalBids: number;
  startAtIso: string;
  endAtIso: string;
};

const CLOSED_SHOWN = 6;

/** "3 hrs", "2 days", "12 min" — how long until a moment, in the fewest words. */
function until(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hr${hrs !== 1 ? "s" : ""}`;
  return `${Math.round(hrs / 24)} days`;
}
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function AuctionCard({ a, mode }: { a: AuctionSummary; mode: "live" | "upcoming" | "closed" }) {
  const hrsLeft = (new Date(a.endAtIso).getTime() - Date.now()) / 36e5;
  // Time pressure is the whole point of a live auction, so it's colour-coded:
  // under 6 hours is red, under a day amber, otherwise green.
  const urgency = hrsLeft <= 6 ? "red" : hrsLeft <= 24 ? "amber" : "green";

  return (
    <Link
      href={`/admin/auctions/${a.id}`}
      className={`block bg-white border-2 rounded-2xl p-4 active:scale-[0.99] transition-transform ${
        mode === "live" && urgency === "red"
          ? "border-red-200"
          : mode === "live"
          ? "border-slate-200"
          : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-bold text-lg text-slate-900 leading-snug break-words min-w-0">{a.title}</h3>
        {mode === "live" ? (
          <Pill tone={urgency}>{until(a.endAtIso)} left</Pill>
        ) : mode === "upcoming" ? (
          <Pill tone="slate">{a.isScheduled ? `opens ${until(a.startAtIso)}` : "ready"}</Pill>
        ) : (
          <Pill tone="slate">{a.status.toLowerCase()}</Pill>
        )}
      </div>

      {/* Three numbers, evenly weighted — items, bids, money. */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        {[
          { k: "Items", v: String(a.itemsCount) },
          { k: "Bids", v: String(a.totalBids) },
          { k: mode === "closed" ? "Sold" : "Bid so far", v: fmtMoney0(a.raised) },
        ].map((s) => (
          <div key={s.k} className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-2 text-center">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{s.k}</div>
            <div className="text-base font-extrabold text-slate-900 tabular-nums mt-0.5">{s.v}</div>
          </div>
        ))}
      </div>

      <div className="text-sm text-slate-400 mt-2.5">
        {fmtDay(a.startAtIso)} → {fmtDay(a.endAtIso)}
      </div>
    </Link>
  );
}

/** Collapsible group header with a count. */
function GroupToggle({
  label, count, open, onClick,
}: { label: string; count: number; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 bg-white border-2 border-slate-200 rounded-2xl px-4 min-h-[56px]"
    >
      <span className="font-bold text-base text-slate-700">
        {label} <span className="text-slate-400">({count})</span>
      </span>
      <span className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
      </span>
    </button>
  );
}

export default function AuctionsList({
  live, upcoming, closed,
}: { live: AuctionSummary[]; upcoming: AuctionSummary[]; closed: AuctionSummary[] }) {
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [closedLimit, setClosedLimit] = useState(CLOSED_SHOWN);

  return (
    <div className="space-y-4">
      {/* ── Live: never collapsed, this is the working set ── */}
      <section>
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">
          Live now ({live.length})
        </h2>
        {live.length === 0 ? (
          <div className="bg-white border-2 border-slate-200 rounded-2xl px-4 py-6 text-base text-slate-500 text-center">
            Nothing live right now.
          </div>
        ) : (
          <div className="space-y-2.5">
            {live.map((a) => <AuctionCard key={a.id} a={a} mode="live" />)}
          </div>
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="space-y-2.5">
          <GroupToggle label="Upcoming" count={upcoming.length} open={showUpcoming} onClick={() => setShowUpcoming((v) => !v)} />
          {showUpcoming && upcoming.map((a) => <AuctionCard key={a.id} a={a} mode="upcoming" />)}
        </section>
      )}

      {closed.length > 0 && (
        <section className="space-y-2.5">
          <GroupToggle label="Closed" count={closed.length} open={showClosed} onClick={() => setShowClosed((v) => !v)} />
          {showClosed && (
            <>
              {/* Capped — after a year of weekly auctions this list is 50+ long and
                  rendering all of it on a phone is pointless. */}
              {closed.slice(0, closedLimit).map((a) => <AuctionCard key={a.id} a={a} mode="closed" />)}
              {closed.length > closedLimit && (
                <button
                  onClick={() => setClosedLimit((n) => n + 12)}
                  className="w-full min-h-[48px] rounded-xl border-2 border-slate-200 bg-white font-bold text-base text-slate-600"
                >
                  Show more ({closed.length - closedLimit} older)
                </button>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
