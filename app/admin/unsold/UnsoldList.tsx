"use client";

import { useState } from "react";
import Image from "next/image";
import RelistControl, { type RelistTarget, type RelistLocation } from "../RelistControl";
import { fmtMoney0 } from "../format";
import { Panel, SearchBox, BtnLink, Empty } from "../ui";

function IcoPin() {
  return <svg width="11" height="11" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="6" cy="5" r="2"/><path d="M6 1C3.79 1 2 2.79 2 5c0 3 4 7 4 7s4-4 4-7c0-2.21-1.79-4-4-4z"/></svg>;
}

export interface UnsoldItem {
  id: string;
  title: string;
  high: number;
  storageLocation: string | null;
  photo: string | null;
  warehouse: string | null;
}

export interface UnsoldGroup {
  title: string;
  auctionId: string | null;
  items: UnsoldItem[];
}

export default function UnsoldList({
  groups,
  relistTargets,
  locations = [],
  total,
}: {
  groups: UnsoldGroup[];
  relistTargets: RelistTarget[];
  locations?: RelistLocation[];
  total: number;
}) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const matches = (u: UnsoldItem) =>
    !q ||
    u.title.toLowerCase().includes(q) ||
    (u.warehouse ?? "").toLowerCase().includes(q) ||
    (u.storageLocation ?? "").toLowerCase().includes(q);

  // Filter within each group, then drop groups left empty by the search.
  const shown = groups
    .map((g) => ({ ...g, items: g.items.filter(matches) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      {total > 8 && (
        <SearchBox
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search unsold by title or location…"
        />
      )}

      {shown.length === 0 ? (
        <div className="bg-white border border-[#e6dac6] rounded-2xl">
          <Empty text={`No unsold items match "${search.trim()}".`} sub="Try a shorter word or the shelf code." />
        </div>
      ) : (
        shown.map((g) => (
          <Panel
            key={g.auctionId ?? "none"}
            title={<>{g.title} <span className="text-[#8a7559] text-base">({g.items.length})</span></>}
            action={g.auctionId ? <BtnLink href={`/admin/auctions/${g.auctionId}`} variant="ghost" size="sm">Manage auction</BtnLink> : undefined}
          >
            <ul className="divide-y divide-[#f0e6d6]">
              {g.items.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 min-h-[56px]">
                  {u.photo ? (
                    <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-white ring-1 ring-[#e6dac6]">
                      <Image src={u.photo} alt="" fill sizes="44px" className="object-contain p-0.5" />
                    </div>
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-[#f4ede1] ring-1 ring-[#e6dac6] shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-[#241a12] truncate">{u.title}</div>
                    <div className="text-xs text-[#8a7559] truncate inline-flex items-center gap-1">
                      {(u.warehouse || u.storageLocation) ? (
                        <><IcoPin /> {[u.warehouse, u.storageLocation].filter(Boolean).join(" · ")}</>
                      ) : (
                        "No location set"
                      )}
                      {u.high > 0 ? ` · high bid ${fmtMoney0(u.high)}` : ""}
                    </div>
                  </div>
                  <RelistControl itemId={u.id} targets={relistTargets} locations={locations} />
                  <BtnLink href={`/admin/items/${u.id}`} variant="ghost" size="sm">Edit</BtnLink>
                </li>
              ))}
            </ul>
          </Panel>
        ))
      )}
    </div>
  );
}
