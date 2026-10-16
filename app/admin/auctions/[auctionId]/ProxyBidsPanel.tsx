"use client";
import { money } from "@/lib/format";
import { Disclosure, Row, Initials, Eyebrow, Empty } from "../../ui";

export type ActiveProxy = {
  id: string;
  itemId: string;
  itemTitle: string;
  currentBid: number;
  bidderName: string;
  maxAmount: number;
};

/**
 * Owner/admin only: the active Max Bids (proxy bids) on an auction's lots.
 * Headroom = sum over lots of (max − current bid). Max amounts are never shown
 * to bidders, so the page only renders this for OWNER/ADMIN.
 */
export default function ProxyBidsPanel({ proxies }: { proxies: ActiveProxy[] }) {
  // Only positive gaps count — a max sitting at the current price has no headroom.
  const withSpread = proxies
    .map((p) => ({ ...p, spread: Math.max(0, p.maxAmount - p.currentBid) }))
    .sort((a, b) => b.spread - a.spread);
  const totalSpread = withSpread.reduce((s, p) => s + p.spread, 0);

  return (
    <Disclosure
      label={
        <span className="flex items-center justify-between gap-3 w-full">
          <span>Max bids{proxies.length > 0 && <span className="text-[#8a7559] font-bold"> ({proxies.length})</span>}</span>
          {totalSpread > 0 && (
            <span className="text-[15px] font-bold text-[#c47b3e] tabular-nums whitespace-nowrap">Headroom {money(totalSpread)}</span>
          )}
        </span>
      }
    >
      {proxies.length === 0 ? (
        <Empty text="No active max bids right now." />
      ) : (
        <>
          <div className="px-4 sm:px-5 pt-4 pb-3 space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <Eyebrow>Headroom</Eyebrow>
              <span className="font-display text-2xl font-black text-[#c47b3e] tabular-nums">{money(totalSpread)}</span>
            </div>
            <p className="text-[13px] text-[#8a7559] leading-snug">What the top bidder on each lot would pay before they stop</p>
          </div>
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
                      {p.spread > 0 && (
                        <div className="text-right">
                          <div className="text-[13px] font-black uppercase tracking-wide text-[#8a7559]">Gap</div>
                          <div className="font-bold text-[15px] text-[#c47b3e] tabular-nums">+{money(p.spread)}</div>
                        </div>
                      )}
                      <div className="text-right min-w-[3.5rem]">
                        <div className="text-[13px] font-black uppercase tracking-wide text-[#8a7559]">Max</div>
                        <div className="font-bold text-[15px] text-[#6c4d39] tabular-nums">{money(p.maxAmount)}</div>
                      </div>
                    </div>
                  }
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </Disclosure>
  );
}
