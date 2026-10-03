"use client";
import { useState } from "react";
import { money } from "@/lib/format";
import { IcoLock } from "@/app/components/BidIcons";
import { Panel, Row, Initials, Eyebrow, Empty } from "../../ui";

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
  const withGap = withSpread.filter((p) => p.spread > 0).length;

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <IcoLock className="w-4 h-4 text-[#8a7559]" />
          Active max bids
          <span className="text-[#8a7559] font-bold text-sm">({proxies.length})</span>
        </span>
      }
      sub="Private to staff"
      action={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-3 min-h-[44px] pl-2 pr-1 rounded-xl hover:bg-[#f4ede1] transition-colors"
          aria-expanded={open}
        >
          {/* Spread visible even while collapsed — the number you'd actually check. */}
          {totalSpread > 0 && (
            <span className="text-right leading-none">
              <span className="block text-[10px] font-black uppercase tracking-wide text-[#8a7559]">Headroom</span>
              <span className="block font-display text-base font-black text-[#c47b3e] tabular-nums mt-0.5">{money(totalSpread)}</span>
            </span>
          )}
          <span className={`inline-flex text-[#8a7559] transition-transform ${open ? "rotate-180" : ""}`}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
          </span>
        </button>
      }
    >
      {open && (
        proxies.length === 0 ? (
          <Empty text="No active max bids right now." sub="When a bidder sets a maximum, it appears here." />
        ) : (
          <>
            {totalSpread > 0 && (
              <div className="mx-4 sm:mx-5 mt-4 rounded-xl bg-[#fbeed8] border border-[#eed3ab] px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <Eyebrow className="!text-[#8a4f1c]">Headroom on the table</Eyebrow>
                  <span className="font-display text-2xl font-black text-[#c47b3e] tabular-nums">{money(totalSpread)}</span>
                </div>
                <p className="text-sm text-[#6f5b46] mt-1 leading-snug">
                  Across {withGap} item{withGap !== 1 ? "s" : ""}, this is how far the current prices sit
                  below what the top bidders would secretly pay — biggest single gap is{" "}
                  <strong>{money(biggest)}</strong>. You capture it only if another bidder competes before close.
                </p>
              </div>
            )}

            <p className="px-4 sm:px-5 pt-4 pb-2 text-sm text-[#8a7559]">
              The hidden maximum each bidder is willing to pay. The system auto-bids up to this amount.
            </p>
            <ul className="divide-y divide-[#f0e6d6] border-t border-[#f0e6d6]">
              {withSpread.map((p) => (
                <li key={p.id}>
                  <Row
                    href={`/admin/items/${p.itemId}`}
                    leading={<Initials name={p.bidderName} size={36} />}
                    title={p.itemTitle}
                    sub={`${p.bidderName} · now ${money(p.currentBid)}`}
                    trailing={
                      <div className="flex items-center gap-4">
                        {/* Gap column — how much this one lot is under its ceiling. */}
                        {p.spread > 0 && (
                          <div className="text-right">
                            <div className="text-[10px] font-black uppercase tracking-wide text-[#8a7559]">Gap</div>
                            <div className="font-bold text-sm text-[#c47b3e] tabular-nums">+{money(p.spread)}</div>
                          </div>
                        )}
                        <div className="text-right min-w-[3.5rem]">
                          <div className="text-[10px] font-black uppercase tracking-wide text-[#8a7559]">Max</div>
                          <div className="font-bold text-sm text-[#6c4d39] tabular-nums">{money(p.maxAmount)}</div>
                        </div>
                      </div>
                    }
                  />
                </li>
              ))}
            </ul>
          </>
        )
      )}
    </Panel>
  );
}
