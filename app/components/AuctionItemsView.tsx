"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import ItemCardTimer from "@/app/components/ItemCardTimer";
import QuickBidModal from "@/app/components/QuickBidModal";
import { WoodenCrate, PineMark } from "@/app/components/Illustrations";

/**
 * A fully pre-computed, serializable view of one lot. All the branching (price
 * label, badge, CTA text, class strings) is done on the server so this client
 * component only has to lay it out — either as a grid card or a compact list row.
 */
export interface ViewItem {
  id: string;
  title: string;
  href: string;
  editHref: string;
  primaryPhoto: string | null;
  collage: string[];
  isCombo: boolean;
  packSize: number;
  condition: string; // already joined/formatted meta line
  size: string | null;
  priceLabel: string;
  priceValue: number;
  /** The current high bid in dollars (0 = no bids yet). Used for the bid filter/sort. */
  bidAmount: number;
  retailValue: number;
  bidLabel: string;
  bidClass: string; // full Tailwind class string for the grid CTA bar
  cardClass: string; // full Tailwind class string for the grid card wrapper
  badge: { text: string; cls: string } | null;
  isPremium: boolean;
  winning: boolean;
  isItemUnsold: boolean;
  isItemLive: boolean;
  itemEndAtIso: string;
}

const VIEW_KEY = "nb-auction-view";

function GridIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="1" y="1" width="6" height="6" rx="1.4" />
      <rect x="9" y="1" width="6" height="6" rx="1.4" />
      <rect x="1" y="9" width="6" height="6" rx="1.4" />
      <rect x="9" y="9" width="6" height="6" rx="1.4" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d="M2 4h12M2 8h12M2 12h12" />
    </svg>
  );
}

