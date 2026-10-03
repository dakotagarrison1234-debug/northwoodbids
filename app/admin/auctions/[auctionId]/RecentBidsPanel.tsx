"use client";
import { useState } from "react";
import { money } from "@/lib/format";
import LocalDate from "@/app/components/LocalDate";
import { Panel, Row, Initials, Pill, Empty } from "../../ui";

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

function Chevron({ open }: { open: boolean }) {
  return (
    <span className={`inline-flex text-[#8a7559] transition-transform ${open ? "rotate-180" : ""}`}>
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
    </span>
  );
}

/**
 * The last 10 bids across the whole auction — the "is anything happening right now"
 * view. Live: the page already re-renders on every `auction-updated` Pusher event,
 * which fires on each bid.
 */
export default function RecentBidsPanel({ bids }: { bids: RecentBid[] }) {
  const [open, setOpen] = useState(true);

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#4a7c59] inline-block" />
          Recent bids
        </span>
      }
      sub={bids.length > 0 ? `Last ${bids.length} across every lot` : undefined}
      action={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl hover:bg-[#f4ede1] transition-colors"
          aria-expanded={open}
          aria-label={open ? "Hide recent bids" : "Show recent bids"}
        >
          <Chevron open={open} />
        </button>
      }
    >
      {open && (
        bids.length === 0 ? (
          <Empty text="No bids on this auction yet." sub="They show up here the moment they land." />
        ) : (
          <ul className="divide-y divide-[#f0e6d6]">
            {bids.map((b) => (
              <li key={b.id}>
                <Row
                  href={`/admin/items/${b.itemId}`}
                  leading={<Initials name={b.bidderName} size={36} />}
                  title={b.itemTitle}
                  sub={
                    <>
                      {b.bidderName}
                      {b.isProxy && <span className="text-[#6c4d39]"> · auto-bid</span>}
                      {" · "}
                      <LocalDate iso={b.placedAtISO} />
                    </>
                  }
                  trailing={
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-display text-base font-black text-[#241a12] tabular-nums">{money(b.amount)}</span>
                      {b.isTop ? <Pill tone="green">Leading</Pill> : <Pill tone="slate">Outbid</Pill>}
                    </div>
                  }
                />
              </li>
            ))}
          </ul>
        )
      )}
    </Panel>
  );
}
