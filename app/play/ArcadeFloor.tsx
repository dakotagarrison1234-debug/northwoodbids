"use client";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/app/components/Avatars";
import { GAMES, type AttractFn, type GameKey, type GameMeta } from "./games/types";
import { drawAttract as gavel } from "./games/Gavel";
import { drawAttract as buck } from "./games/Buck";
import { drawAttract as stack } from "./games/Stack";
import { drawAttract as paddles } from "./games/Paddles";
import { drawAttract as flap } from "./games/Flap";
import { drawAttract as pies } from "./games/Pies";
import { drawAttract as trail } from "./games/Trail";

/**
 * The arcade floor, seen from above: a neon carpet, seven cabinets in two
 * rows with their screens running attract mode, the high-score wall along
 * the back, and the top player's critter standing at each machine. Tap a
 * cabinet to play it (the page swaps in the Cabinet view).
 */

const ATTRACT: Record<GameKey, AttractFn> = { gavel, buck, stack, paddles, flap, pies, trail };

export type Leader = { rank: number; name: string; avatarKey: string | null; score: number };
export type Boards = {
  seasonEnd: string;
  overall: { top: Leader[]; you: { total: number; rank: number; played: number } | null };
  games: Record<string, { top: Leader[]; you: { best: number; rank: number } | null }>;
};

const fmt = (n: number) => n.toLocaleString("en-US");

