"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";
import EmptyState from "@/app/components/EmptyState";
import { IcoCheck, IcoGift, IcoTrophy } from "@/app/components/BidIcons";
import { PineMark } from "@/app/components/Illustrations";
import {
  type Giveaway,
  type Winner,
  EntryBlock,
  PhaseChip,
  PrizeArt,
  TicketLine,
  drawStyleLabel,
  fmtDetroit,
  howToEnter,
  markEntered,
  money,
  plural,
  relativeDay,
} from "@/app/components/giveaway/shared";

/**
 * /giveaways — the public giveaway portal. Everything running, everything on deck,
 * what just wrapped (with who won), and a wall of past winners. Cards are fuller
 * than the home tiles: description, the one-sentence entry rule, the window in
 * Michigan time and the full prize list. Entry actions are the shared EntryBlock.
 */
export default function GiveawaysPage() {
  const [giveaways, setGiveaways] = useState<Giveaway[] | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    fetch("/api/giveaways/active?all=1")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { giveaways?: Giveaway[]; signedIn?: boolean }) => {
        setGiveaways(Array.isArray(d.giveaways) ? d.giveaways : []);
        setSignedIn(!!d.signedIn);
      })
      .catch(() => setError(true));
    fetch("/api/giveaways/winners")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { winners?: Winner[] }) => setWinners(Array.isArray(d.winners) ? d.winners : []))
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const onEntered = (id: string, tickets: number) => setGiveaways((prev) => (prev ? markEntered(prev, id, tickets) : prev));

  const list = giveaways ?? [];
  const now = list.filter((g) => g.phase === "live" || g.phase === "ended");
  const upcoming = list.filter((g) => g.phase === "scheduled");
  const finished = list.filter((g) => g.phase === "complete");
  const nothingRunning = giveaways !== null && !error && list.length === 0;

  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-6 sm:py-8">
        {/* Page header */}
        <div className="flex items-end justify-between gap-3 mb-6">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#a85f28]">
              <PineMark className="w-3.5 h-3.5" /> Free to play
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-black leading-[0.95] tracking-tight mt-1">Giveaways</h1>
            <p className="text-sm text-[#6f5b46] mt-1.5 max-w-xl">
              Real prizes from the warehouse, no purchase needed. Some you tap into, some you&apos;re in just for having an account, and on others every bid you place is a ticket.
            </p>
          </div>
          <Link href="/auctions" className="text-[#6c4d39] hover:text-[#563e2c] text-sm font-semibold underline underline-offset-2 shrink-0">
            Live auctions
          </Link>
        </div>

        {error && (
          <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 text-center mb-6">
            <p className="text-[#6f5b46]">Couldn&apos;t load the giveaways just now.</p>
            <button onClick={load} className="mt-3 bg-[#6c4d39] hover:bg-[#563e2c] text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
              Try again
            </button>
          </div>
        )}

        {giveaways === null && !error && (
          <div className="space-y-4" aria-busy>
            <div className="nb-skeleton h-16 rounded-2xl" />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="nb-skeleton h-72 rounded-2xl" />
              <div className="nb-skeleton h-72 rounded-2xl" />
            </div>
          </div>
        )}

        {nothingRunning && (
          <EmptyState
            art="critter"
            framed
            title="No giveaways running right now"
            message="Follow along, they pop up often. Every bidder with an account is in the running the moment one opens."
            cta={
              <Link href="/auctions" className="inline-block bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors">
                Browse live auctions
              </Link>
            }
          />
        )}

        {now.length > 0 && (
          <section className="mb-10">
            <SectionHeader
              variant="live"
              eyebrow="Tickets are going in"
              title="Happening now"
              tagline="Open right now, or just closed and waiting on the draw."
              count={now.length}
              countLabel={plural(now.length, "giveaway")}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              {now.map((g) => (
                <FullCard key={g.id} g={g} signedIn={signedIn} onEntered={onEntered} />
              ))}
            </div>
          </section>
        )}

        {upcoming.length > 0 && (
          <section className="mb-10">
            <SectionHeader
              variant="upcoming"
              eyebrow="On deck"
              title="Coming up"
              tagline="Set a reminder. These open on their own when the clock hits."
              count={upcoming.length}
              countLabel={plural(upcoming.length, "giveaway")}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              {upcoming.map((g) => (
                <FullCard key={g.id} g={g} signedIn={signedIn} onEntered={onEntered} />
              ))}
            </div>
          </section>
        )}

        {finished.length > 0 && (
          <section className="mb-10">
            <SectionHeader
              variant="hot"
              eyebrow="Drawn"
              title="Just finished"
              tagline="Winners pulled in the last two weeks. Prizes ride along with their next pickup."
              count={finished.length}
              countLabel={plural(finished.length, "giveaway")}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              {finished.map((g) => (
                <FullCard key={g.id} g={g} signedIn={signedIn} onEntered={onEntered} />
              ))}
            </div>
          </section>
        )}

        {winners.length > 0 && (
          <section className="mb-6">
            <SectionHeader
              variant="giveaway"
              eyebrow="Real people, real prizes"
              title="Winners wall"
              tagline="Every prize we've handed out, newest first."
              count={winners.length}
              countLabel={plural(winners.length, "prize")}
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {winners.map((w, i) => (
                <WinnerTile key={`${w.giveawayId}-${w.prize}-${i}`} w={w} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

// ── Full giveaway card ────────────────────────────────────────────────────────
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-20 shrink-0 text-[10px] font-black uppercase tracking-[0.14em] text-[#8a7559] pt-0.5">{label}</dt>
      <dd className="min-w-0 flex-1 text-[#241a12] leading-snug">{children}</dd>
    </div>
  );
}

function windowLabel(g: Giveaway) {
  const opens = g.startsAt ? `Opens ${fmtDetroit(g.startsAt)}` : null;
  const ends = g.endsAt ? `Ends ${fmtDetroit(g.endsAt)}` : "Ends when we say";
  if (g.phase === "complete") return g.endsAt ? `Ended ${fmtDetroit(g.endsAt)}` : "Wrapped up";
  if (g.phase === "ended") return g.endsAt ? `Closed ${fmtDetroit(g.endsAt)} · drawing soon` : "Closed · drawing soon";
  if (g.phase === "scheduled") return [opens, ends].filter(Boolean).join(" · ");
  return ends;
}

function FullCard({
  g,
  signedIn,
  onEntered,
}: {
  g: Giveaway;
  signedIn: boolean;
  onEntered: (id: string, tickets: number) => void;
}) {
  const complete = g.phase === "complete";
  return (
    <article className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden flex flex-col sm:flex-row">
      <PrizeArt g={g} className={`shrink-0 h-52 sm:h-auto sm:w-52 md:w-56 ${complete ? "opacity-90" : ""}`} />

      <div className="flex-1 min-w-0 p-5 sm:p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <PhaseChip g={g} />
          <span className="text-[11px] text-[#8a7559]">{drawStyleLabel(g)}</span>
        </div>

        <div>
          <h2 className="font-display text-2xl font-black text-[#241a12] leading-tight">{g.title}</h2>
          {g.description && <p className="text-sm text-[#6f5b46] mt-1.5 leading-relaxed">{g.description}</p>}
        </div>

        <dl className="space-y-2 border-t border-[#efe3d0] pt-3">
          <Row label="Enter">{howToEnter(g)}</Row>
          <Row label="When">
            <span className="tabular-nums">{windowLabel(g)}</span>
            <span className="text-[#8a7559]"> · Michigan time</span>
          </Row>
          <Row label={plural(g.prizes.length, "Prize")}>
            <ul className="space-y-1.5">
              {g.prizes.map((p) => (
                <li key={p.id} className="flex items-center gap-2 min-w-0">
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo} alt="" className="w-8 h-8 rounded-lg object-cover border border-[#e3d6bf] shrink-0" />
                  ) : (
                    <span className="w-8 h-8 rounded-lg bg-[#faf5ea] border border-[#e3d6bf] flex items-center justify-center text-[#a85f28] shrink-0">
                      <IcoGift className="w-4 h-4" />
                    </span>
                  )}
                  <span className="min-w-0 truncate">{p.title}</span>
                  {p.retailValue != null && p.retailValue > 0 && (
                    <span className="text-xs font-bold text-[#a85f28] tabular-nums shrink-0">{money(p.retailValue)}</span>
                  )}
                </li>
              ))}
            </ul>
            {g.totalValue > 0 && g.prizes.length > 1 && (
              <p className="text-xs text-[#8a7559] mt-1.5 tabular-nums">{money(g.totalValue)} total value</p>
            )}
          </Row>
        </dl>

        <TicketLine g={g} signedIn={signedIn} />

        <EntryBlock g={g} signedIn={signedIn} onEntered={onEntered} className="mt-auto pt-1" />

        {complete && g.wonBy.length > 0 && (
          <div className="rounded-xl bg-[#faf5ea] border border-[#e3d6bf] px-4 py-3 mt-auto">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#a85f28]">
              <IcoTrophy className="w-3.5 h-3.5" /> {plural(g.wonBy.length, "Winner")}
            </div>
            <ul className="mt-1.5 space-y-1">
              {g.wonBy.map((w, i) => (
                <li key={`${w.name}-${i}`} className="flex items-center gap-2 text-sm">
                  <IcoCheck className="w-3.5 h-3.5 text-[#4a7c59] shrink-0" />
                  <span className="font-bold text-[#241a12]">{w.name}</span>
                  <span className="text-[#8a7559] truncate">won the {w.prize}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}

// ── Winners wall tile ─────────────────────────────────────────────────────────
function WinnerTile({ w }: { w: Winner }) {
  return (
    <div className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden">
      <div className="relative aspect-square bg-[#faf5ea]">
        {w.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={w.photo} alt={w.prize} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[#c47b3e]">
            <IcoGift className="w-10 h-10" />
          </div>
        )}
        {w.value != null && w.value > 0 && (
          <span className="absolute bottom-2 right-2 rounded-md bg-[#c47b3e] text-white text-[10px] font-black px-1.5 py-0.5 tabular-nums">
            {money(w.value)}
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-1.5 text-sm font-bold text-[#241a12] leading-tight">
          <IcoTrophy className="w-3.5 h-3.5 text-[#c47b3e] shrink-0" />
          <span className="truncate">{w.name}</span>
        </div>
        <div className="text-xs text-[#6f5b46] mt-1 leading-snug line-clamp-2">{w.prize}</div>
        <div className="text-[11px] text-[#8a7559] mt-1.5 truncate">
          {w.giveawayTitle} · {relativeDay(w.wonAt)}
        </div>
      </div>
    </div>
  );
}
