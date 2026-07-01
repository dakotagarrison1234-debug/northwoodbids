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
 * Max amounts are sensitive (never shown to bidders) — this panel is only rendered
 * for owners/admins on the manage screen. Collapsible, with the count in the header.
 */
export default function ProxyBidsPanel({ proxies }: { proxies: ActiveProxy[] }) {
  const [open, setOpen] = useState(false);

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
        <span className={`text-[#8a7559] transition-transform ${open ? "rotate-180" : ""}`}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
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
              <p className="px-5 sm:px-6 pt-4 text-sm text-[#8a7559]">
                Private to staff — the hidden maximum each bidder is willing to pay. The system auto-bids up to this amount.
              </p>
              <ul className="divide-y divide-[#efe3d0] mt-2">
                {proxies.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/admin/items/${p.itemId}`}
                      className="flex items-center gap-3 px-5 sm:px-6 py-2.5 hover:bg-[#efe3d0]/50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm text-[#241a12] truncate">{p.itemTitle}</div>
                        <div className="text-xs text-[#8a7559] truncate">{p.bidderName} · current {money(p.currentBid)}</div>
                      </div>
                      <div className="text-right shrink-0">
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