export default function AuctionItemsView({
  items,
  isStaff,
}: {
  items: ViewItem[];
  isStaff: boolean;
}) {
  // Grid is the default; a returning bidder keeps whichever they last chose.
  const [view, setView] = useState<"grid" | "list">("grid");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "list" || saved === "grid") setView(saved);
    } catch {}
  }, []);
  const choose = (v: "grid" | "list") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  // Quick bid: tapping the Bid bar on a live lot opens the pop-up instead of leaving
  // the page. The rest of the card still goes to the full listing.
  const [quick, setQuick] = useState<{ id: string; href: string } | null>(null);
  const openQuick = (e: React.MouseEvent, item: ViewItem) => {
    if (!item.isItemLive) return; // ended/unsold lots: let the link through to the result page
    e.preventDefault();
    e.stopPropagation();
    setQuick({ id: item.id, href: item.href });
  };

  // Bid-activity filter/sort. "featured" keeps the server order (premium first).
  const [sort, setSort] = useState<"featured" | "nobids" | "high" | "low">("featured");
  const shownItems = (() => {
    if (sort === "nobids") return items.filter((i) => i.bidAmount === 0);
    if (sort === "high") return [...items].sort((a, b) => b.bidAmount - a.bidAmount);
    if (sort === "low") return [...items].sort((a, b) => a.bidAmount - b.bidAmount); // $0 (no bids) first
    return items;
  })();

  return (
    <>
      {quick && <QuickBidModal itemId={quick.id} href={quick.href} onClose={() => setQuick(null)} />}

      {/* Toolbar: lot count + bid filter on the left, grid/list toggle on the right */}
      <div className="flex items-center justify-between gap-3 mb-4 sm:mb-5 flex-wrap rounded-2xl bg-[#fbf4e6] border border-[#e3d6bf] px-3 py-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex items-center gap-1.5 text-xs text-[#6f5b46] font-bold shrink-0 tabular-nums">
            <PineMark className="w-3.5 h-3.5" />
            {shownItems.length} lot{shownItems.length !== 1 ? "s" : ""}
          </span>
          <span aria-hidden className="h-4 w-px bg-[#e3d6bf]" />
          <label className="relative inline-flex items-center">
            <span className="sr-only">Filter lots by bids</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="appearance-none bg-white border border-[#e3d6bf] hover:border-[#cdbda3] rounded-xl pl-3 pr-8 py-1.5 text-xs font-bold text-[#6c4d39] focus:outline-none focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 transition-colors cursor-pointer"
            >
              <option value="featured">Featured first</option>
              <option value="nobids">No bids yet</option>
              <option value="high">Highest bid</option>
              <option value="low">Lowest bid</option>
            </select>
            <svg
              className="pointer-events-none absolute right-2.5 w-3.5 h-3.5 text-[#8a7559]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </label>
        </div>
        <div className="inline-flex rounded-xl border border-[#e3d6bf] bg-white overflow-hidden shrink-0 p-0.5 gap-0.5" role="group" aria-label="View">
          {(
            [
              { v: "grid", label: "Grid", Icon: GridIcon },
              { v: "list", label: "List", Icon: ListIcon },
            ] as const
          ).map(({ v, label, Icon }) => (
            <button
              key={v}
              onClick={() => choose(v)}
              aria-pressed={view === v}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-xs font-bold transition-colors ${
                view === v ? "bg-[#6c4d39] text-white shadow-sm" : "text-[#6f5b46] hover:bg-[#f1e7d5]"
              }`}
            >
              <Icon />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {shownItems.length === 0 ? (
        <div className="text-center py-14 px-6 rounded-2xl border border-dashed border-[#cdbda3] bg-[#fbf4e6]/70">
          <WoodenCrate className="nb-float w-24 h-20 mx-auto mb-3" />
          <p className="font-display text-xl font-black tracking-tight text-[#241a12]">Every lot here has a bid on it</p>
          <p className="text-sm text-[#8a7559] mt-1">Switch the filter back to see the whole floor.</p>
          <button
            onClick={() => setSort("featured")}
            className="mt-4 rounded-xl bg-[#6c4d39] hover:bg-[#563e2c] text-white text-sm font-bold px-5 py-2.5 transition-colors"
          >
            Show all lots
          </button>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3 items-stretch">
          {shownItems.map((item) => (
            <div key={item.id} className="flex flex-col h-full">
              <Link href={item.href} className={item.cardClass}>
                {/* Photo — the star; fills the frame with minimal padding */}
                <div className="relative w-full aspect-square bg-white overflow-hidden flex items-center justify-center">
                  {item.isCombo && item.collage.length > 1 ? (
                    <div className={`absolute inset-0 grid gap-0.5 ${item.collage.length === 2 ? "grid-cols-2 grid-rows-1" : "grid-cols-2 grid-rows-2"}`}>
                      {item.collage.map((url, i) => (
                        <div key={i} className={`relative bg-[#efe3d0] overflow-hidden ${item.collage.length === 3 && i === 0 ? "row-span-2" : ""}`}>
                          <Image src={url} alt="" fill sizes="(max-width:640px) 25vw, 12vw" className="object-cover" />
                        </div>
                      ))}
                    </div>
                  ) : item.primaryPhoto ? (
                    <Image
                      src={item.primaryPhoto}
                      alt={item.title}
                      fill
                      sizes="(max-width:640px) 50vw, 25vw"
                      className="object-contain p-1 group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-[#b3a085] bg-[#faf5ea] absolute inset-0 justify-center">
                      <WoodenCrate className="w-14 h-12 opacity-70" />
                      <span className="text-[11px] font-semibold">Photo coming</span>
                    </div>
                  )}
                  {item.badge && (
                    <div className={`absolute top-2 right-2 z-10 text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider shadow-sm backdrop-blur-sm ${item.badge.cls}`}>
                      {item.badge.text}
                    </div>
                  )}
                  {item.isCombo && (
                    <div className="absolute bottom-2 left-2 bg-[#241a12]/85 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm z-10">
                      {item.packSize}-Pack
                    </div>
                  )}
                  {item.size && (
                    <div className="absolute bottom-2 right-2 z-10 bg-[#efe3d0]/95 border border-[#cdbda3] text-[#241a12] text-[10px] px-1.5 py-0.5 rounded-md font-bold shadow-sm">
                      Sz {item.size}
                    </div>
                  )}
                </div>

                {/* Info — tight; timer rides next to the condition as quiet text.
                    Condition truncates first; the timer is shrink-0 so it never gets cut. */}
                <div className="flex flex-col flex-1 p-2.5">
                  <h3 className="font-semibold text-sm leading-tight line-clamp-2 text-[#241a12] group-hover:text-[#6c4d39] transition-colors break-words">
                    {item.title}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[#8a7559]">
                    <span className="capitalize truncate min-w-0">{item.condition}</span>
                    {item.isItemLive && (
                      <span className="shrink-0 flex items-center gap-1 whitespace-nowrap">
                        <span className="text-[#cdbda3]">·</span>
                        <ItemCardTimer itemId={item.id} endAt={item.itemEndAtIso} plain />
                      </span>
                    )}
                  </div>
                  <div className="mt-auto pt-2 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[9px] font-bold text-[#8a7559] uppercase tracking-wider leading-none">{item.priceLabel}</div>
                      <div className={`font-display font-black text-lg leading-tight tabular-nums truncate mt-0.5 ${item.isItemUnsold ? "text-[#8a7559]" : "text-[#6c4d39]"}`}>
                        ${item.priceValue.toLocaleString()}
                      </div>
                    </div>
                    {item.retailValue > 0 && (
                      <div className="text-right shrink-0 leading-none whitespace-nowrap">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[#8a7559]">retail </span>
                        <span className="text-[12px] font-bold text-[#8a7559] tabular-nums line-through">${item.retailValue.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  <div
                    role={item.isItemLive ? "button" : undefined}
                    onClick={(e) => openQuick(e, item)}
                    className={`${item.bidClass} mt-2`}
                  >
                    {item.bidLabel}
                  </div>
                </div>
              </Link>

              {isStaff && (
                <Link
                  href={item.editHref}
                  className="mt-1.5 flex items-center justify-center gap-1.5 rounded-xl border border-[#cdbda3] bg-white/80 hover:bg-white text-[#6c4d39] text-xs font-bold py-2 transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z" /></svg>
                  Edit listing
                </Link>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* ── List view: compact full-width rows for fast scanning. Small square
           photo, title + meta in the middle, price + CTA on the right. ── */
        <div className="flex flex-col gap-2">
          {shownItems.map((item) => (
            <div key={item.id} className="flex flex-col">
              <Link
                href={item.href}
                className={`group flex items-stretch gap-3 sm:gap-4 bg-white border rounded-2xl p-2.5 sm:p-3 transition-all ${
                  item.isPremium
                    ? "nb-premium border-2"
                    : item.winning
                    ? "border-[#6c4d39]/50 shadow-[0_0_0_1px_rgba(108,77,57,0.12)]"
                    : "border-[#e3d6bf] hover:border-[#6c4d39]/40 hover:shadow-[0_8px_24px_-12px_rgba(60,40,25,0.35)]"
                }`}
              >
                {/* Thumb — framed, self-centered, whole product shown */}
                <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 self-center rounded-xl overflow-hidden bg-white ring-1 ring-[#efe0c9] flex items-center justify-center">
                  {item.isCombo && item.collage.length > 1 ? (
                    <div className={`absolute inset-0 grid gap-px ${item.collage.length === 2 ? "grid-cols-2 grid-rows-1" : "grid-cols-2 grid-rows-2"}`}>
                      {item.collage.map((url, i) => (
                        <div key={i} className={`relative bg-[#efe3d0] overflow-hidden ${item.collage.length === 3 && i === 0 ? "row-span-2" : ""}`}>
                          <Image src={url} alt="" fill sizes="112px" className="object-cover" />
                        </div>
                      ))}
                    </div>
                  ) : item.primaryPhoto ? (
                    <Image src={item.primaryPhoto} alt={item.title} fill sizes="112px" className="object-contain p-1.5" />
                  ) : (
                    <WoodenCrate className="w-12 h-10 opacity-70" />
                  )}
                  {item.isCombo && (
                    <span className="absolute bottom-1 left-1 bg-[#241a12]/85 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold z-10">
                      {item.packSize}-Pack
                    </span>
                  )}
                </div>

                {/* Content — title/meta on top, price + CTA on a shared baseline below */}
                <div className="flex-1 min-w-0 flex flex-col justify-between gap-2 py-0.5">
                  <div className="min-w-0">
                    {(item.badge || item.isItemLive) && (
                      <div className="flex items-center gap-1.5 mb-1">
                        {item.badge && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${item.badge.cls}`}>
                            {item.badge.text}
                          </span>
                        )}
                        {item.isItemLive && (
                          <ItemCardTimer itemId={item.id} endAt={item.itemEndAtIso} inline />
                        )}
                      </div>
                    )}
                    <h3 className="font-semibold text-[15px] sm:text-base leading-snug line-clamp-2 text-[#241a12] group-hover:text-[#6c4d39] transition-colors break-words">
                      {item.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 text-[11px] sm:text-xs text-[#8a7559]">
                      {item.condition && <span className="capitalize truncate">{item.condition}</span>}
                      {item.size && (
                        <span className="shrink-0 bg-[#efe3d0] border border-[#cdbda3] text-[#241a12] rounded-md px-1.5 py-0.5">
                          Size <span className="font-extrabold">{item.size}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[9px] font-bold text-[#8a7559] uppercase tracking-wider leading-none mb-1">
                        {item.priceLabel}
                      </div>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className={`font-display font-black text-xl sm:text-2xl leading-none tabular-nums ${item.isItemUnsold ? "text-[#8a7559]" : "text-[#6c4d39]"}`}>
                          ${item.priceValue.toLocaleString()}
                        </span>
                        {item.retailValue > 0 && (
                          <span className="text-[11px] font-semibold text-[#8a7559] tabular-nums">
                            retail <span className="line-through">${item.retailValue.toLocaleString()}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      role={item.isItemLive ? "button" : undefined}
                      onClick={(e) => openQuick(e, item)}
                      className={`${item.bidClass} !w-auto shrink-0 px-4 py-2.5 self-end`}
                    >
                      {item.bidLabel}
                    </span>
                  </div>
                </div>
              </Link>

              {isStaff && (
                <Link
                  href={item.editHref}
                  className="mt-1 self-start flex items-center gap-1.5 text-[#6c4d39] text-[11px] font-bold px-2 py-1"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z" /></svg>
                  Edit listing
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
