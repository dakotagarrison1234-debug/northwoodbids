"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import RelistControl, { type RelistTarget, type RelistLocation } from "../RelistControl";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

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
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search unsold by title or location…"
          className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 min-h-[44px] text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400"
        />
      )}

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          No unsold items match &ldquo;{search.trim()}&rdquo;.
        </div>
      ) : (
        shown.map((g) => (
          <div key={g.auctionId ?? "none"} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900 truncate">
                {g.title} <span className="text-slate-400 font-semibold">({g.items.length})</span>
              </h2>
              {g.auctionId && (
                <Link href={`/admin/auctions/${g.auctionId}`} className="text-xs font-bold text-[#6c4d39] hover:underline shrink-0">
                  Manage auction →
                </Link>
              )}
            </div>
            <ul className="divide-y divide-slate-100">
              {g.items.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  {u.photo ? (
                    <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-white ring-1 ring-slate-200">
                      <Image src={u.photo} alt="" fill sizes="44px" className="object-contain p-0.5" />
                    </div>
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-slate-100 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 truncate">{u.title}</div>
                    <div className="text-xs text-slate-400 truncate">
                      {(u.warehouse || u.storageLocation)
                        ? `📍 ${[u.warehouse, u.storageLocation].filter(Boolean).join(" · ")}`
                        : "No location set"}
                      {u.high > 0 ? ` · high bid ${money(u.high)}` : ""}
                    </div>
                  </div>
                  <RelistControl itemId={u.id} targets={relistTargets} locations={locations} />
                  <Link href={`/admin/items/${u.id}`} className="shrink-0 text-xs font-bold text-[#6c4d39] px-1">
                    Edit
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
