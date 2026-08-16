"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import ItemCardTimer from "@/app/components/ItemCardTimer";

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
    const SPEED = 28; // px per second
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

  return (
    <section className="max-w-6xl mx-auto px-6 sm:px-8 pt-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#241a12]">🔥 Hot right now</span>
        <span className="text-[#8a7559] text-sm font-medium hidden sm:inline">— most-bid lots across live auctions</span>
      </div>
      <div
        ref={ref}
        onMouseEnter={pause}
        onMouseLeave={resume}
        onTouchStart={pause}
        onTouchEnd={resumeSoon}
        className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {loop.map((it, i) => (
          <Link
            key={`${it.id}-${i}`}
            href={it.href}
            className="group shrink-0 w-40 sm:w-44 bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden hover:border-[#6c4d39]/40 hover:shadow-[0_4px_18px_rgba(108,77,57,0.10)] transition-all"
          >
            <div className="relative aspect-square bg-[#faf5ea] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.photo} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform" />
              <ItemCardTimer itemId={it.id} endAt={it.endsAt} />
            </div>
            <div className="p-2.5">
              <div className="text-sm font-semibold text-[#241a12] leading-tight line-clamp-2 min-h-[2.5em]">{it.title}</div>
              <div className="mt-1.5 flex items-center justify-between gap-1">
                <span className="text-base font-extrabold text-[#4a7c59] tabular-nums">{money(it.currentBid)}</span>
                {it.bidCount > 0 && (
                  <span className="text-[11px] font-bold text-[#8a5a2b] bg-[#f6ecda] border border-[#e3c9a3] px-1.5 py-0.5 rounded-full whitespace-nowrap">
                    {it.bidCount} bid{it.bidCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              {it.retailValue > 0 && (
                <div className="text-[11px] text-[#8a7559] mt-0.5">MSRP {money(it.retailValue)}</div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
