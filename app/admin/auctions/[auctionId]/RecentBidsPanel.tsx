"use client";
import { useState } from "react";
import Link from "next/link";
import { money } from "@/lib/format";
import LocalDate from "@/app/components/LocalDate";

export type RecentBid = {
  id: string;
  itemId: string;
  itemTitle: string;
  bidderName: string;
  amount: number;
  placedAtISO: string;
  isProxy: boolean;
  isTop: boolean;      // still the leading bid on that item
};

/**
 * The last 10 bids across the whole auction — the "is anything happening right now"
 * view. Live: the page already re-renders on every `auction-updated` Pusher event,
 * which fires on each bid.
 */
export default function RecentBidsPanel({ bids }: { bids: RecentBid[] }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-white border border-[#e3d6bf] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 sm:px-6 py-4 hover:bg-[#efe3d0]/50 transition-colors"
      >
        <span className="flex items-center gap-2 text-lg font-semibold text-[#241a12]">
          <span className="w-2 h-2 rounded-full bg-[#5f7a45] inline-block" />
          Recent bids
          {bids.length > 0 && <span className="text-[#8a7559] font-normal text-base">({bids.length})</span>}
        </span>
        <span className={`text-[#8a7559] transition-transform ${open ? "rotate-180" : ""}`}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
        </span>
      </button>

      {open && (
        <div className="border-t border-[#efe3d0]">
          {bids.length === 0 ? (
            <p className="px-5 sm:px-6 py-5 text-base text-[#8a7559]">No bids on this auction yet.</p>
          ) : (
            <ul className="divide-y divide-[#efe3d0]">
              {bids.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/admin/items/${b.itemId}`}
                    className="flex items-center gap-3 px-5 sm:px-6 py-3 hover:bg-[#faf5ea] transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-semibold text-[#241a12] truncate">{b.itemTitle}</div>
                      <div className="text-sm text-[#8a7559] truncate">
                        {b.bidderName}
                        {b.isProxy && <span className="text-[#6c4d39]"> · auto-bid</span>}
                        {" · "}
                        <LocalDate iso={b.placedAtISO} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-extrabold text-[#241a12] tabular-nums">{money(b.amount)}</div>
                      {b.isTop ? (
                        <div className="text-xs font-bold text-[#5f7a45]">leading</div>
                      ) : (
                        <div className="text-xs text-[#b3a085]">outbid</div>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
