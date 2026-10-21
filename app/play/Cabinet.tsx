"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SignInButton, useUser } from "@clerk/nextjs";
import type { GameHandle, GameKey, GameMeta, Lot } from "./games/types";
import type { SoundFx } from "./_sound";
import Gavel from "./games/Gavel";
import Buck from "./games/Buck";
import Stack from "./games/Stack";
import Paddles from "./games/Paddles";
import Flap from "./games/Flap";
import Pies from "./games/Pies";
import Trail from "./games/Trail";

/**
 * The cabinet: a full-screen bezel around one game. Owns the run lifecycle
 * (START → playing → score screen), the score save, and the marquee HUD. The
 * game itself only knows start()/stop()/onEnd — see games/types.ts.
 *
 */
// The floor already imports every game for its attract screens, so the
// cabinets are in the same chunk; nothing to lazy-load.
const LOADERS: Record<GameKey, typeof Gavel> = { gavel: Gavel, buck: Buck, stack: Stack, paddles: Paddles, flap: Flap, pies: Pies, trail: Trail };

type Saved = { points: number; best: number; isBest: boolean; rank: number; total: number; totalRank: number };

const fmt = (n: number) => n.toLocaleString("en-US");

export default function Cabinet({
  meta, lots, sfx, muted, onToggleMute, onClose, onSaved, yourBest,
}: {
  meta: GameMeta;
  lots: Lot[];
  sfx: SoundFx;
  muted: boolean;
  onToggleMute: () => void;
  onClose: () => void;
  /** The floor refreshes its boards after a save. */
  onSaved: () => void;
  /** This player's best on this cabinet this season (null when none / signed out). */
  yourBest: number | null;
}) {
  const { isSignedIn } = useUser();
  const Game = LOADERS[meta.key];
  const gameRef = useRef<GameHandle>(null);
  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [hud, setHud] = useState<{ score: number; timeLeft?: number; lives?: number }>({ score: 0 });
  const [finalRaw, setFinalRaw] = useState(0);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [runs, setRuns] = useState(0);

  const start = useCallback(() => {
    sfx.unlock();
    setHud({ score: 0 });
    setSaved(null);
    setSaveError(null);
    setPhase("playing");
    // The game component may still be loading the first time; start on the
    // next frame once the ref is populated.
    requestAnimationFrame(() => gameRef.current?.start());
    setRuns((r) => r + 1);
  }, [sfx]);

  const save = useCallback(async (score: number) => {
    setSaving(true);
    try {
      const res = await fetch("/api/game/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game: meta.key, score }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Couldn't save that run.");
      setSaved(j as Saved);
      if ((j as Saved).isBest) sfx.fanfare();
      onSaved();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save that run.");
    } finally {
      setSaving(false);
    }
  }, [meta.key, onSaved, sfx]);

  const onEnd = useCallback((raw: number) => {
    const score = Math.max(0, Math.floor(raw));
    setFinalRaw(score);
    setPhase("over");
    if (isSignedIn) void save(score);
  }, [isSignedIn, save]);

  // Signed in from the game-over screen? Save the run they just finished.
  useEffect(() => {
    if (!(isSignedIn && phase === "over" && !saved && !saving && !saveError)) return;
    const t = setTimeout(() => { void save(finalRaw); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  const close = useCallback(() => {
    gameRef.current?.stop();
    onClose();
  }, [onClose]);

  // Esc closes; Space/Enter on the ready + over screens starts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Leave form fields, buttons and the sign-in modal alone.
      const t = e.target as HTMLElement | null;
      if (t && t !== document.body && t.closest("input, textarea, select, button, a, [contenteditable='true'], [class*='cl-']")) return;
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if ((e.key === " " || e.key === "Enter") && phase !== "playing") { e.preventDefault(); start(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, close, start]);

  // Lock page scroll while the cabinet is up.
  useEffect(() => {
    const prev = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; document.documentElement.style.overflow = prevHtml; };
  }, []);

  const points = Math.min(20_000, Math.floor(finalRaw * meta.scale));
  const bestShown = saved?.best ?? yourBest;

  return (
    <div className="fixed inset-0 z-[60] bg-[#07050a] flex flex-col overscroll-none" role="dialog" aria-modal="true" aria-label={meta.title}>
      {/* Marquee */}
      <div className="shrink-0 flex items-center gap-3 px-3 sm:px-5 h-14 border-b border-white/10" style={{ background: `linear-gradient(180deg, ${meta.accent}33, #0d0a12)` }}>
        <button type="button" onClick={close} className="h-10 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-[15px] inline-flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
          Arcade
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-display font-black text-[17px] sm:text-[20px] leading-none tracking-wide uppercase truncate" style={{ color: meta.accent, textShadow: `0 0 12px ${meta.accent}99` }}>{meta.title}</div>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <div className="text-[13px] font-black uppercase tracking-[0.12em] text-white/50">Score</div>
            <div className="font-display text-[20px] font-black text-white tabular-nums leading-none">{fmt(hud.score)}</div>
          </div>
          {hud.timeLeft != null && phase === "playing" && (
            <div>
              <div className="text-[13px] font-black uppercase tracking-[0.12em] text-white/50">Time</div>
              <div className="font-display text-[20px] font-black text-white tabular-nums leading-none">{Math.ceil(hud.timeLeft)}</div>
            </div>
          )}
          {bestShown != null && (
            <div className="hidden sm:block">
              <div className="text-[13px] font-black uppercase tracking-[0.12em] text-white/50">Best</div>
              <div className="font-display text-[20px] font-black tabular-nums leading-none" style={{ color: meta.accent }}>{fmt(bestShown)}</div>
            </div>
          )}
          <button type="button" onClick={onToggleMute} aria-label={muted ? "Unmute" : "Mute"} className="h-10 w-10 rounded-lg bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 10v4h3l5 4V6L7 10z" />
              {muted ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" />}
            </svg>
          </button>
        </div>
      </div>

      {/* Screen */}
      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0 sm:inset-3 sm:rounded-2xl overflow-hidden bg-black sm:ring-8 sm:ring-[#1a1420] sm:shadow-[inset_0_0_60px_rgba(0,0,0,0.8)]">
          <div className="absolute inset-0">
            <Game key={meta.key} ref={gameRef} onEnd={onEnd} onHud={setHud} sfx={sfx} lots={lots} />
          </div>

          {/* Scanline sheen */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 3px)" }} />

          {phase === "ready" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-6">
              <div className="w-full max-w-sm text-center">
                <div className="font-display text-[34px] sm:text-[44px] font-black uppercase tracking-wider leading-none" style={{ color: meta.accent, textShadow: `0 0 22px ${meta.accent}aa` }}>{meta.title}</div>
                <p className="text-[15px] text-white/80 mt-3 leading-snug">{meta.howTo}</p>
                <button type="button" autoFocus onClick={start} className="nb-attention mt-7 w-full h-14 rounded-xl font-display font-black text-[20px] uppercase tracking-widest text-[#241a12]" style={{ background: meta.accent, boxShadow: `0 10px 30px -8px ${meta.accent}` }}>
                  Press start
                </button>
                {!isSignedIn && (
                  <p className="text-[13px] text-white/55 mt-4">
                    Play free. <SignInButton mode="modal"><button type="button" className="underline underline-offset-2 text-white/80">Sign in</button></SignInButton> to save your score to the board.
                  </p>
                )}
                {runs === 0 && bestShown != null && <p className="text-[13px] text-white/55 mt-2">Your best here: {fmt(bestShown)}</p>}
              </div>
            </div>
          )}

          {phase === "over" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-[2px] p-6">
              <div className="w-full max-w-sm text-center">
                <div className="text-[13px] font-black uppercase tracking-[0.2em] text-white/60">Game over</div>
                <div className="font-display text-[56px] sm:text-[72px] font-black text-white tabular-nums leading-none mt-2">{fmt(finalRaw)}</div>
                {meta.scale !== 1 && <div className="text-[13px] text-white/55 mt-1">{fmt(points)} arcade points</div>}

                {saved?.isBest && (
                  <div className="nb-pop mt-3 inline-block rounded-full px-4 py-1.5 font-black text-[15px] uppercase tracking-wide text-[#241a12]" style={{ background: meta.accent }}>New personal best</div>
                )}

                {saved && (
                  <div className="mt-4 grid grid-cols-2 gap-2 text-left">
                    <div className="rounded-xl bg-white/10 px-3 py-2.5">
                      <div className="text-[13px] font-black uppercase tracking-[0.1em] text-white/50">This cabinet</div>
                      <div className="text-[17px] font-black text-white">#{saved.rank} <span className="text-white/60 font-semibold">best {fmt(saved.best)}</span></div>
                    </div>
                    <div className="rounded-xl bg-white/10 px-3 py-2.5">
                      <div className="text-[13px] font-black uppercase tracking-[0.1em] text-white/50">Whole arcade</div>
                      <div className="text-[17px] font-black text-white">#{saved.totalRank} <span className="text-white/60 font-semibold">{fmt(saved.total)} total</span></div>
                    </div>
                  </div>
                )}
                {saving && <p className="text-[13px] text-white/55 mt-3">Saving your run...</p>}
                {saveError && <p className="text-[13px] text-[#ff9f8a] mt-3">{saveError}</p>}
                {!isSignedIn && (
                  <p className="text-[15px] text-white/75 mt-4">
                    <SignInButton mode="modal"><button type="button" className="underline underline-offset-2 font-bold text-white">Sign in</button></SignInButton> to put this on the board.
                  </p>
                )}

                <div className="mt-6 flex gap-2.5">
                  <button type="button" onClick={close} className="flex-1 h-13 min-h-[52px] rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-[15px]">Back to arcade</button>
                  <button type="button" autoFocus onClick={start} className="flex-1 min-h-[52px] rounded-xl font-display font-black text-[17px] uppercase tracking-wider text-[#241a12]" style={{ background: meta.accent }}>Play again</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
