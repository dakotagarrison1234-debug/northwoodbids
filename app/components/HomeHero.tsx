"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import CountUp from "./CountUp";
import { PineMark } from "./Illustrations";
import type { HeroSeason } from "@/lib/heroSeason";
import { HeroHalloween, useHalloween, useHeroBand } from "./Halloween";

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
  season = "summer",
  welcome = null,
}: {
  liveAuctions: number;
  liveLots: number;
  bidsToday: number;
  bestDeal: number;
  signedIn: boolean;
  season?: HeroSeason;
  /** Signed in: swap the pitch for a welcome-back board. */
  welcome?: { name: string; winning: number; outbid: number } | null;
}) {
  // Only mount the looping video when the visitor hasn't asked for reduced
  // motion — they get the still poster frame instead (and no video download).
  const motionOk = useSyncExternalStore(subscribeMotion, getMotionOk, () => false);
  const isPhone = useSyncExternalStore(subscribePhone, getIsPhone, () => false);
  // Halloween week swaps the lake loop for the haunted transformation (Halloween.tsx).
  const halloween = useHalloween();
  // Phones: the Halloween video sits above the copy as an uncropped 16:9 picture.
  const band = useHeroBand();
  // Asset names: northwoods-{loop|poster}[-winter][-mobile].{mp4|webp}
  const seasonTag = season === "winter" ? "-winter" : "";
  const heroSuffix = `${seasonTag}${isPhone ? "-mobile" : ""}`;
  // Summer/fall: the Michigan lakeshore with the Bid Critters (Higgsfield CDN).
  // Winter (Dec 1 – Jan 31): the snowy lake loop in /public/hero.
  const winter = season === "winter";
  const videoSrc = winter ? `/hero/northwoods-loop${heroSuffix}.mp4` : isPhone ? MI.videoMobile : MI.video;
  const posterSrc = winter ? `/hero/northwoods-poster${heroSuffix}.webp` : isPhone ? MI.posterMobile : MI.poster;

  const hasLive = liveAuctions > 0;

  // Summer/fall, every width: the thin Michigan strip with everything on it.
  if (!halloween && !winter) {
    return (
      <ThinHero
        liveAuctions={liveAuctions}
        liveLots={liveLots}
        bidsToday={bidsToday}
        bestDeal={bestDeal}
        signedIn={signedIn}
        welcome={welcome}
        motionOk={motionOk}
        isPhone={isPhone}
      />
    );
  }

  return (
    <div className="relative">
      {/* ── Living backdrop ──
          A slow, seamless northern-Michigan lake loop (mist, water shimmer,
          swaying pines) — a snowy winter cut runs Dec 1 – Jan 31. The poster frame paints instantly; the video fades in
          over it once playing. Cream washes keep the headline readable and
          blend the bottom edge into the page. The art is anchored to its bottom
          edge (sky crops first) and the deer sits right of the CTA column, so
          no copy lands on it at phone or desktop widths. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <picture>
          <source media="(max-width: 640px)" srcSet={winter ? `/hero/northwoods-poster-winter-mobile.webp` : MI.posterMobile} />
          <img
            src={winter ? `/hero/northwoods-poster-winter.webp` : MI.poster}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-[50%_100%]"
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        {motionOk && !halloween && (
          <video
            key={videoSrc}
            className="nb-hero-video absolute inset-0 w-full h-full object-cover object-[50%_100%]"
            src={videoSrc}
            poster={posterSrc}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onPlaying={(e) => e.currentTarget.classList.add("is-playing")}
          />
        )}
        {/* Halloween week only (Oct 20-31): the lake turns haunted, then holds */}
        {band ? (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_0%,#f6d8ad_0%,#f1e7d5_70%)]" />
        ) : (
          <HeroHalloween motionOk={motionOk} />
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
      {/* Phones in Halloween week: an edge-to-edge 16:9 video header (nothing cropped),
          headline on its sky, everything else below it. */}
      {band && (
        <div className={`relative w-full aspect-video overflow-hidden ${halloween ? "nb-hw-text" : ""}`}>
          <HeroHalloween motionOk={motionOk} />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-[#f1e7d5] to-transparent" />
          <div className="absolute inset-x-0 top-0 px-4 pt-[3.5%] text-center">
            {welcome ? (
              <>
                <p className="nb-rise nb-hw-halo text-[#3d2c1d] text-[13px] font-bold" style={{ animationDelay: "40ms" }}>
                  Welcome back,
                </p>
                <h1
                  className="nb-rise font-display text-[clamp(1.7rem,8.5vw,2.75rem)] leading-[1.05] font-black tracking-tight text-[#241a12] truncate py-0.5"
                  style={{ animationDelay: "120ms" }}
                >
                  {welcome.name}
                </h1>
                <Link
                  href="/dashboard"
                  className="nb-rise mt-2 inline-block bg-[#6c4d39] hover:bg-[#563e2c] active:scale-[0.99] text-white font-black px-9 py-2.5 rounded-xl text-[15px] transition-all shadow-[0_8px_24px_-6px_rgba(108,77,57,0.65)]"
                  style={{ animationDelay: "200ms" }}
                >
                  My Bids
                </Link>
              </>
            ) : (
              <h1
                className="nb-rise font-display text-[clamp(1.75rem,8.6vw,2.75rem)] leading-[0.98] font-black tracking-tight text-[#241a12]"
                style={{ animationDelay: "120ms" }}
              >
                Going once.
                <br />
                <span className="nb-gradient-text">Going twice.</span>
              </h1>
            )}
          </div>
        </div>
      )}
      {welcome ? (
        band ? null /* phones in Halloween week: name + My Bids are on the video header */ : (
          <WelcomeBack welcome={welcome} liveAuctions={liveAuctions} halloween={halloween} />
        )
      ) : (
      <div className={`relative max-w-3xl mx-auto px-5 sm:px-8 ${band ? "pt-4 pb-14" : "pt-10 pb-28 sm:pt-16"} sm:pb-36 text-center ${halloween ? "nb-hw-text" : ""}`}>
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

        {/* headline (on phones in Halloween week it sits on the video header instead) */}
        {!band && <h1
          className="nb-rise font-display text-[3rem] leading-[0.94] sm:text-7xl font-black tracking-tight text-[#241a12] mb-3"
          style={{ animationDelay: "120ms" }}
        >
          Going once.
          <br />
          <span className="nb-gradient-text">Going twice.</span>
        </h1>}
        <p
          className="nb-rise text-[#6f5b46] text-sm sm:text-base font-medium mb-7 max-w-md mx-auto leading-snug"
          style={{ animationDelay: "200ms" }}
        >
          Name-brand overstock, every lot from $2. Bid online, pick up in Corunna or Gladwin.
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
      )}
    </div>
  );
}

/** Michigan lakeshore loop with the Bid Critters (Higgsfield, Nov 2026). */
const MI_CDN = "https://d2ol7oe51mr4n9.cloudfront.net/user_3IByyQncVzaXbwKjQO3GCQGqPd7";
const MI = {
  video: `${MI_CDN}/2eefe59b-3494-4b22-8590-30783ced1830.mp4`,
  videoMobile: `${MI_CDN}/004bac14-3e80-4316-9e73-4aa2406abaf8.mp4`,
  poster: `${MI_CDN}/5071af71-fa1d-4286-bbc3-177c5c64073f.webp`,
  posterMobile: `${MI_CDN}/3092f732-ad8f-4ff4-bacc-be6ab4cf1e55.webp`,
};

/**
 * The thin Michigan strip: a full-width band (16:9 phones, 21:9 wider, capped at
 * 720px) with the whole hero ON the video, laid out around the critters:
 *   top centre (open sky)   — live pill, headline, and on desktop the pitch line
 *   bottom centre (lake)    — desktop: the three numbers + both buttons
 *                             phones: the two buttons, small, side by side
 * Phones drop the pitch line and numbers so the strip stays thin and the animals
 * on both sides stay in view.
 */
function ThinHero({
  liveAuctions,
  liveLots,
  bidsToday,
  bestDeal,
  signedIn,
  welcome,
  motionOk,
  isPhone,
}: {
  liveAuctions: number;
  liveLots: number;
  bidsToday: number;
  bestDeal: number;
  signedIn: boolean;
  welcome: { name: string; winning: number; outbid: number } | null;
  motionOk: boolean;
  isPhone: boolean;
}) {
  const hasLive = liveAuctions > 0;
  const src = isPhone ? MI.videoMobile : MI.video;
  const poster = isPhone ? MI.posterMobile : MI.poster;
  const halo = "[text-shadow:0_0_12px_rgba(251,244,230,0.95),0_0_2px_rgba(251,244,230,0.9)]";
  const btn = "inline-flex items-center justify-center rounded-xl font-black transition-all active:scale-[0.99] text-center";
  return (
    <div className="relative w-full aspect-video sm:aspect-[21/9] sm:max-h-[720px] overflow-hidden bg-[#f1e7d5]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover object-[50%_40%]" fetchPriority="high" decoding="async" />
        {motionOk && (
          <video
            key={src}
            className="nb-hero-video absolute inset-0 w-full h-full object-cover object-[50%_40%]"
            src={src}
            poster={poster}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onPlaying={(e) => e.currentTarget.classList.add("is-playing")}
          />
        )}
        <div className="absolute inset-x-0 top-0 h-[55%] bg-[radial-gradient(ellipse_36%_70%_at_50%_10%,rgba(251,244,230,0.6)_0%,rgba(251,244,230,0.2)_60%,rgba(251,244,230,0)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-3 sm:h-8 bg-gradient-to-t from-[#f1e7d5] to-transparent" />
      </div>

      {/* ── top centre: on the sky ── */}
      <div className="absolute inset-x-0 top-0 pt-2 sm:pt-[2.4%] px-3 flex flex-col items-center text-center">
        {welcome ? (
          <>
            <p className={`nb-rise text-[#3d2c1d] text-[12px] sm:text-lg font-bold leading-none ${halo}`} style={{ animationDelay: "40ms" }}>Welcome back,</p>
            <h1
              className={`nb-rise font-display text-[clamp(1.4rem,7vw,2.1rem)] sm:text-[clamp(2.4rem,4.4vw,4rem)] leading-[1.05] font-black tracking-tight text-[#241a12] max-w-[62%] sm:max-w-[46%] truncate mt-0.5 sm:mt-1 ${halo}`}
              style={{ animationDelay: "120ms" }}
            >
              {welcome.name}
            </h1>
          </>
        ) : (
          <>
            {hasLive && (
              <a
                href="#live-auctions"
                className="nb-rise pointer-events-auto inline-flex items-center gap-1.5 sm:gap-2 bg-[#6c4d39] text-[#f6ecda] text-[10px] sm:text-[11px] font-black uppercase tracking-[0.14em] px-2.5 sm:px-4 py-[3px] sm:py-1.5 rounded-full mb-1 sm:mb-2 shadow-[0_6px_20px_-6px_rgba(108,77,57,0.7)] hover:bg-[#563e2c] transition-colors"
                style={{ animationDelay: "40ms" }}
              >
                <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#e07a3a] opacity-75 animate-ping" />
                  <span className="relative inline-flex h-full w-full rounded-full bg-[#f0a35a]" />
                </span>
                {liveAuctions} live<span className="hidden sm:inline">&nbsp;auction{liveAuctions !== 1 ? "s" : ""}</span> · bidding now
              </a>
            )}
            <h1
              className={`nb-rise font-display text-[clamp(1.35rem,6.6vw,1.9rem)] sm:text-[clamp(2.3rem,4.2vw,3.75rem)] leading-[0.92] font-black tracking-tight text-[#241a12] ${halo}`}
              style={{ animationDelay: "120ms" }}
            >
              Going once.
              <br />
              <span className="text-[#2f5d3a]">Going twice.</span>
            </h1>
            <p
              className={`hidden lg:block nb-rise mt-1.5 text-[#3d2c1d] text-[15px] font-semibold whitespace-nowrap ${halo}`}
              style={{ animationDelay: "200ms" }}
            >
              Name-brand overstock, every lot from $2. Bid online, pick up in Corunna or Gladwin.
            </p>
          </>
        )}
      </div>

      {/* ── bottom centre: on the lake, between the critters ── */}
      <div className="absolute inset-x-0 bottom-0 pb-2 sm:pb-[2.6%] px-3 flex flex-col items-center gap-2 sm:gap-2.5">
        {welcome ? (
          <>
            <div className="hidden sm:grid nb-rise grid-cols-3 gap-2.5 w-[430px]" style={{ animationDelay: "220ms" }}>
              {[
                { href: "/dashboard?tab=winning", value: welcome.winning, label: "Winning", tone: "text-[#2f5d3a]" },
                { href: "/dashboard?tab=losing", value: welcome.outbid, label: "Outbid", tone: welcome.outbid > 0 ? "text-[#b42318]" : "text-[#241a12]" },
                { href: "#live-auctions", value: liveAuctions, label: liveAuctions === 1 ? "Live auction" : "Live auctions", tone: "text-[#241a12]" },
              ].map((c) => (
                <Link key={c.label} href={c.href} className="rounded-2xl bg-[#fbf4e6]/90 border border-[#6c4d39]/15 backdrop-blur-sm py-3 px-1 text-center shadow-sm hover:border-[#6c4d39]/40 transition-colors">
                  <div className={`font-display font-black text-4xl leading-none tabular-nums ${c.tone}`}>
                    <CountUp value={c.value} />
                  </div>
                  <div className="mt-1 text-[13px] font-bold uppercase tracking-wide text-[#8a7559]">{c.label}</div>
                </Link>
              ))}
            </div>
            <Link
              href="/dashboard"
              className={`${btn} nb-rise bg-[#6c4d39] hover:bg-[#563e2c] text-white text-[13px] sm:text-base h-8 sm:h-12 w-[140px] sm:w-[430px] shadow-[0_8px_24px_-6px_rgba(36,26,18,0.6)]`}
              style={{ animationDelay: "300ms" }}
            >
              My Bids
            </Link>
          </>
        ) : (
          <>
            <div className="hidden sm:grid nb-rise grid-cols-3 gap-2.5 w-[430px]" style={{ animationDelay: "260ms" }}>
              <Stat value={liveLots} label={liveLots === 1 ? "lot live" : "lots live"} solid />
              <Stat value={bestDeal} suffix="%" label="off retail" accent solid />
              <Stat value={bidsToday} label="bids today" solid />
            </div>
            <div className={`nb-rise grid gap-2 sm:gap-2.5 ${signedIn ? "grid-cols-1 w-[140px] sm:w-[260px]" : "grid-cols-2 w-[244px] sm:w-[430px]"}`} style={{ animationDelay: "340ms" }}>
              <a
                href="#live-auctions"
                className={`${btn} bg-[#6c4d39] hover:bg-[#563e2c] text-white text-[13px] sm:text-base h-8 sm:h-12 shadow-[0_8px_24px_-6px_rgba(36,26,18,0.6)]`}
              >
                {hasLive ? "Start bidding" : "See what's coming"}
              </a>
              {!signedIn && (
                <Link
                  href="/sign-up"
                  className={`${btn} bg-[#fbf4e6]/95 hover:bg-white border-2 border-[#6c4d39]/25 text-[#6c4d39] text-[13px] sm:text-base h-8 sm:h-12 shadow-sm`}
                >
                  <span className="sm:hidden">Join free</span>
                  <span className="hidden sm:inline">Create free account</span>
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Signed-in hero: "Welcome back, <name>", three tappable cards (winning,
 * outbid, live auctions) and a My Bids button. Nothing else, so the backdrop
 * stays open around it.
 */
function WelcomeBack({
  welcome,
  liveAuctions,
  halloween,
}: {
  welcome: { name: string; winning: number; outbid: number };
  liveAuctions: number;
  halloween: boolean;
}) {
  const cards = [
    { href: "/dashboard?tab=winning", value: welcome.winning, label: "Winning", tone: "text-[#2f5d3a]", ring: "hover:border-[#4a7c59]/60" },
    { href: "/dashboard?tab=losing", value: welcome.outbid, label: "Outbid", tone: welcome.outbid > 0 ? "text-[#b42318]" : "text-[#241a12]", ring: "hover:border-[#b42318]/50" },
    { href: "#live-auctions", value: liveAuctions, label: liveAuctions === 1 ? "Live auction" : "Live auctions", tone: "text-[#241a12]", ring: "hover:border-[#6c4d39]/50" },
  ];
  return (
    <div className={`relative max-w-3xl mx-auto px-5 sm:px-8 pt-12 sm:pt-20 pb-28 sm:pb-40 text-center ${halloween ? "nb-hw-text" : ""}`}>
      <p className="nb-rise nb-hw-halo text-[#6f5b46] text-base sm:text-lg font-semibold" style={{ animationDelay: "40ms" }}>
        Welcome back,
      </p>
      <h1
        className="nb-rise font-display text-[2.6rem] leading-[0.98] sm:text-7xl font-black tracking-tight text-[#241a12] mt-1 mb-8 sm:mb-10 break-words"
        style={{ animationDelay: "120ms" }}
      >
        {welcome.name}
      </h1>

      <div className="nb-rise grid grid-cols-3 gap-2 sm:gap-4 max-w-xl mx-auto mb-6 sm:mb-8" style={{ animationDelay: "220ms" }}>
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={`rounded-2xl bg-[#fbf4e6]/85 border border-[#6c4d39]/15 backdrop-blur-sm py-3.5 sm:py-5 px-1.5 shadow-sm transition-colors ${c.ring}`}
          >
            <div className={`font-display font-black text-3xl sm:text-5xl leading-none tabular-nums ${c.tone}`}>
              <CountUp value={c.value} />
            </div>
            <div className="mt-1.5 text-[11px] sm:text-[13px] font-bold uppercase tracking-wide text-[#8a7559]">{c.label}</div>
          </Link>
        ))}
      </div>

      <div className="nb-rise flex justify-center" style={{ animationDelay: "300ms" }}>
        <Link
          href="/dashboard"
          className="w-full sm:w-auto bg-[#6c4d39] hover:bg-[#563e2c] active:scale-[0.99] text-white font-black px-10 py-3.5 rounded-xl text-base transition-all shadow-[0_8px_24px_-6px_rgba(108,77,57,0.65)] text-center"
        >
          My Bids
        </Link>
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  suffix = "",
  accent = false,
  solid = false,
}: {
  value: number;
  label: string;
  suffix?: string;
  accent?: boolean;
  /** On the phone video: a more opaque card so it reads over the water. */
  solid?: boolean;
}) {
  return (
    <div className={`rounded-2xl ${solid ? "bg-[#fbf4e6]/90" : "bg-[#fbf4e6]/70"} border border-[#6c4d39]/15 backdrop-blur-sm py-3 px-1.5 shadow-sm`}>
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
