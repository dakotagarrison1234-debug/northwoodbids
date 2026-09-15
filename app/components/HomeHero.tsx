"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import CountUp from "./CountUp";
import { PineMark } from "./Illustrations";

/**
 * The home hero — brand energy with depth and motion, auctions front and centre.
 * A slow looping northwoods lake video sits behind the copy; the foreground rises
 * in on load; a stat trio tallies up live numbers so the page feels ALIVE the
 * moment it opens. Under prefers-reduced-motion the video never mounts and the
 * still poster frame is shown instead.
 */
const REDUCE_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia(REDUCE_MOTION);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function getMotionOk() {
  return !window.matchMedia(REDUCE_MOTION).matches;
}

// Phones get a lighter 960px encode + poster; tablets/desktops get 1080p.
const PHONE = "(max-width: 640px)";
function subscribePhone(cb: () => void) {
  const mq = window.matchMedia(PHONE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function getIsPhone() {
  return window.matchMedia(PHONE).matches;
}

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
  // Only mount the looping video when the visitor hasn't asked for reduced
  // motion — they get the still poster frame instead (and no video download).
  const motionOk = useSyncExternalStore(subscribeMotion, getMotionOk, () => false);
  const isPhone = useSyncExternalStore(subscribePhone, getIsPhone, () => false);
  const heroSuffix = isPhone ? "-mobile" : "";

  const hasLive = liveAuctions > 0;

  return (
    <div className="relative">
      {/* ── Living backdrop ──
          A slow, seamless northern-Michigan lake loop (mist, water shimmer,
          swaying pines). The poster frame paints instantly; the video fades in
          over it once playing. Cream washes keep the headline readable and
          blend the bottom edge into the page. The art is anchored to its bottom
          edge (sky crops first) and the deer sits right of the CTA column, so
          no copy lands on it at phone or desktop widths. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <picture>
          <source media="(max-width: 640px)" srcSet="/hero/northwoods-poster-mobile.webp" />
          <img
            src="/hero/northwoods-poster.webp"
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-[50%_100%]"
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        {motionOk && (
          <video
            key={heroSuffix}
            className="nb-hero-video absolute inset-0 w-full h-full object-cover object-[50%_100%]"
            src={`/hero/northwoods-loop${heroSuffix}.mp4`}
            poster={`/hero/northwoods-poster${heroSuffix}.webp`}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onPlaying={(e) => e.currentTarget.classList.add("is-playing")}
          />
        )}
        {/* readability wash: soft cream glow behind the copy */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 44% 40% at 50% 40%, rgba(241,231,213,0.72) 0%, rgba(241,231,213,0.4) 60%, rgba(241,231,213,0) 100%)",
          }}
        />
        {/* top + bottom fades into the page background */}
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#f1e7d5] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#f1e7d5] to-transparent" />
      </div>

      {/* ── Foreground ── */}
      <div className="relative max-w-3xl mx-auto px-5 sm:px-8 pt-10 sm:pt-16 pb-28 sm:pb-36 text-center">
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
          className="nb-rise font-display text-[3rem] leading-[0.94] sm:text-7xl font-black tracking-tight text-[#241a12] mb-3"
          style={{ animationDelay: "120ms" }}
        >
          Going once.
          <br />
          <span className="nb-gradient-text">Going twice.</span>
        </h1>
        <p
          className="nb-rise text-[#6f5b46] text-sm sm:text-base font-medium mb-7 max-w-md mx-auto leading-snug"
          style={{ animationDelay: "200ms" }}
        >
          Name-brand overstock, every lot from $2. Bid online, pick up in Owosso or Gladwin.
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
