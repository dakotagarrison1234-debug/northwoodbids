"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SoundFx } from "./_sound";
import ArcadeFloor, { type Boards } from "./ArcadeFloor";
import Cabinet from "./Cabinet";
import { GAMES, type GameKey, type Lot } from "./games/types";
import { PineMark } from "@/app/components/Illustrations";

/**
 * /play — the Northwood Arcade. The floor (every cabinet in attract mode +
 * the high-score wall) is the page; tapping a cabinet brings up the full
 * screen Cabinet view for that game. Scores save per cabinet; the arcade
 * total is the sum of your bests this season.
 */
export default function PlayPage() {
  const [sfx] = useState(() => new SoundFx());

  const [boards, setBoards] = useState<Boards | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [active, setActive] = useState<GameKey | null>(null);
  const [muted, setMuted] = useState(false);

  const loadBoards = useCallback(() => {
    fetch("/api/game/leaderboard", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j && j.games) setBoards(j); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadBoards();
    fetch("/api/game/items").then((r) => r.json()).then((j) => { if (Array.isArray(j.lots)) setLots(j.lots); }).catch(() => {});
    // Read the saved mute choice after mount so the first paint matches the server.
    const t = setTimeout(() => setMuted(sfx.muted), 0);
    return () => { clearTimeout(t); sfx.close(); };
  }, [loadBoards, sfx]);

  const toggleMute = () => setMuted(sfx.toggleMute());

  // Deep link: /play?g=buck opens that cabinet.
  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get("g");
    if (g && GAMES.some((x) => x.key === g)) {
      const t = setTimeout(() => setActive(g as GameKey), 0);
      return () => clearTimeout(t);
    }
  }, []);

  const meta = active ? GAMES.find((g) => g.key === active) ?? null : null;

  return (
    <main className="min-h-screen bg-[#07050a] text-white">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <Link href="/" className="inline-flex items-center gap-2 text-[15px] font-bold text-white/70 hover:text-white">
            <PineMark className="w-5 h-5 text-[#4a7c59]" />
            Northwood Bids
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/auctions" className="h-10 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-[15px] font-bold inline-flex items-center">Live auctions</Link>
            <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} className="h-10 w-10 rounded-lg bg-white/10 hover:bg-white/20 inline-flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 10v4h3l5 4V6L7 10z" />
                {muted ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" />}
              </svg>
            </button>
          </div>
        </div>

        <ArcadeFloor boards={boards} onOpen={(k) => { sfx.unlock(); setActive(k); }} paused={active != null} />

        <p className="text-center text-[13px] text-white/40 mt-6">Scores save when you&apos;re signed in. New season every 30 days.</p>
      </div>

      {meta && (
        <Cabinet
          meta={meta}
          lots={lots}
          sfx={sfx}
          muted={muted}
          onToggleMute={toggleMute}
          onClose={() => setActive(null)}
          onSaved={loadBoards}
          yourBest={boards?.games[meta.key]?.you?.best ?? null}
        />
      )}
    </main>
  );
}
