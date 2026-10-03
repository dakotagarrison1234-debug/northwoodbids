"use client";

import { useState } from "react";
import Image from "next/image";
import StatusPill from "@/app/components/StatusPill";
import { money } from "@/lib/format";
import { SearchBox, Row, Empty } from "../../ui";

function IcoPin() {
  return <svg width="11" height="11" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="6" cy="5" r="2"/><path d="M6 1C3.79 1 2 2.79 2 5c0 3 4 7 4 7s4-4 4-7c0-2.21-1.79-4-4-4z"/></svg>;
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
        <div className="px-4 sm:px-5 py-3 border-b border-[#f0e6d6]">
          <SearchBox
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lots by title or shelf…"
          />
        </div>
      )}

      {shown.length === 0 ? (
        <Empty text={`No lots match "${search.trim()}".`} sub="Try a shorter word or the shelf code." />
      ) : (
        <ul className="divide-y divide-[#f0e6d6]">
          {shown.map((item) => (
            <li key={item.id}>
              <Row
                href={`/admin/items/${item.id}`}
                leading={
                  item.photoUrl ? (
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-[#f4ede1] ring-1 ring-[#e6dac6]">
                      <Image src={item.photoUrl} alt="" fill sizes="40px" className="object-cover" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 bg-[#f4ede1] rounded-lg ring-1 ring-[#e6dac6]" />
                  )
                }
                title={item.title}
                sub={
                  <span className="inline-flex items-center gap-2">
                    {item.storageLocation && (
                      <span className="font-mono text-[#6c4d39] inline-flex items-center gap-0.5"><IcoPin />{item.storageLocation}</span>
                    )}
                    <span>{item.bids} bid{item.bids !== 1 ? "s" : ""}</span>
                  </span>
                }
                trailing={
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="font-extrabold text-[#2f5d3a] tabular-nums">{money(item.currentBid)}</span>
                    <span className="hidden sm:inline-flex"><StatusPill status={item.status} /></span>
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
