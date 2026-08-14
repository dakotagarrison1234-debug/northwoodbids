"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CountUp from "./CountUp";
import { MountainRange, PineRidge, PineMark } from "./Illustrations";

/**
 * The home hero — brand energy with depth and motion, auctions front and centre.
 * Layered parallax backdrop (mountains drift slow, pines drift faster) gives the
 * scene real depth as you scroll; the foreground rises in on load; a stat trio
 * tallies up live numbers so the page feels ALIVE the moment it opens. Built
 * mobile-first — the parallax is transform-only (cheap on phones) and everything
 * collapses gracefully under prefers-reduced-motion.
 */
export default function HomeHero({
  liveAuctions,
  liveLots,
  bidsToday,
  bestDeal,
  signedIn,
}: {
  liveAuctions: number;
  liveLots: number;
  bidsToday: number;
  bestDeal: number;
  signedIn: boolean;
}) {
  const [y, setY] = useState(0);

  // Parallax: track scroll and offset the two backdrop layers by different amounts.
  useEffect(() => {
    const reduce =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        setY(window.scrollY);
        raf = 0;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const hasLive = liveAuctions > 0;

  return (
    <div className="relative">
      {/* ── Parallax backdrop ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* warm sun/glow */}
        <div
          className="nb-glow absolute left-1/2 top-6 w-[min(620px,96vw)] h-[420px] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(212,160,90,0.4) 0%, rgba(212,160,90,0) 68%)",
            transform: `translate(-50%, ${y * 0.12}px)`,
          }}
        />
        {/* far mountains — slow drift */}
        <div
          className="absolute bottom-0 left-0 w-full"
          style={{ transform: `translateY(${y * 0.06}px)` }}
        >
          <MountainRange className="w-full h-[240px] opacity-25" />
        </div>
        {/* near pines — faster drift */}
        <div
          className="absolute -bottom-1 left-0 w-full"
          style={{ transform: `translateY(${y * 0.22}px)` }}
        >
          <PineRidge className="w-full h-28" />
        </div>
      </div>

      {/* ── Foreground ── */}
      <div className="relative max-w-3xl mx-auto px-1 pt-6 sm:pt-10 pb-4 text-center">
        {/* live pill */}
        {hasLive && (
          <a
            href="#live-auctions"
            className="nb-rise inline-flex items-center gap-2 bg-[#6c4d39] text-[#f6ecda] text-[11px] font-black uppercase tracking-[0.16em] px-4 py-2 rounded-full mb-5 shadow-[0_6px_20px_-6px_rgba(108,77,57,0.7)] hover:bg-[#563e2c] transition-colors"
            style={{ animationDelay: "40ms" }}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#e07a3a] opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#f0a35a]" />
            </span>
            {liveAuctions} live auction{liveAuctions !== 1 ? "s" : ""} · bidding now
          </a>
        )}

        {/* headline */}
        <h1
          className="nb-rise font-display text-[3rem] leading-[0.94] sm:text-7xl font-black tracking-tight text-[#241a12] mb-4"
          style={{ animationDelay: "120ms" }}
        >
          Going once.
          <br />
          <span className="nb-gradient-text">Going twice.</span>
        </h1>

        <p
          className="nb-rise text-[#3a2c1e] font-semibold text-base sm:text-xl max-w-lg mx-auto mb-7"
          style={{ animationDelay: "200ms" }}
        >
          Local online auctions on brand-name overstock, returns &amp; surplus —
          real deals, ending live.
        </p>

        {/* stat trio */}
        <div
          className="nb-rise grid grid-cols-3 gap-2 sm:gap-4 max-w-lg mx-auto mb-8"
          style={{ animationDelay: "280ms" }}
        >
          <Stat value={liveLots} label={liveLots === 1 ? "lot live" : "lots live"} />
          <Stat value={bestDeal} suffix="%" label="off retail" accent />
          <Stat value={bidsToday} label="bids today" />
        </div>

        {/* CTAs */}
        <div
          className="nb-rise flex flex-col sm:flex-row items-center justify-center gap-2.5"
          style={{ animationDelay: "360ms" }}
        >
          <a
            href="#live-auctions"
            className="w-full sm:w-auto bg-[#6c4d39] hover:bg-[#563e2c] active:scale-[0.99] text-white font-black px-8 py-3.5 rounded-xl text-base transition-all shadow-[0_8px_24px_-6px_rgba(108,77,57,0.65)] text-center"
          >
            {hasLive ? "Start bidding" : "See what's coming"}
          </a>
          {!signedIn && (
            <Link
              href="/sign-up"
              className="w-full sm:w-auto bg-white/80 hover:bg-white border-2 border-[#6c4d39]/20 text-[#6c4d39] font-bold px-8 py-3.5 rounded-xl text-base transition-colors text-center shadow-sm"
            >
              Create free account
            </Link>
          )}
        </div>

        {/* scroll cue */}
        <div className="nb-rise flex justify-center mt-9" style={{ animationDelay: "460ms" }}>
          <a href="#live-auctions" aria-label="Scroll to live auctions" className="text-[#6c4d39]/70 hover:text-[#6c4d39]">
            <span className="nb-cue inline-block">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  suffix = "",
  accent = false,
}: {
  value: number;
  label: string;
  suffix?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-[#fbf4e6]/70 border border-[#6c4d39]/15 backdrop-blur-sm py-3 px-1.5 shadow-sm">
      <div className={`font-display font-black text-2xl sm:text-4xl leading-none tabular-nums ${accent ? "text-[#4a7c59]" : "text-[#241a12]"}`}>
        <CountUp value={value} suffix={suffix} />
      </div>
      <div className="mt-1 flex items-center justify-center gap-1 text-[10px] sm:text-xs font-bold uppercase tracking-wide text-[#8a7559]">
        <PineMark className="w-3 h-3 opacity-70" />
        {label}
      </div>
    </div>
  );
}
