"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AuctionCountdown from "./AuctionCountdown";

export type HeroLot = {
  id: string;
  title: string;
  href: string;
  photo: string;
  currentBid: number;
  retailValue: number;
  bidCount: number;
  endsAt: string;
};

/**
 * The home hero — but instead of a static logo + tagline, it leads with the LIVE
 * auction itself: a spotlight card that rotates through the hottest lots, each with
 * its photo, current bid, a ticking countdown and a one-tap "Bid now". The auction
 * IS the hero. Rustic flair (pennant bunting, warm glow) frames it without stealing
 * focus. Built mobile-first — the spotlight is the first thing a phone user sees.
 */
export default function HomeHero({
  lots,
  liveCount,
  signedIn,
}: {
  lots: HeroLot[];
  liveCount: number;
  signedIn: boolean;
}) {
  const [i, setI] = useState(0);
  const paused = useRef(false);
  const n = lots.length;

  // Auto-advance the spotlight every 5s; pause while the visitor is touching/hovering
  // it so we never yank a lot out from under a tap.
  useEffect(() => {
    if (n <= 1) return;
    const id = setInterval(() => {
      if (!paused.current) setI((v) => (v + 1) % n);
    }, 5000);
    return () => clearInterval(id);
  }, [n]);

  if (n === 0) return null;
  const lot = lots[Math.min(i, n - 1)];
  const deal =
    lot.retailValue > 0 && lot.currentBid < lot.retailValue
      ? Math.round((1 - lot.currentBid / lot.retailValue) * 100)
      : null;

  return (
    <div className="relative max-w-5xl mx-auto">
      {/* Pennant bunting — the county-fair auction vibe, in our wood tones */}
      <Bunting />

      {/* Warm radial glow behind the spotlight so the card feels lit on stage */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 w-[min(560px,92vw)] h-[560px] rounded-full blur-3xl opacity-60"
        style={{ background: "radial-gradient(circle, rgba(212,160,90,0.35) 0%, rgba(212,160,90,0) 70%)" }}
      />

      <div className="relative text-center pt-3">
        {/* Live pill */}
        {liveCount > 0 && (
          <a
            href="#live-auctions"
            className="inline-flex items-center gap-2 bg-[#6c4d39] text-[#f6ecda] text-[11px] font-black uppercase tracking-[0.14em] px-4 py-2 rounded-full mb-4 shadow-[0_4px_16px_rgba(108,77,57,0.3)] hover:bg-[#563e2c] transition-colors"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#e07a3a] opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#f0a35a]" />
            </span>
            {liveCount} live auction{liveCount !== 1 ? "s" : ""} · bidding now
          </a>
        )}

        <h1 className="font-display text-[2.6rem] leading-[0.98] sm:text-6xl font-black tracking-tight text-[#241a12] mb-2">
          Going once.{" "}
          <span className="text-[#6c4d39] whitespace-nowrap">Going twice.</span>
        </h1>
        <p className="text-[#4a3a2b] font-semibold text-base sm:text-lg max-w-md mx-auto mb-6">
          Real deals on real stuff — up for grabs right now.
        </p>

        {/* ── The spotlight ── */}
        <div
          className="mx-auto w-[min(400px,100%)]"
          onMouseEnter={() => (paused.current = true)}
          onMouseLeave={() => (paused.current = false)}
          onTouchStart={() => (paused.current = true)}
        >
          <div
            key={lot.id}
            className="hero-pop relative rounded-[22px] bg-[#fbf4e6] border-[3px] border-[#6c4d39] shadow-[0_18px_44px_-14px_rgba(60,40,25,0.5)] overflow-hidden text-left"
          >
            {/* Photo */}
            <div className="relative aspect-[4/3] bg-[#efe3d0]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lot.photo}
                alt={lot.title}
                loading="eager"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover"
              />
              {/* top tags */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-[#6c4d39] text-[#f6ecda] text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow">
                <GavelIcon /> Live lot
              </div>
              {deal !== null && deal >= 25 && (
                <div className="absolute top-3 right-3 bg-[#4a7c59] text-white text-[11px] font-black px-2.5 py-1 rounded-full shadow">
                  {deal}% off retail
                </div>
              )}
              {/* soft bottom fade so the title band reads on any photo */}
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
              <p className="absolute bottom-2.5 left-3 right-3 text-white font-bold text-sm leading-snug line-clamp-2 drop-shadow">
                {lot.title}
              </p>
            </div>

            {/* Bid + countdown */}
            <div className="p-4">
              <div className="flex items-end justify-between gap-3 mb-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#8a7559]">
                    Current bid{lot.bidCount > 0 ? ` · ${lot.bidCount} bid${lot.bidCount !== 1 ? "s" : ""}` : ""}
                  </div>
                  <div className="text-[#241a12] font-black text-3xl leading-none tabular-nums">
                    ${lot.currentBid.toLocaleString()}
                  </div>
                </div>
                <div className="pb-0.5">
                  <AuctionCountdown targetIso={lot.endsAt} mode="ends" />
                </div>
              </div>

              <Link
                href={lot.href}
                className="flex items-center justify-center gap-2 w-full bg-[#6c4d39] hover:bg-[#563e2c] active:scale-[0.99] text-white font-black text-base py-3.5 rounded-xl transition-all shadow-[0_6px_18px_-4px_rgba(108,77,57,0.6)]"
              >
                <GavelIcon /> Bid now
              </Link>
            </div>
          </div>

          {/* Dots — which lot we're on, tappable */}
          {n > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-3">
              {lots.map((l, idx) => (
                <button
                  key={l.id}
                  type="button"
                  aria-label={`Show lot ${idx + 1}`}
                  onClick={() => setI(idx)}
                  className={`h-2 rounded-full transition-all ${
                    idx === i ? "w-6 bg-[#6c4d39]" : "w-2 bg-[#6c4d39]/30 hover:bg-[#6c4d39]/50"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 mt-6">
          <a
            href="#live-auctions"
            className="w-full sm:w-auto bg-white hover:bg-[#efe3d0] border-2 border-[#6c4d39]/25 text-[#6c4d39] font-bold px-7 py-3 rounded-xl text-base transition-colors shadow-sm text-center"
          >
            Browse all lots
          </a>
          {!signedIn && (
            <Link
              href="/sign-up"
              className="w-full sm:w-auto text-[#6c4d39] font-bold px-7 py-3 rounded-xl text-base hover:bg-[#6c4d39]/8 transition-colors text-center"
            >
              Create free account
            </Link>
          )}
        </div>
      </div>

      <style>{`
        @keyframes heroPop { 0% { opacity: 0; transform: translateY(10px) scale(0.985); } 100% { opacity: 1; transform: none; } }
        .hero-pop { animation: heroPop 0.45s cubic-bezier(0.2,0.7,0.2,1); }
      `}</style>
    </div>
  );
}

function GavelIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m14 4 6 6" />
      <path d="m10.5 7.5 6 6" />
      <path d="m3 21 6-6" />
      <path d="m7 11 6 6" />
      <path d="M4 17h6" />
    </svg>
  );
}

// A short string of triangle pennants across the top — subtle, in wood/moss tones.
function Bunting() {
  const colors = ["#6c4d39", "#4a7c59", "#c98a3c", "#8a6a4a", "#4a7c59", "#6c4d39", "#c98a3c", "#8a6a4a"];
  return (
    <svg
      aria-hidden
      viewBox="0 0 800 44"
      preserveAspectRatio="none"
      className="pointer-events-none absolute -top-1 left-0 w-full h-9 opacity-90"
    >
      <path d="M0 6 Q400 26 800 6" stroke="#6c4d39" strokeWidth="2" fill="none" opacity="0.5" />
      {colors.map((c, idx) => {
        const step = 800 / colors.length;
        const x = idx * step + step / 2;
        // follow the sag of the string a touch
        const t = (x / 800 - 0.5) * 2;
        const y = 8 + (1 - t * t) * 14;
        const w = 22;
        return (
          <path key={idx} d={`M${x - w / 2} ${y} L${x + w / 2} ${y} L${x} ${y + 20} Z`} fill={c} opacity="0.9" />
        );
      })}
    </svg>
  );
}
