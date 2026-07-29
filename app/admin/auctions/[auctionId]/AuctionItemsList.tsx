"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import StatusPill from "@/app/components/StatusPill";
import { money } from "@/lib/format";

function IcoPin() {
  return <svg width="11" height="11" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="5" r="2"/><path d="M6 1C3.79 1 2 2.79 2 5c0 3 4 7 4 7s4-4 4-7c0-2.21-1.79-4-4-4z"/></svg>;
}

export interface AuctionListItem {
  id: string;
  title: string;
  photoUrl: string | null;
  storageLocation: string | null;
  bids: number;
  currentBid: number;
  status: string;
}

export default function AuctionItemsList({ items }: { items: AuctionListItem[] }) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const shown = q
    ? items.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          (i.storageLocation ?? "").toLowerCase().includes(q)
      )
    : items;

  return (
    <>
      {/* An auction can hold thousands of items; a search keeps the list usable. */}
      {items.length > 10 && (
        <div className="px-4 sm:px-5 py-2.5 border-b border-[#e3d6bf]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items by title or shelf…"
            className="w-full bg-[#faf5ea] border-2 border-[#e3d6bf] rounded-xl px-4 min-h-[42px] text-base text-[#241a12] placeholder-[#a8967c] focus:outline-none focus:border-[#cdbda3]"
          />
        </div>
      )}

      {shown.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-[#8a7559]">No items match &ldquo;{search.trim()}&rdquo;.</p>
      ) : (
        <ul className="divide-y divide-[#e3d6bf]">
          {shown.map((item) => (
            <li key={item.id}>
              <Link
                href={`/admin/items/${item.id}`}
                className="flex items-center gap-3 px-4 sm:px-5 py-2.5 hover:bg-[#efe3d0]/50 transition-colors"
              >
                {item.photoUrl ? (
                  <div className="relative w-9 h-9 rounded-lg overflow-hidden shrink-0">
                    <Image src={item.photoUrl} alt="" fill sizes="36px" className="object-cover" />
                  </div>
                ) : (
                  <div className="w-9 h-9 bg-[#efe3d0] rounded-lg flex items-center justify-center text-[#8a7559] text-xs shrink-0">?</div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm text-[#241a12] truncate">{item.title}</div>
                  <div className="text-xs text-[#8a7559] truncate flex items-center gap-2">
                    {item.storageLocation && (
                      <span className="font-mono text-[#6c4d39] inline-flex items-center gap-0.5 shrink-0"><IcoPin />{item.storageLocation}</span>
                    )}
                    <span className="shrink-0">{item.bids} bid{item.bids !== 1 ? "s" : ""}</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-green-700 font-bold text-sm tabular-nums">{money(item.currentBid)}</div>
                </div>
                <div className="shrink-0"><StatusPill status={item.status} /></div>
                <svg className="w-4 h-4 text-[#b3a085] shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4l4 4-4 4" /></svg>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
