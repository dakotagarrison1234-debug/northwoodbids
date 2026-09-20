"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ScrollReveal from "@/app/components/ScrollReveal";
import { IcoGift } from "@/app/components/BidIcons";
import {
  type Giveaway,
  EntryBlock,
  PhaseChip,
  PrizeArt,
  TicketLine,
  markEntered,
  money,
  prizeLine,
} from "@/app/components/giveaway/shared";

/**
 * Home-page giveaway section. Self-fetches the (up to two) public giveaways and
 * renders nothing when there aren't any. Two cards sit side by side on sm+, a lone
 * giveaway gets the full width and a roomier layout. Entry actions live in the
 * shared EntryBlock so the /giveaways portal behaves identically.
 */
export default function GiveawayCard() {
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/giveaways/active")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { giveaways?: Giveaway[]; signedIn?: boolean }) => {
        if (cancelled) return;
        setGiveaways(Array.isArray(d.giveaways) ? d.giveaways.slice(0, 2) : []);
        setSignedIn(!!d.signedIn);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (giveaways.length === 0) return null;

  const onEntered = (id: string, tickets: number) => setGiveaways((prev) => markEntered(prev, id, tickets));
  const single = giveaways.length === 1;

  return (
    <section className="max-w-6xl mx-auto px-5 sm:px-8 mt-4 mb-1">
      <ScrollReveal>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#a85f28]">
            <IcoGift className="w-3.5 h-3.5" /> Giveaways
          </div>
          <Link href="/giveaways" className="nb-focus text-xs font-semibold text-[#6c4d39] hover:text-[#563e2c] underline underline-offset-2 whitespace-nowrap">
            All giveaways
          </Link>
        </div>
        <div className={single ? "" : "grid sm:grid-cols-2 gap-3"}>
          {giveaways.map((g) => (
            <HomeTile key={g.id} g={g} signedIn={signedIn} roomy={single} onEntered={onEntered} />
          ))}
        </div>
      </ScrollReveal>
    </section>
  );
}

/** One slim giveaway strip: thumbnail, title + one info line, inline action. */
function HomeTile({
  g,
  signedIn,
  roomy,
  onEntered,
}: {
  g: Giveaway;
  signedIn: boolean;
  roomy: boolean;
  onEntered: (id: string, tickets: number) => void;
}) {
  const dimmed = g.phase !== "live";
  return (
    <article className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden shadow-[0_6px_18px_-14px_rgba(60,40,25,0.45)] flex items-stretch">
      <PrizeArt g={g} className={`shrink-0 ${roomy ? "w-28 sm:w-36" : "w-24 sm:w-28"} ${dimmed ? "opacity-90" : ""}`} />
      <div className="flex-1 min-w-0 px-3.5 py-3 sm:px-4 flex flex-col justify-center gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <PhaseChip g={g} />
          {g.totalValue > 0 && (
            <span className="text-[10px] font-black uppercase tracking-wide text-[#a85f28] tabular-nums">{money(g.totalValue)} value</span>
          )}
        </div>
        <h3 className={`font-display font-black text-[#241a12] leading-tight truncate ${roomy ? "text-lg sm:text-xl" : "text-base sm:text-lg"}`}>
          {g.title}
        </h3>
        <p className="text-xs text-[#6f5b46] truncate">
          {prizeLine(g)}
          {g.prizes.length > 1 && g.winners > 0 && <span className="text-[#8a7559]"> · {g.winners} winners</span>}
        </p>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TicketLine g={g} signedIn={signedIn} />
          {dimmed ? (
            <Link href="/giveaways" className="text-xs font-semibold text-[#6c4d39] hover:text-[#563e2c] underline underline-offset-2">
              Details
            </Link>
          ) : (
            <EntryBlock g={g} signedIn={signedIn} onEntered={onEntered} compact />
          )}
        </div>
      </div>
    </article>
  );
}