function CabinetCard({ meta, board, onOpen, screenRef }: {
  meta: GameMeta;
  board?: { top: Leader[]; you: { best: number; rank: number } | null };
  onOpen: () => void;
  screenRef: (el: HTMLCanvasElement | null) => void;
}) {
  const champ = board?.top[0];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Play ${meta.title}`}
        className="group block w-full text-left select-none transition-transform duration-200 hover:-translate-y-1 active:translate-y-0 nb-focus rounded-2xl"
      >
        {/* Marquee */}
        <div
          className="relative mx-[6%] h-10 sm:h-12 rounded-t-xl flex items-center justify-center overflow-hidden border border-white/15"
          style={{ background: `linear-gradient(180deg, ${meta.accent} 0%, ${meta.accent}99 100%)`, boxShadow: `0 -6px 26px -6px ${meta.accent}cc, inset 0 -3px 0 rgba(0,0,0,.25)` }}
        >
          <div className="font-display font-black uppercase tracking-[0.08em] text-[15px] sm:text-[17px] text-[#120a06] drop-shadow-[0_1px_0_rgba(255,255,255,.45)] px-2 truncate">{meta.title}</div>
          <div className="absolute inset-x-0 top-0 h-[2px] bg-white/60" />
        </div>

        {/* Body: screen bezel */}
        <div className="mx-[3%] bg-[#1a1322] border-x border-white/10 px-[6%] pt-3 pb-2" style={{ boxShadow: `inset 8px 0 18px -12px ${meta.accent}, inset -8px 0 18px -12px ${meta.accent}` }}>
          <div className="relative rounded-md overflow-hidden bg-black ring-[3px] ring-[#0b0810] shadow-[inset_0_0_24px_rgba(0,0,0,.9)]" style={{ transform: "perspective(600px) rotateX(6deg)" }}>
            <canvas ref={screenRef} className="block w-full aspect-[16/10]" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 3px)" }} />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,.55)_100%)]" />
            <div className="pointer-events-none absolute inset-x-0 bottom-1.5 text-center text-[13px] font-black uppercase tracking-[0.14em] text-white/85 nb-cue">Press start</div>
          </div>
        </div>

        {/* Control panel, seen from above */}
        <div className="mx-[3%] rounded-b-md bg-[#2a2033] border border-white/10 border-t-0 px-[8%] py-2 sm:py-2.5 flex items-center justify-between" style={{ boxShadow: "0 14px 22px -14px rgba(0,0,0,.9)" }}>
          <div className="relative w-7 h-7 sm:w-8 sm:h-8">
            <div className="absolute inset-0 rounded-full bg-[#0f0b14] shadow-[inset_0_2px_4px_rgba(0,0,0,.9)]" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[70%] w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-[#d9303f] shadow-[0_2px_3px_rgba(0,0,0,.7),inset_0_-2px_3px_rgba(0,0,0,.4),inset_0_2px_2px_rgba(255,255,255,.5)]" />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {[meta.accent, "#3b8bd9", "#e0b84a"].map((c, i) => (
              <span key={i} className="block w-4 h-4 sm:w-5 sm:h-5 rounded-full border border-black/50" style={{ background: c, boxShadow: `0 2px 2px rgba(0,0,0,.6), inset 0 2px 2px rgba(255,255,255,.45), 0 0 8px ${c}88` }} />
            ))}
          </div>
          <div className="w-5 h-3 rounded-sm bg-[#0f0b14] border border-white/15" aria-hidden />
        </div>

        {/* Base */}
        <div className="mx-[5%] h-2 rounded-b-md bg-[#120d18]" />
      </button>

      {/* The champ at the machine */}
      <div className="absolute -bottom-3 left-[8%] flex items-end gap-1.5 pointer-events-none">
        {champ ? (
          <>
            <div className="relative">
              <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-10 h-2.5 rounded-full bg-black/60 blur-[2px]" />
              <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full ring-2 ring-[#e0b84a] shadow-[0_0_12px_rgba(224,184,74,.6)] overflow-hidden bg-[#2a2033]">
                {champ.avatarKey ? <Avatar avatarKey={champ.avatarKey} className="w-full h-full" /> : <div className="w-full h-full grid place-items-center text-[#e0b84a] font-black">{champ.name.slice(0, 1)}</div>}
              </div>
            </div>
            <div className="rounded-md bg-black/70 px-2 py-1 leading-none mb-1">
              <div className="text-[13px] font-black uppercase tracking-[0.1em] text-[#e0b84a]">High score</div>
              <div className="text-[13px] font-bold text-white truncate max-w-[88px] sm:max-w-[120px]">{fmt(champ.score)} <span className="text-white/70">{champ.name}</span></div>
            </div>
          </>
        ) : (
          <div className="rounded-md bg-black/70 px-2 py-1 leading-none mb-1">
            <div className="text-[13px] font-black uppercase tracking-[0.1em] text-[#e0b84a]">High score</div>
            <div className="text-[13px] font-bold text-white">Be the first</div>
          </div>
        )}
      </div>
      {board?.you && (
        <div className="hidden sm:block absolute -bottom-3 right-[8%] rounded-md bg-black/70 px-2 py-1 leading-none mb-1 pointer-events-none">
          <div className="text-[13px] font-black uppercase tracking-[0.1em] text-white/60">You</div>
          <div className="text-[13px] font-bold text-white">#{board.you.rank} with {fmt(board.you.best)}</div>
        </div>
      )}
    </div>
  );
}

export default function ArcadeFloor({ boards, onOpen, paused }: { boards: Boards | null; onOpen: (key: GameKey) => void; paused: boolean }) {
  const screens = useRef<Map<GameKey, HTMLCanvasElement>>(new Map());

  // One loop drives every cabinet's attract screen at ~30 fps, only while
  // the floor is showing and the tab is visible.
  useEffect(() => {
    if (paused) return;
    let raf = 0;
    let last = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || now - last < 33) return;
      last = now;
      const t = (now - t0) / 1000;
      for (const [key, c] of screens.current) {
        const rect = c.getBoundingClientRect();
        if (rect.width === 0 || rect.bottom < 0 || rect.top > window.innerHeight) continue;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        // CSS box, not the perspective-projected rect, so the frame isn't stretched.
        const w = Math.max(1, c.clientWidth), h = Math.max(1, c.clientHeight);
        if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
        const ctx = c.getContext("2d");
        if (!ctx) continue;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        try { ATTRACT[key](ctx, w, h, t); } catch { /* a cabinet's screen glitching must not take the floor down */ }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused]);

  // Days left in the season, computed off the render path (Date.now is impure).
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!boards) return;
    const t = setTimeout(() => setDaysLeft(Math.max(0, Math.ceil((new Date(boards.seasonEnd).getTime() - Date.now()) / 86_400_000))), 0);
    return () => clearTimeout(t);
  }, [boards]);
  const you = boards?.overall.you ?? null;

  return (
    <div className="relative">
      {/* Back wall: neon sign + high-score board + ticket counter */}
      <div className="relative rounded-t-3xl border border-white/10 border-b-0 bg-[#15101c] px-4 sm:px-6 pt-5 pb-6 overflow-hidden"
        style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 2px, transparent 2px 28px), repeating-linear-gradient(0deg, rgba(255,255,255,.03) 0 2px, transparent 2px 14px)" }}>
        <div className="flex flex-col lg:flex-row lg:items-stretch gap-5">
          <div className="flex-1 min-w-0">
            <div className="font-display font-black uppercase text-[30px] sm:text-[40px] leading-none tracking-[0.06em] text-[#ff5fa2]" style={{ textShadow: "0 0 10px #ff5fa2, 0 0 28px #ff5fa2aa, 0 0 60px #ff5fa255" }}>
              Northwood Arcade
            </div>
            <p className="text-[15px] text-white/70 mt-2 max-w-md">Seven machines, one scoreboard. Every cabinet scores on the same scale, so your arcade total is your best run on each, added up.</p>
            {daysLeft != null && <p className="text-[13px] text-white/45 mt-1">Season resets in {daysLeft} day{daysLeft === 1 ? "" : "s"}.</p>}

            {/* Ticket counter */}
            <div className="mt-4 inline-flex items-center gap-4 rounded-2xl bg-[#241a12] border border-[#e0b84a]/40 px-4 py-3" style={{ boxShadow: "0 0 24px rgba(224,184,74,.25)" }}>
              <div>
                <div className="text-[13px] font-black uppercase tracking-[0.12em] text-[#e0b84a]">Your arcade total</div>
                <div className="font-display text-[30px] font-black text-white tabular-nums leading-none mt-0.5">{you ? fmt(you.total) : "0"}</div>
              </div>
              {you ? (
                <div className="text-[13px] text-white/70 leading-snug">Rank #{you.rank}<br />{you.played} of {GAMES.length} machines played</div>
              ) : (
                <div className="text-[13px] text-white/60 leading-snug max-w-[160px]">Play any machine to get on the board.</div>
              )}
            </div>
          </div>

          {/* High score wall */}
          <div className="lg:w-[380px] shrink-0 rounded-2xl bg-black/50 border border-[#3b8bd9]/40 p-4" style={{ boxShadow: "0 0 24px rgba(59,139,217,.25)" }}>
            <div className="flex items-baseline justify-between">
              <div className="font-display font-black uppercase tracking-[0.12em] text-[17px] text-[#7cc1ff]" style={{ textShadow: "0 0 10px #3b8bd9" }}>High scores</div>
              <div className="text-[13px] font-black uppercase tracking-[0.1em] text-white/45">Whole arcade</div>
            </div>
            {boards && boards.overall.top.length > 0 ? (
              <ol className="mt-3 space-y-1.5">
                {boards.overall.top.map((l) => (
                  <li key={l.rank} className="flex items-center gap-2.5">
                    <span className="w-5 text-right font-display font-black text-[15px] tabular-nums" style={{ color: l.rank === 1 ? "#e0b84a" : l.rank === 2 ? "#cfd6e0" : l.rank === 3 ? "#d98b55" : "rgba(255,255,255,.5)" }}>{l.rank}</span>
                    <span className="w-7 h-7 rounded-full overflow-hidden bg-[#2a2033] shrink-0">
                      {l.avatarKey ? <Avatar avatarKey={l.avatarKey} className="w-full h-full" /> : <span className="w-full h-full grid place-items-center text-[13px] font-black text-white/70">{l.name.slice(0, 1)}</span>}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-[15px] font-bold text-white">{l.name}</span>
                    <span className="font-display font-black text-[15px] tabular-nums text-[#7cc1ff]">{fmt(l.score)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[15px] text-white/55 mt-3">{boards ? "No scores yet this season. The wall is yours." : "Loading the board..."}</p>
            )}
          </div>
        </div>
      </div>

      {/* The carpet */}
      <div
        className="relative rounded-b-3xl border border-white/10 border-t-0 px-4 sm:px-8 pt-8 pb-10 overflow-hidden"
        style={{
          backgroundColor: "#140f2a",
          backgroundImage:
            "radial-gradient(circle at 12% 18%, rgba(255,95,162,.55) 0 3px, transparent 4px)," +
            "radial-gradient(circle at 62% 38%, rgba(124,193,255,.55) 0 3px, transparent 4px)," +
            "radial-gradient(circle at 84% 12%, rgba(224,184,74,.55) 0 2px, transparent 3px)," +
            "radial-gradient(circle at 36% 72%, rgba(74,124,89,.6) 0 3px, transparent 4px)," +
            "radial-gradient(circle at 88% 66%, rgba(255,95,162,.5) 0 2px, transparent 3px)," +
            "radial-gradient(circle at 20% 92%, rgba(124,193,255,.5) 0 2px, transparent 3px)," +
            "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,.08), transparent 55%)",
          backgroundSize: "180px 180px, 220px 220px, 160px 160px, 240px 240px, 200px 200px, 210px 210px, 100% 100%",
        }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,.05) 0 6px, transparent 6px 40px)" }} />
        <div className="relative grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-10 sm:gap-y-12">
          {GAMES.map((g) => (
            <CabinetCard
              key={g.key}
              meta={g}
              board={boards?.games[g.key]}
              onOpen={() => onOpen(g.key)}
              screenRef={(el) => { if (el) screens.current.set(g.key, el); else screens.current.delete(g.key); }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
