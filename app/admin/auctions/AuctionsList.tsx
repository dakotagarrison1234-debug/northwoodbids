"use client";
import { useState } from "react";
import Link from "next/link";
import LocalDate from "@/app/components/LocalDate";
import { statusStyle } from "@/lib/statusStyles";

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

function AuctionCard({ a }: { a: AuctionSummary }) {
  return (
    <Link
      href={`/admin/auctions/${a.id}`}
      className="block bg-white border border-[#e3d6bf] hover:border-[#b9a98c] rounded-xl p-6 transition-colors"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-xl truncate">{a.title}</h3>
            <span className={`text-sm px-2.5 py-0.5 rounded-full shrink-0 font-medium ${
              a.isScheduled ? "bg-[#6c4d39]/12 text-[#6c4d39]" : statusStyle(a.status)
            }`}>
              {a.isScheduled ? "scheduled" : a.status.toLowerCase()}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-base text-[#8a7559]">
            <span>{a.itemsCount} items</span>
            <span className="text-[#6c4d39] font-medium">${a.raised.toLocaleString()} total</span>
            {a.totalBids > 0 && <span>{a.totalBids} bids</span>}
            <span>
              <LocalDate iso={a.startAtIso} format="date" /> → <LocalDate iso={a.endAtIso} format="date" />
            </span>
          </div>
        </div>
        <span className="text-[#8a7559] hover:text-[#241a12] text-base font-semibold whitespace-nowrap shrink-0 self-end sm:self-auto">
          Manage →
        </span>
      </div>
    </Link>
  );
}

export default function AuctionsList({
  live,
  upcoming,
  closed,
}: {
  live: AuctionSummary[];
  upcoming: AuctionSummary[];
  closed: AuctionSummary[];
}) {
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  return (
    <div className="space-y-8">
      {/* ── Live (always shown) ── */}
      <section>
        <h2 className="text-base font-bold text-[#3f5226] uppercase tracking-wider mb-3">
          Live now ({live.length})
        </h2>
        {live.length === 0 ? (
          <div className="bg-white border border-[#e3d6bf] rounded-xl px-5 py-6 text-base text-[#8a7559]">
            No live auctions right now.
          </div>
        ) : (
          <div className="space-y-4">
            {live.map((a) => <AuctionCard key={a.id} a={a} />)}
          </div>
        )}
      </section>

      {/* ── Upcoming (button to reveal) ── */}
      {upcoming.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowUpcoming((v) => !v)}
            className="w-full flex items-center justify-between gap-3 bg-white border border-[#e3d6bf] hover:border-[#b9a98c] rounded-xl px-5 py-4 transition-colors"
          >
            <span className="text-base font-bold text-[#6c4d39] uppercase tracking-wider">
              Upcoming ({upcoming.length})
            </span>
            <span className={`text-[#8a7559] transition-transform ${showUpcoming ? "rotate-180" : ""}`}>
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
            </span>
          </button>
          {showUpcoming && (
            <div className="space-y-4 mt-4">
              {upcoming.map((a) => <AuctionCard key={a.id} a={a} />)}
            </div>
          )}
        </section>
      )}

      {/* ── Closed (collapsed; button to reveal) ── */}
      {closed.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="w-full flex items-center justify-between gap-3 bg-white border border-[#e3d6bf] hover:border-[#b9a98c] rounded-xl px-5 py-4 transition-colors"
          >
            <span className="text-base font-bold text-[#5a4a38] uppercase tracking-wider">
              Closed ({closed.length})
            </span>
            <span className={`text-[#8a7559] transition-transform ${showClosed ? "rotate-180" : ""}`}>
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
            </span>
          </button>
          {showClosed && (
            <div className="space-y-4 mt-4">
              {closed.map((a) => <AuctionCard key={a.id} a={a} />)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
