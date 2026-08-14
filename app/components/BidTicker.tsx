"use client";

import Link from "next/link";

export type TickerLot = { id: string; title: string; href: string; currentBid: number };

/**
 * A thin, always-moving "live board" strip — lot names + current bids drift across
 * like a trading ticker. The list is duplicated so the CSS marquee loops seamlessly;
 * hovering pauses it. Pure motion + real auction content, no interaction required.
 */
export default function BidTicker({ lots }: { lots: TickerLot[] }) {
  if (lots.length === 0) return null;
  const doubled = [...lots, ...lots];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#241a12] shadow-[0_10px_30px_-14px_rgba(60,40,25,0.55)] ring-1 ring-black/5">
      {/* edge fades */}
      <div className="pointer-events-none absolute left-0 top-0 h-full w-12 z-10 bg-gradient-to-r from-[#241a12] to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 h-full w-12 z-10 bg-gradient-to-l from-[#241a12] to-transparent" />
      <div className="nb-ticker-track py-2.5">
        {doubled.map((l, idx) => (
          <Link
            key={`${l.id}-${idx}`}
            href={l.href}
            className="inline-flex items-center gap-2 px-5 group"
          >
            <span className="text-[#f0a35a]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="m14 4 6 6M10.5 7.5l6 6M3 21l6-6M7 11l6 6M4 17h6" />
              </svg>
            </span>
            <span className="text-[#e9ddc7] text-sm font-semibold max-w-[220px] truncate group-hover:text-white">
              {l.title}
            </span>
            <span className="text-[#f6ecda] text-sm font-black tabular-nums">
              ${l.currentBid.toLocaleString()}
            </span>
            <span className="text-[#6c4d39] px-1">•</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
