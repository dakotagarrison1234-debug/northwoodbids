"use client";

import { useEffect, useRef, useState } from "react";
import { BidCritter } from "@/app/components/BidIcons";
import type { DrawResult, Entrant } from "./SpinWheel";

/** Where the brass machine clip lives. Drop the mp4 in /public/giveaway/ — the CDN copy is the fallback. */
export const MACHINE_VIDEO_LOCAL = "/giveaway/ticket-machine.mp4";
export const MACHINE_VIDEO_CDN =
  "https://d8j0ntlcm91z4.cloudfront.net/user_3IByyQncVzaXbwKjQO3GCQGqPd7/hf_20260920_130847_54b85d44-f1cc-4a38-add4-9707601b54fc.mp4";
// Second (of 8) at which the claw holds the blank ticket up to camera — the name fades in here.
const REVEAL_AT = 7.45;

/**
 * The ticket machine draw. Same contract as the wheel (server picks → preview → Done
 * awards), different show: the brass drum tumbles, the claw snags one ticket and holds
 * it to camera, and the winner's name fades onto the blank ticket. Built for a crowd
 * and a phone camera — every ticket in the drum is a real chance, weighted by count.
 */
export default function TicketMachine({
  entrants,
  canSpin,
  brand,
  giveawayTitle,
  totalTickets,
  size = 720,
  onDraw,
  onAward,
}: {
  entrants: Entrant[];
  canSpin: boolean;
  brand: string;
  giveawayTitle: string;
  totalTickets: number;
  size?: number;
  onDraw: () => Promise<DrawResult | { error: string }>;
  onAward: (r: DrawResult) => Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [landed, setLanded] = useState(false);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [showCard, setShowCard] = useState(false);
  const [awarding, setAwarding] = useState(false);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(true);
  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (cardTimer.current) clearTimeout(cardTimer.current); }, []);

  const reset = () => {
    const v = videoRef.current;
    if (v) { v.pause(); v.currentTime = 0; }
    setPlaying(false); setRevealed(false); setLanded(false); setShowCard(false); setResult(null);
  };

  const pull = async () => {
    if (playing || !canSpin) return;
    setError("");
    reset();
    setPlaying(true);
    const res = await onDraw(); // server picks the winner NOW; nothing is awarded yet
    if ("error" in res) { setError(res.error); setPlaying(false); return; }
    setResult(res);
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    v.currentTime = 0;
    try { await v.play(); } catch { /* autoplay blocked — the user tapped, so this is rare */ setLanded(true); setRevealed(true); setShowCard(true); }
  };

  const onTime = () => {
    const v = videoRef.current;
    if (v && v.currentTime >= REVEAL_AT && !revealed) setRevealed(true);
  };
  const onEnded = () => {
    setRevealed(true); setLanded(true); setPlaying(false);
    cardTimer.current = setTimeout(() => setShowCard(true), 900);
  };

  const again = () => { reset(); setTimeout(pull, 80); };

  const confirmWin = async () => {
    if (!result || awarding) return;
    setAwarding(true);
    try { await onAward(result); reset(); }
    catch { setError("Couldn't save that just now — tap Done once more."); }
    setAwarding(false);
  };

  const w = Math.min(size, 1100);

  return (
    <div className="flex flex-col items-center w-full">
      {/* ── The machine ─────────────────────────────────────────────────────── */}
      <div
        className="relative rounded-3xl overflow-hidden bg-black shadow-[0_30px_80px_-30px_rgba(0,0,0,.9)] ring-1 ring-[#f0a35a]/20"
        style={{ width: w, maxWidth: "100%", aspectRatio: "16 / 9" }}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          preload="auto"
          muted={muted}
          onTimeUpdate={onTime}
          onEnded={onEnded}
          onError={() => { if (result) { setPlaying(false); setLanded(true); setRevealed(true); setShowCard(true); } }}
        >
          <source src={MACHINE_VIDEO_LOCAL} type="video/mp4" />
          <source src={MACHINE_VIDEO_CDN} type="video/mp4" />
        </video>

        {/* Name on the ticket — positioned over where the claw holds it in the last frame */}
        <div
          className={`absolute flex flex-col items-center justify-center text-center pointer-events-none transition-all duration-700 ${
            revealed && result ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
          style={{ left: "24%", top: "20%", width: "52%", height: "62%" }}
        >
          <div className="text-[#8a5a2b] font-black uppercase tracking-[0.28em]" style={{ fontSize: "clamp(9px, 1.4vw, 14px)" }}>Winner</div>
          <div
            className="font-display font-black text-[#241a12] leading-[1.02] break-words px-2"
            style={{ fontSize: "clamp(22px, 5vw, 56px)", textShadow: "0 1px 0 rgba(255,255,255,.6)" }}
          >
            {result?.winner.name}
          </div>
          {result?.winner.tickets != null && (
            <div className="text-[#6c4d39] font-bold mt-1" style={{ fontSize: "clamp(10px, 1.5vw, 15px)" }}>
              {result.winner.tickets.toLocaleString()} ticket{result.winner.tickets === 1 ? "" : "s"} in the drum
            </div>
          )}
          <div className="mt-2 bg-[#241a12] text-[#f0a35a] font-black uppercase tracking-[0.16em] rounded-full px-3 py-1" style={{ fontSize: "clamp(9px, 1.2vw, 12px)" }}>
            {brand}
          </div>
        </div>

        {/* Idle: pull button over the paused first frame */}
        {!playing && !landed && (
          <div className="absolute inset-0 flex items-end justify-center pb-6 bg-gradient-to-t from-black/60 via-transparent to-transparent">
            <button
              onClick={pull}
              disabled={!canSpin}
              className="bg-gradient-to-b from-[#f0a35a] to-[#c47b3e] text-[#241a12] font-black uppercase tracking-wider text-base sm:text-lg px-10 py-4 rounded-full shadow-[0_10px_30px_-8px_rgba(240,163,90,.7)] disabled:opacity-40 active:translate-y-px"
            >
              Pull a ticket
            </button>
          </div>
        )}
        {playing && (
          <div className="absolute top-3 left-3 text-[#fbf4e6]/80 text-xs font-bold uppercase tracking-widest bg-black/40 rounded-full px-3 py-1">
            Drawing
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-[#8a7559]">
        <span>{totalTickets.toLocaleString()} tickets · {entrants.length.toLocaleString()} people in the drum</span>
        <button onClick={() => { setMuted((m) => !m); if (videoRef.current) videoRef.current.muted = !muted; }} className="underline">
          Sound {muted ? "off" : "on"}
        </button>
      </div>

      {error && !showCard && <div className="mt-3 text-sm font-semibold text-red-600">{error}</div>}

      {/* ── Winner card (the screenshot / screen recording) ──────────────────
          Nothing on this screen hints that a draw can be redone. The only controls
          are a small, quiet X in the corner (which silently re-draws) and Done. */}
      {showCard && result && (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center p-4 bg-black/55">
          <button
            onClick={again}
            disabled={awarding}
            aria-label="Close"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-[#f1e7d5]/70 hover:text-[#f1e7d5] grid place-items-center disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
          </button>
          <div className="relative w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl bg-gradient-to-br from-[#f3ead6] via-[#fbf4e6] to-[#f7e4c9] border-4 border-[#f0a35a]/40">
            <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-[#f0a35a]/20 blur-2xl" aria-hidden />
            <div className="relative px-7 pt-8 pb-7 text-center">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#8a7559]">{brand}</div>
              <div className="text-sm font-bold text-[#6f5b46] mt-0.5">{giveawayTitle}</div>
              <div className="my-3 flex justify-center"><BidCritter className="w-20 h-20" /></div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-[#a85f28]">Winner</div>
              <div className="font-display text-4xl font-black text-[#241a12] leading-tight mt-1 break-words">{result.winner.name}</div>
              <div className="mt-4 inline-block rounded-2xl bg-white/70 border border-[#e3d6bf] px-5 py-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#8a7559]">Won</div>
                <div className="text-lg font-black text-[#6c4d39] leading-tight">{result.prize.title}</div>
              </div>
              <div className="mt-4 text-[11px] text-[#8a7559]">
                {result.winner.tickets != null ? `${result.winner.tickets.toLocaleString()} of ${totalTickets.toLocaleString()} tickets · ` : ""}
                {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </div>
            </div>
          </div>
          {error && <div className="mt-3 text-sm font-semibold text-[#fbe6c8] bg-black/40 rounded-lg px-3 py-1.5">{error}</div>}
          <button
            onClick={confirmWin}
            disabled={awarding}
            className="mt-5 bg-[#4a7c59] hover:bg-[#3c6449] text-white font-black px-10 py-3 rounded-xl text-base disabled:opacity-50 shadow-lg"
          >
            {awarding ? "Saving…" : "Done"}
          </button>
        </div>
      )}
    </div>
  );
}
