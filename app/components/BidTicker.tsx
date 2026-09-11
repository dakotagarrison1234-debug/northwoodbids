"use client";

import Link from "next/link";
import { IcoGavel } from "./BidIcons";

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
    <div className="relative flex items-stretch overflow-hidden rounded-2xl bg-[#241a12] shadow-[0_10px_30px_-14px_rgba(60,40,25,0.55)] ring-1 ring-black/5">
      {/* fixed tag on the left — what this strip is */}
      <div className="relative z-20 shrink-0 flex items-center gap-2 pl-4 pr-3 bg-[#241a12] border-r border-[#f6ecda]/10">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#f0a35a] opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#f0a35a]" />
        </span>
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#f0a35a] whitespace-nowrap">
          Latest bids
        </span>
      </div>

      <div className="relative flex-1 min-w-0 overflow-hidden">
        {/* edge fades */}
        <div className="pointer-events-none absolute left-0 top-0 h-full w-8 z-10 bg-gradient-to-r from-[#241a12] to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 h-full w-12 z-10 bg-gradient-to-l from-[#241a12] to-transparent" />
        <div className="nb-ticker-track py-2.5">
          {doubled.map((l, idx) => (
            <Link
              key={`${l.id}-${idx}`}
              href={l.href}
              className="inline-flex items-center gap-2 px-4 group"
            >
              <span className="text-[#f0a35a]">
                <IcoGavel className="w-3.5 h-3.5" />
              </span>
              <span className="text-[#e9ddc7] text-sm font-semibold max-w-[220px] truncate group-hover:text-white">
                {l.title}
              </span>
              <span className="rounded-md bg-[#f6ecda]/10 px-1.5 py-0.5 text-[#f6ecda] text-xs font-black tabular-nums group-hover:bg-[#f0a35a] group-hover:text-[#241a12] transition-colors">
                ${l.currentBid.toLocaleString()}
              </span>
              <span aria-hidden className="ml-2 h-1 w-1 rounded-full bg-[#6c4d39]" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
