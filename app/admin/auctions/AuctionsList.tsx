"use client";
import { useState } from "react";
import Link from "next/link";
import { fmtMoney0 } from "../format";
import { Pill, Progress, Segmented, Btn, Empty, BtnLink, type Tone } from "../ui";

export type AuctionSummary = {
  id: string;
  title: string;
  status: string;
  archived: boolean;
  isScheduled: boolean;
  itemsCount: number;
  raised: number;
  totalBids: number;
  startAtIso: string;
  endAtIso: string;
};

const CLOSED_SHOWN = 6;

type Group = "live" | "upcoming" | "closed" | "archived";

/** "3 hrs", "2 days", "12 min" — how long until a moment, in the fewest words. */
function until(iso: string, now: number) {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "now";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hr${hrs !== 1 ? "s" : ""}`;
  return `${Math.round(hrs / 24)} days`;
}
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function AuctionCard({ a, mode, now }: { a: AuctionSummary; mode: "live" | "upcoming" | "closed"; now: number }) {
  const hrsLeft = (new Date(a.endAtIso).getTime() - now) / 36e5;
  // Time pressure is the whole point of a live auction, so it's colour-coded:
  // under 6 hours is red, under a day amber, otherwise green.
  const urgency: Tone = hrsLeft <= 6 ? "red" : hrsLeft <= 24 ? "amber" : "green";
  // How far through its run a live auction is — drives the progress bar.
  const total = Math.max(1, new Date(a.endAtIso).getTime() - new Date(a.startAtIso).getTime());
  const elapsed = Math.min(1, Math.max(0, (now - new Date(a.startAtIso).getTime()) / total));

  return (
    <Link
      href={`/admin/auctions/${a.id}`}
      className={`block bg-white border rounded-2xl p-4 nb-lift-sm hover:border-[#c47b3e]/50 ${
        mode === "live" && urgency === "red" ? "border-[#f0c4ba]" : "border-[#e6dac6]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display font-black text-lg text-[#241a12] leading-snug break-words min-w-0">{a.title}</h3>
        {mode === "live" ? (
          <Pill tone={urgency} dot>{until(a.endAtIso, now)} left</Pill>
        ) : mode === "upcoming" ? (
          <Pill tone="slate">{a.isScheduled ? `opens ${until(a.startAtIso, now)}` : "ready"}</Pill>
        ) : (
          <Pill tone="slate">{a.status.toLowerCase()}</Pill>
        )}
      </div>

      {/* Three numbers, evenly weighted — lots, bids, money. */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-2.5 text-sm text-[#8a7559]">
        <span><strong className="font-extrabold text-[#241a12] tabular-nums">{a.itemsCount}</strong> lot{a.itemsCount !== 1 ? "s" : ""}</span>
        <span><strong className="font-extrabold text-[#241a12] tabular-nums">{a.totalBids}</strong> bid{a.totalBids !== 1 ? "s" : ""}</span>
        <span>
          <strong className={`font-extrabold tabular-nums ${mode === "closed" ? "text-[#2f5d3a]" : "text-[#241a12]"}`}>{fmtMoney0(a.raised)}</strong>
          {" "}{mode === "closed" ? "sold" : "bid so far"}
        </span>
      </div>

      {mode === "live" && <Progress value={elapsed} tone={urgency} className="mt-3" />}

      <div className="text-xs text-[#b3a085] mt-2.5">
        {fmtDay(a.startAtIso)} to {fmtDay(a.endAtIso)}
      </div>
    </Link>
  );
}

export default function AuctionsList({
  live, upcoming, closed, archived = [],
}: { live: AuctionSummary[]; upcoming: AuctionSummary[]; closed: AuctionSummary[]; archived?: AuctionSummary[] }) {
  // One group open at a time; live is the working set so it's the default.
  const [group, setGroup] = useState<Group>("live");
  const [closedLimit, setClosedLimit] = useState(CLOSED_SHOWN);
  // Snapshot the clock once per mount so render stays pure (the page re-renders on
  // every auction-updated Pusher event anyway).
  const [now] = useState(() => Date.now());

  const options: { value: Group; label: string; count: number }[] = [
    { value: "live", label: "Live", count: live.length },
    { value: "upcoming", label: "Upcoming", count: upcoming.length },
    { value: "closed", label: "Closed", count: closed.length },
    ...(archived.length > 0 ? [{ value: "archived" as Group, label: "Archived", count: archived.length }] : []),
  ];

  return (
    <div className="space-y-4">
      <Segmented value={group} onChange={setGroup} options={options} />

      {/* ── Live: the working set ── */}
      {group === "live" && (
        live.length === 0 ? (
          <div className="bg-white border border-[#e6dac6] rounded-2xl">
            <Empty
              text="Nothing live right now."
              sub={upcoming.length > 0 ? "Your next auction is on deck under Upcoming." : "Open an auction and it shows up here."}
              action={upcoming.length === 0 ? <BtnLink href="/admin/auctions/new" size="sm">New auction</BtnLink> : undefined}
            />
          </div>
        ) : (
          <div className="space-y-2.5">
            {live.map((a) => <AuctionCard key={a.id} a={a} mode="live" now={now} />)}
          </div>
        )
      )}

      {group === "upcoming" && (
        upcoming.length === 0 ? (
          <div className="bg-white border border-[#e6dac6] rounded-2xl">
            <Empty text="Nothing upcoming." sub="Drafts and scheduled auctions land here." action={<BtnLink href="/admin/auctions/new" size="sm">New auction</BtnLink>} />
          </div>
        ) : (
          <div className="space-y-2.5">
            {upcoming.map((a) => <AuctionCard key={a.id} a={a} mode="upcoming" now={now} />)}
          </div>
        )
      )}

      {group === "closed" && (
        closed.length === 0 ? (
          <div className="bg-white border border-[#e6dac6] rounded-2xl">
            <Empty text="No closed auctions yet." sub="Once an auction ends it moves here." />
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* Capped — after a year of weekly auctions this list is 50+ long and
                rendering all of it on a phone is pointless. */}
            {closed.slice(0, closedLimit).map((a) => <AuctionCard key={a.id} a={a} mode="closed" now={now} />)}
            {closed.length > closedLimit && (
              <Btn variant="outline" tone="slate" full onClick={() => setClosedLimit((n) => n + 12)}>
                Show more ({closed.length - closedLimit} older)
              </Btn>
            )}
          </div>
        )
      )}

      {group === "archived" && (
        <div className="space-y-2.5">
          <p className="text-sm text-[#8a7559] px-1">Hidden from reports, winners and the public site.</p>
          {archived.map((a) => <AuctionCard key={a.id} a={a} mode="closed" now={now} />)}
        </div>
      )}
    </div>
  );
}
