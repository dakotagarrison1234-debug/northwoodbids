"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import RelistControl, { type RelistTarget, type RelistLocation } from "../RelistControl";
import { fmtMoney0 } from "../format";
import { Disclosure, SearchBox, BtnLink, Btn, Empty, Notice } from "../ui";

function IcoPin() {
  return <svg width="13" height="13" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="6" cy="5" r="2"/><path d="M6 1C3.79 1 2 2.79 2 5c0 3 4 7 4 7s4-4 4-7c0-2.21-1.79-4-4-4z"/></svg>;
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

const SELECT =
  "min-h-[50px] bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-3 text-[17px] text-[#241a12] outline-none transition disabled:opacity-50";

/** "Relist all N into [auction] Go" — the top bar of each group. */
function RelistAll({ group, targets }: { group: UnsoldGroup; targets: RelistTarget[] }) {
  const router = useRouter();
  // Default to the soonest upcoming draft; fall back to whatever's first.
  const [dest, setDest] = useState<string>(() => (targets.find((t) => t.status === "DRAFT") ?? targets[0])?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (targets.length === 0) return null;

  const go = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/relist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromAuctionId: group.auctionId, toAuctionId: dest }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ ok: true, text: `${data.count} lot${data.count !== 1 ? "s" : ""} relisted to ${data.auctionName}.` });
        router.refresh();
      } else {
        setMsg({ ok: false, text: data.error || "Could not relist." });
      }
    } catch {
      setMsg({ ok: false, text: "Something went wrong." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 sm:px-5 py-3 border-b border-[#f0e6d6] bg-[#faf5ea] space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-[#241a12] whitespace-nowrap">Relist all {group.items.length} into</span>
        <select value={dest} onChange={(e) => setDest(e.target.value)} disabled={busy} className={`${SELECT} flex-1 min-w-[160px]`} aria-label="Auction to relist into">
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.status === "OPEN" || t.status === "CLOSING" ? "Live — " : ""}
              {t.title}
            </option>
          ))}
        </select>
        <Btn onClick={go} disabled={busy || !dest}>{busy ? "Relisting…" : "Go"}</Btn>
      </div>
      {msg && <Notice tone={msg.ok ? "green" : "red"} className="py-2">{msg.text}</Notice>}
    </div>
  );
}

export default function UnsoldList({
  groups,
  relistTargets,
  locations = [],
  total,
  focusAuctionId = null,
}: {
  groups: UnsoldGroup[];
  relistTargets: RelistTarget[];
  locations?: RelistLocation[];
  total: number;
  /** From ?auction= — that group opens and scrolls into view. */
  focusAuctionId?: string | null;
}) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const keyOf = (g: UnsoldGroup) => g.auctionId ?? "none";

  // Which groups are open: the focused one, or every group when there's just one
  // or two. Otherwise the first.
  const [open, setOpen] = useState<Set<string>>(() => {
    if (focusAuctionId && groups.some((g) => g.auctionId === focusAuctionId)) return new Set([focusAuctionId]);
    if (groups.length <= 2) return new Set(groups.map(keyOf));
    return new Set(groups.slice(0, 1).map(keyOf));
  });
  const focusRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (focusAuctionId && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focusAuctionId]);

  const matches = (u: UnsoldItem) =>
    !q ||
    u.title.toLowerCase().includes(q) ||
    (u.warehouse ?? "").toLowerCase().includes(q) ||
    (u.storageLocation ?? "").toLowerCase().includes(q);

  // Filter within each group, then drop groups left empty by the search.
  const shown = groups
    .map((g) => ({ ...g, items: g.items.filter(matches) }))
    .filter((g) => g.items.length > 0);

  const toggle = (key: string, next: boolean) =>
    setOpen((prev) => {
      const s = new Set(prev);
      if (next) s.add(key);
      else s.delete(key);
      return s;
    });

  return (
    <div className="space-y-4">
      {total > 8 && (
        <SearchBox
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search unsold by title or spot"
        />
      )}

      {shown.length === 0 ? (
        <div className="bg-white border border-[#e6dac6] rounded-2xl">
          <Empty text={`No unsold lots match "${search.trim()}".`} />
        </div>
      ) : (
        shown.map((g) => {
          const key = keyOf(g);
          const isFocus = !!focusAuctionId && g.auctionId === focusAuctionId;
          // While searching, every matching group is open.
          const isOpen = q ? true : open.has(key);
          return (
            <div key={key} ref={isFocus ? focusRef : undefined} className="scroll-mt-4">
              <Disclosure
                label={<>{g.title} <span className="text-[#8a7559]">({g.items.length})</span></>}
                open={isOpen}
                onToggle={(next) => toggle(key, next)}
              >
                <RelistAll group={g} targets={relistTargets} />
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
                        <div className="font-bold text-[#241a12] truncate">{u.title}</div>
                        <div className="text-[15px] text-[#8a7559] truncate inline-flex items-center gap-1">
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
                {g.auctionId && (
                  <div className="px-4 py-2 border-t border-[#f0e6d6]">
                    <BtnLink href={`/admin/auctions/${g.auctionId}`} variant="ghost" size="sm">Open auction</BtnLink>
                  </div>
                )}
              </Disclosure>
            </div>
          );
        })
      )}
    </div>
  );
}
