"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import ItemCardTimer from "@/app/components/ItemCardTimer";

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

  return (
    <>
      {/* View toggle */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <span className="text-xs text-[#8a7559] font-medium">
          {items.length} item{items.length !== 1 ? "s" : ""}
        </span>
        <div className="inline-flex rounded-xl border border-[#cdbda3] bg-white overflow-hidden shrink-0" role="group" aria-label="View">
          {(
            [
              { v: "grid", label: "Grid", Icon: GridIcon },
              { v: "list", label: "List", Icon: ListIcon },
            ] as const
          ).map(({ v, label, Icon }, i) => (
            <button
              key={v}
              onClick={() => choose(v)}
              aria-pressed={view === v}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold transition-colors ${
                i === 1 ? "border-l border-[#e3d6bf]" : ""
              } ${view === v ? "bg-[#6c4d39] text-white" : "text-[#6f5b46] hover:bg-[#efe3d0]"}`}
            >
              <Icon />
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col h-full">
              <Link href={item.href} className={item.cardClass}>
                {/* Photo */}
                <div className="w-full aspect-square bg-white flex items-center justify-center text-[#8a7559] overflow-hidden relative">
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
                      className="object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-[#b3a085]">
                      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <circle cx="8.5" cy="8.5" r="2" />
                        <path d="m21 15-5-5L5 21" />
                      </svg>
                      <span className="text-xs">No photo</span>
                    </div>
                  )}
                  {item.isItemLive && <ItemCardTimer itemId={item.id} endAt={item.itemEndAtIso} />}
                  {item.badge && (
                    <div className={`absolute top-2.5 right-2.5 z-10 text-[11px] px-2.5 py-1 rounded-full font-bold shadow-sm backdrop-blur-sm ${item.badge.cls}`}>
                      {item.badge.text}
                    </div>
                  )}
                  {item.isCombo && (
                    <div className="absolute bottom-2.5 left-2.5 bg-[#241a12]/85 text-white text-[11px] px-2.5 py-1 rounded-full font-bold shadow-sm z-10">
                      {item.packSize}-Pack
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex flex-col flex-1 p-3">
                  <h3 className="font-bold text-sm leading-snug group-hover:text-[#6c4d39] transition-colors line-clamp-2 min-h-[2.5rem] break-words">
                    {item.title}
                  </h3>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className="text-[11px] text-[#8a7559] capitalize truncate">{item.condition}</span>
                    {item.size && (
                      <span className="shrink-0 max-w-[60%] truncate text-[11px] bg-[#efe3d0] border border-[#cdbda3] text-[#241a12] rounded-md px-1.5 py-0.5">
                        Size <span className="font-extrabold">{item.size}</span>
                      </span>
                    )}
                  </div>
                  <div className="mt-auto pt-2.5">
                    <div className="flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] text-[#8a7559] uppercase tracking-wide leading-none">{item.priceLabel}</div>
                        <div className={`font-extrabold text-lg leading-tight tabular-nums truncate ${item.isItemUnsold ? "text-[#8a7559]" : "text-[#6c4d39]"}`}>
                          ${item.priceValue.toLocaleString()}
                        </div>
                      </div>
                      {item.retailValue > 0 && (
                        <div className="text-right shrink-0">
                          <div className="text-[10px] text-[#8a7559] uppercase tracking-wide leading-none">Retail</div>
                          <div className="text-[13px] font-bold text-[#a32d2d] leading-tight tabular-nums">
                            ${item.retailValue.toLocaleString()}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className={`${item.bidClass} mt-2.5`}>{item.bidLabel}</div>
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
          {items.map((item) => (
            <div key={item.id} className="flex flex-col">
              <Link
                href={item.href}
                className={`group flex items-center gap-3 bg-white border rounded-xl overflow-hidden transition-all pr-3 ${
                  item.isPremium
                    ? "nb-premium border-2"
                    : item.winning
                    ? "border-[#6c4d39]/50"
                    : "border-[#e3d6bf] hover:border-[#6c4d39]/40 hover:shadow-[0_0_18px_rgba(108,77,57,0.06)]"
                }`}
              >
                {/* Thumb */}
                <div className="relative w-20 h-20 sm:w-[88px] sm:h-[88px] shrink-0 bg-white flex items-center justify-center overflow-hidden">
                  {item.isCombo && item.collage.length > 1 ? (
                    <div className={`absolute inset-0 grid gap-px ${item.collage.length === 2 ? "grid-cols-2 grid-rows-1" : "grid-cols-2 grid-rows-2"}`}>
                      {item.collage.map((url, i) => (
                        <div key={i} className={`relative bg-[#efe3d0] overflow-hidden ${item.collage.length === 3 && i === 0 ? "row-span-2" : ""}`}>
                          <Image src={url} alt="" fill sizes="88px" className="object-cover" />
                        </div>
                      ))}
                    </div>
                  ) : item.primaryPhoto ? (
                    <Image src={item.primaryPhoto} alt={item.title} fill sizes="88px" className="object-contain p-1" />
                  ) : (
                    <svg className="w-7 h-7 text-[#b3a085]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <circle cx="8.5" cy="8.5" r="2" />
                      <path d="m21 15-5-5L5 21" />
                    </svg>
                  )}
                  {item.isCombo && (
                    <span className="absolute bottom-1 left-1 bg-[#241a12]/85 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold z-10">
                      {item.packSize}-Pack
                    </span>
                  )}
                </div>

                {/* Middle: title + meta */}
                <div className="min-w-0 flex-1 py-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm leading-snug line-clamp-1 group-hover:text-[#6c4d39] transition-colors break-words">
                      {item.title}
                    </h3>
                    {item.badge && (
                      <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold ${item.badge.cls}`}>
                        {item.badge.text}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#8a7559]">
                    {item.condition && <span className="capitalize truncate">{item.condition}</span>}
                    {item.size && (
                      <span className="shrink-0 bg-[#efe3d0] border border-[#cdbda3] text-[#241a12] rounded px-1.5 py-0.5">
                        Size <span className="font-extrabold">{item.size}</span>
                      </span>
                    )}
                    {item.isItemLive && (
                      <span className="shrink-0">
                        <ItemCardTimer itemId={item.id} endAt={item.itemEndAtIso} inline />
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: price + CTA */}
                <div className="shrink-0 text-right py-2 flex flex-col items-end gap-1.5">
                  <div>
                    <div className="text-[9px] text-[#8a7559] uppercase tracking-wide leading-none">{item.priceLabel}</div>
                    <div className="flex items-baseline gap-1.5 justify-end">
                      <span className={`font-extrabold text-base leading-tight tabular-nums ${item.isItemUnsold ? "text-[#8a7559]" : "text-[#6c4d39]"}`}>
                        ${item.priceValue.toLocaleString()}
                      </span>
                      {item.retailValue > 0 && (
                        <span className="text-[11px] font-bold text-[#a32d2d] tabular-nums">
                          retail ${item.retailValue.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`${item.bidClass} !w-auto px-3`}>{item.bidLabel}</span>
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
