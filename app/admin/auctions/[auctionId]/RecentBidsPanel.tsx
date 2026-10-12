"use client";
import { money } from "@/lib/format";
import LocalDate from "@/app/components/LocalDate";
import { Disclosure, Row, Initials, Pill, Empty } from "../../ui";

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
 * The last 10 bids across the whole auction — collapsed under "Activity". Live:
 * the page already re-renders on every `auction-updated` Pusher event, which
 * fires on each bid.
 */
export default function RecentBidsPanel({ bids }: { bids: RecentBid[] }) {
  return (
    <Disclosure label={bids.length > 0 ? `Activity (${bids.length})` : "Activity"}>
      {bids.length === 0 ? (
        <Empty text="No bids yet." />
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
                    <span className="font-display text-[17px] font-black text-[#241a12] tabular-nums">{money(b.amount)}</span>
                    {b.isTop ? <Pill tone="green">Leading</Pill> : <Pill tone="slate">Outbid</Pill>}
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </Disclosure>
  );
}
