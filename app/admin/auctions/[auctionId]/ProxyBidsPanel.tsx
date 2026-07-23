"use client";
import { useState } from "react";
import Link from "next/link";
import { money } from "@/lib/format";

export type ActiveProxy = {
  id: string;
  itemId: string;
  itemTitle: string;
  currentBid: number;
  bidderName: string;
  maxAmount: number;
};

/**
 * Owner/admin view of the active Max Bids (proxy bids) on an auction's items.
 *
 * The headline is the LIVE SPREAD: for every item with a max bid, the gap between
 * what the top bidder is secretly willing to pay and what the item is actually at
 * right now. That total is money sitting on the table THIS auction — you only
 * capture it if a second bidder pushes the price up toward those maxes before it
 * closes. A big spread with few competing bidders is the signal to promote the lot.
 *
 * Max amounts are sensitive (never shown to bidders); this panel is owner/admin only.
 */
export default function ProxyBidsPanel({ proxies }: { proxies: ActiveProxy[] }) {
  const [open, setOpen] = useState(false);

  // Only positive gaps count — a max sitting at the current price has no headroom.
  const withSpread = proxies
    .map((p) => ({ ...p, spread: Math.max(0, p.maxAmount - p.currentBid) }))
    .sort((a, b) => b.spread - a.spread);
  const totalSpread = withSpread.reduce((s, p) => s + p.spread, 0);
  const biggest = withSpread[0]?.spread ?? 0;

  return (
    <div className="bg-white border border-[#e3d6bf] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 sm:px-6 py-4 hover:bg-[#efe3d0]/50 transition-colors"
      >
        <span className="flex items-center gap-2 text-lg font-semibold text-[#241a12]">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v4l3 2" /><circle cx="8" cy="8" r="6" /></svg>
          Active Max Bids ({proxies.length})
        </span>
        <span className="flex items-center gap-3 shrink-0">
          {/* Spread visible even while collapsed — the number you'd actually check. */}
          {totalSpread > 0 && (
            <span className="text-right leading-none">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-[#8a7559]">Headroom</span>
              <span className="block text-base font-extrabold text-[#c47b3e] tabular-nums">{money(totalSpread)}</span>
            </span>
          )}
          <span className={`text-[#8a7559] transition-transform ${open ? "rotate-180" : ""}`}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-[#efe3d0]">
          {proxies.length === 0 ? (
            <p className="px-5 sm:px-6 py-5 text-base text-[#8a7559]">
              No active max bids right now. When a bidder sets a maximum, it appears here.
            </p>
          ) : (
            <>
              {totalSpread > 0 && (
                <div className="mx-5 sm:mx-6 mt-4 rounded-xl bg-[#f6ecda] border border-[#e3c9a3] px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-bold uppercase tracking-wide text-[#8a5a2b]">
                      Headroom on the table
                    </span>
                    <span className="text-2xl font-extrabold text-[#c47b3e] tabular-nums">{money(totalSpread)}</span>
                  </div>
                  <p className="text-sm text-[#6f5b46] mt-1 leading-snug">
                    Across {withSpread.filter((p) => p.spread > 0).length} item
                    {withSpread.filter((p) => p.spread > 0).length !== 1 ? "s" : ""}, this is how far
                    the current prices sit below what the top bidders would secretly pay — biggest single
                    gap is <strong>{money(biggest)}</strong>. You capture it only if another bidder
                    competes before close.
                  </p>
                </div>
              )}

              <p className="px-5 sm:px-6 pt-4 text-sm text-[#8a7559]">
                Private to staff — the hidden maximum each bidder is willing to pay. The system auto-bids up to this amount.
              </p>
              <ul className="divide-y divide-[#efe3d0] mt-2">
                {withSpread.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/admin/items/${p.itemId}`}
                      className="flex items-center gap-3 px-5 sm:px-6 py-2.5 hover:bg-[#efe3d0]/50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm text-[#241a12] truncate">{p.itemTitle}</div>
                        <div className="text-xs text-[#8a7559] truncate">{p.bidderName} · current {money(p.currentBid)}</div>
                      </div>
                      {/* Gap column — how much this one lot is under its ceiling. */}
                      {p.spread > 0 && (
                        <div className="text-right shrink-0">
                          <div className="text-[10px] text-[#8a7559] uppercase tracking-wide">Gap</div>
                          <div className="font-bold text-sm text-[#c47b3e] tabular-nums">+{money(p.spread)}</div>
                        </div>
                      )}
                      <div className="text-right shrink-0 w-16">
                        <div className="text-[10px] text-[#8a7559] uppercase tracking-wide">Max</div>
                        <div className="font-bold text-sm text-[#6c4d39] tabular-nums">{money(p.maxAmount)}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
