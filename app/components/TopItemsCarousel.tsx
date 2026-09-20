"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ItemCardTimer from "@/app/components/ItemCardTimer";
import SectionHeader from "@/app/components/SectionHeader";
import QuickBidModal from "@/app/components/QuickBidModal";

export type TopItem = {
  id: string;
  title: string;
  href: string;
  photo: string;
  currentBid: number;
  retailValue: number;
  bidCount: number;
  endsAt: string;
};

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * Slowly self-scrolling, swipeable showcase of the hottest live lots. Auto-advances
 * with requestAnimationFrame; pauses while the person is touching/hovering so a
 * swipe isn't fought. The list is duplicated so the loop is seamless (when it passes
 * the halfway point we jump back by half — invisible since the halves are identical).
 */
export default function TopItemsCarousel({ items }: { items: TopItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const paused = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    const SPEED = 45; // px per second
    const tick = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      if (!paused.current && el.scrollWidth > el.clientWidth + 4) {
        el.scrollLeft += SPEED * dt;
        const half = el.scrollWidth / 2;
        if (el.scrollLeft >= half) el.scrollLeft -= half;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const pause = () => { paused.current = true; };
  const resume = () => { paused.current = false; };
  const resumeSoon = () => { setTimeout(() => { paused.current = false; }, 1800); };

  const loop = [...items, ...items];
  const [quick, setQuick] = useState<TopItem | null>(null);

  return (
    <section className="max-w-6xl mx-auto px-6 sm:px-8 pt-8">
      {quick && <QuickBidModal itemId={quick.id} href={quick.href} onClose={() => setQuick(null)} />}
      <SectionHeader
        variant="hot"
        eyebrow="Most bid-on right now"
        title="Heating Up"
        tagline="The lots everyone's fighting over across every live auction."
      />
      <div
        ref={ref}
        onMouseEnter={pause}
        onMouseLeave={resume}
        onTouchStart={pause}
        onTouchEnd={resumeSoon}
        className="flex gap-3 overflow-x-auto pt-2 -mt-2 pb-3 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {loop.map((it, i) => {
          const off =
            it.retailValue > 0 && it.currentBid < it.retailValue
              ? Math.round((1 - it.currentBid / it.retailValue) * 100)
              : 0;
          return (
            <Link
              key={`${it.id}-${i}`}
              href={it.href}
              className="group nb-lift shrink-0 w-40 sm:w-44 bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden hover:border-[#c47b3e]/50"
            >
              <div className="relative aspect-square bg-[#faf5ea] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.photo} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300" />
                <ItemCardTimer itemId={it.id} endAt={it.endsAt} />
                {off >= 20 && (
                  <span className="absolute bottom-2 right-2 z-10 rounded-md bg-[#c47b3e] text-white text-[10px] font-black px-1.5 py-0.5 shadow-sm tabular-nums">
                    {off}% off
                  </span>
                )}
              </div>
              <div className="p-2.5">
                <div className="text-sm font-semibold text-[#241a12] leading-tight line-clamp-2 min-h-[2.5em] group-hover:text-[#6c4d39] transition-colors">
                  {it.title}
                </div>
                <div className="mt-2 flex items-end justify-between gap-1">
                  <div className="leading-none">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-[#8a7559]">Current bid</div>
                    <div className="mt-0.5 font-display text-lg font-black text-[#4a7c59] tabular-nums">{money(it.currentBid)}</div>
                  </div>
                  {it.bidCount > 0 && (
                    <span className="text-[10px] font-black text-[#a85f28] bg-[#f7e4c9] px-1.5 py-0.5 rounded-full whitespace-nowrap tabular-nums">
                      {it.bidCount} bid{it.bidCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {it.retailValue > 0 && (
                  <div className="text-[11px] text-[#8a7559] mt-1 tabular-nums">
                    Retail <span className="line-through">{money(it.retailValue)}</span>
                  </div>
                )}
                {/* Quick bid: opens the pop-up right here; the rest of the card still links out. */}
                <div
                  role="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQuick(it); }}
                  className="mt-2 block w-full text-center rounded-xl py-1.5 text-xs font-bold bg-[#6c4d39] text-white hover:bg-[#563e2c] transition-colors"
                >
                  Bid now
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
