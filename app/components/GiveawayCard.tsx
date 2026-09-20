"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";
import ScrollReveal from "@/app/components/ScrollReveal";
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
    <section className="max-w-6xl mx-auto px-5 sm:px-8 mt-5 mb-4">
      <ScrollReveal>
        <SectionHeader
          variant="giveaway"
          compact
          eyebrow="Free to play"
          title="Giveaways"
          tagline="Real prizes, free to enter. Winners pulled live on camera."
          action={
            <Link
              href="/giveaways"
              className="nb-focus inline-flex items-center gap-1 text-sm font-semibold text-[#a85f28] hover:text-[#8a4f1c] underline underline-offset-2 whitespace-nowrap"
            >
              All giveaways
            </Link>
          }
        />
        <div className={single ? "" : "grid sm:grid-cols-2 gap-4"}>
          {giveaways.map((g) => (
            <HomeTile key={g.id} g={g} signedIn={signedIn} roomy={single} onEntered={onEntered} />
          ))}
        </div>
      </ScrollReveal>
    </section>
  );
}

/** One giveaway card. `roomy` is the full-width layout used when there's only one. */
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
    <article
      className={`bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden shadow-[0_8px_24px_-16px_rgba(60,40,25,0.45)] flex flex-col ${
        roomy ? "sm:flex-row" : "lg:flex-row"
      }`}
    >
      <PrizeArt
        g={g}
        className={`shrink-0 ${
          roomy ? "h-52 sm:h-auto sm:w-60 md:w-72" : "h-44 lg:h-auto lg:w-44"
        } ${dimmed ? "opacity-90" : ""}`}
      />

      <div className={`flex-1 min-w-0 flex flex-col ${roomy ? "p-5 sm:p-6 gap-3" : "p-4 sm:p-5 gap-2.5"}`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <PhaseChip g={g} />
          {g.totalValue > 0 && (
            <span className="text-[11px] font-black uppercase tracking-wide text-[#a85f28] tabular-nums">
              {money(g.totalValue)} value
            </span>
          )}
        </div>

        <div>
          <h3 className={`font-display font-black text-[#241a12] leading-tight ${roomy ? "text-2xl sm:text-3xl" : "text-xl"}`}>
            {g.title}
          </h3>
          <p className="text-sm text-[#6f5b46] mt-1">
            {prizeLine(g)}
            {g.prizes.length > 1 && g.winners > 0 && <span className="text-[#8a7559]"> · {g.winners} winners</span>}
          </p>
          {roomy && g.description && (
            <p className="text-sm text-[#8a7559] mt-1.5 leading-relaxed line-clamp-2">{g.description}</p>
          )}
        </div>

        {roomy && g.prizes.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {g.prizes.slice(0, 6).map((p) => (
              <span key={p.id} className="text-[11px] bg-[#faf5ea] border border-[#e3d6bf] rounded-full px-2.5 py-1 text-[#6f5b46]">
                {p.title}
              </span>
            ))}
            {g.prizes.length > 6 && (
              <span className="text-[11px] text-[#8a7559] px-1 py-1">+{g.prizes.length - 6} more</span>
            )}
          </div>
        )}

        <TicketLine g={g} signedIn={signedIn} />

        <EntryBlock g={g} signedIn={signedIn} onEntered={onEntered} className="mt-auto pt-1" />

        {dimmed && (
          <Link href="/giveaways" className="text-xs font-semibold text-[#6c4d39] hover:text-[#563e2c] underline underline-offset-2 mt-auto pt-1 self-start">
            See the details
          </Link>
        )}
      </div>
    </article>
  );
}
