"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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

/** px per second each row drifts. */
const SPEED = 38;
const EDGE_FADE = "linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%)";

/**
 * "Heating Up": the hottest live lots on two full-width rows that drift
 * constantly in opposite directions (top row left, bottom row right). Each row
 * is its list repeated, moved with a transform and wrapped by exactly one
 * copy's width, so the loop never shows a seam or an empty end. A finger or mouse can drag a
 * row (with a little glide on release); a drag never opens the card it started
 * on. Hovering with a mouse pauses a row. Rows sleep while off screen, and
 * under reduced motion they only move when dragged. Fewer than 8 lots: one row.
 */
export default function TopItemsCarousel({ items }: { items: TopItem[] }) {
  const [quick, setQuick] = useState<TopItem | null>(null);
  const rows = items.length >= 8 ? [items.filter((_, i) => i % 2 === 0), items.filter((_, i) => i % 2 === 1)] : [items];

  return (
    <section className="pt-3 sm:pt-8">
      {quick && <QuickBidModal itemId={quick.id} href={quick.href} onClose={() => setQuick(null)} />}
      <div className="max-w-6xl mx-auto px-6 sm:px-8">
        <SectionHeader compact variant="hot" eyebrow="Most bid-on right now" title="Heating Up" tagline="The lots everyone's fighting over." />
      </div>
      <div className="space-y-2">
        {rows.map((row, r) => (
          <DriftRow key={r} items={row} dir={r === 0 ? -1 : 1} onBid={setQuick} />
        ))}
      </div>
    </section>
  );
}

function DriftRow({ items, dir, onBid }: { items: TopItem[]; dir: -1 | 1; onBid: (it: TopItem) => void }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  // Per-frame state lives in a ref, never React state.
  const s = useRef({ x: 0, period: 0, vel: 0, hover: false, visible: true, drag: null as null | { id: number; startX: number; startOff: number; lastX: number; lastT: number; moved: boolean }, suppressClick: false });

  useEffect(() => {
    const row = rowRef.current;
    const track = trackRef.current;
    if (!row || !track) return;
    const st = s.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const measure = () => {
      // One copy's width = distance from the first card to the first card of the second copy.
      const kids = track.children;
      const n = items.length;
      st.period = n >= 1 && kids.length > n ? (kids[n] as HTMLElement).offsetLeft - (kids[0] as HTMLElement).offsetLeft : 0;
    };
    const wrap = () => {
      if (st.period <= 0) return;
      while (st.x <= -st.period) st.x += st.period;
      while (st.x > 0) st.x -= st.period;
    };
    const paint = () => { track.style.transform = `translate3d(${st.x.toFixed(2)}px,0,0)`; };

    measure();
    // Rows moving right start half a copy in so there are cards on the left from frame one.
    if (dir === 1) st.x = -st.period / 2;
    paint();

    const ro = new ResizeObserver(() => { measure(); wrap(); paint(); });
    ro.observe(track);
    const io = new IntersectionObserver(([e]) => { st.visible = e.isIntersecting; }, { rootMargin: "100px" });
    io.observe(row);

    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(t - last, 50);
      last = t;
      if (st.visible && !st.drag) {
        if (Math.abs(st.vel) > 0.01) {
          st.x += st.vel * dt; // glide after a fling
          st.vel *= Math.pow(0.94, dt / 16.7);
        } else {
          st.vel = 0;
          if (!reduce && !st.hover) st.x += (dir * SPEED * dt) / 1000;
        }
        wrap();
        paint();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      st.vel = 0;
      st.suppressClick = false; // a touch drag fires no click, so never carry this over to the next tap
      st.drag = { id: e.pointerId, startX: e.clientX, startOff: st.x, lastX: e.clientX, lastT: e.timeStamp, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      const d = st.drag;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.startX;
      if (!d.moved && Math.abs(dx) > 6) {
        d.moved = true;
        try { row.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      if (!d.moved) return;
      const dt = Math.max(e.timeStamp - d.lastT, 1);
      st.vel = (e.clientX - d.lastX) / dt;
      d.lastX = e.clientX;
      d.lastT = e.timeStamp;
      st.x = d.startOff + dx;
      wrap();
      paint();
    };
    const onUp = (e: PointerEvent) => {
      const d = st.drag;
      if (!d || d.id !== e.pointerId) return;
      if (d.moved) {
        st.suppressClick = true;
        // Keep a fling's speed (capped); a slow release just resumes drifting.
        st.vel = Math.max(-2.5, Math.min(2.5, st.vel));
        if (e.timeStamp - d.lastT > 80) st.vel = 0;
      }
      st.drag = null;
      last = performance.now();
    };
    const onCancel = () => { st.drag = null; st.vel = 0; };
    const onEnter = (e: PointerEvent) => { if (e.pointerType === "mouse") st.hover = true; };
    const onLeave = (e: PointerEvent) => { if (e.pointerType === "mouse") st.hover = false; };
    // A drag must not open the card it started on.
    const onClickCapture = (e: MouseEvent) => {
      if (st.suppressClick) { e.preventDefault(); e.stopPropagation(); st.suppressClick = false; }
    };
    const onDragStart = (e: DragEvent) => e.preventDefault();

    row.addEventListener("pointerdown", onDown);
    row.addEventListener("pointermove", onMove);
    row.addEventListener("pointerup", onUp);
    row.addEventListener("pointercancel", onCancel);
    row.addEventListener("pointerenter", onEnter);
    row.addEventListener("pointerleave", onLeave);
    row.addEventListener("click", onClickCapture, true);
    row.addEventListener("dragstart", onDragStart);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      row.removeEventListener("pointerdown", onDown);
      row.removeEventListener("pointermove", onMove);
      row.removeEventListener("pointerup", onUp);
      row.removeEventListener("pointercancel", onCancel);
      row.removeEventListener("pointerenter", onEnter);
      row.removeEventListener("pointerleave", onLeave);
      row.removeEventListener("click", onClickCapture, true);
      row.removeEventListener("dragstart", onDragStart);
    };
  }, [dir, items.length]);

  // Enough copies that the strip always overfills even a very wide screen while
  // it slides by one copy (~156px a card): 3 copies for 10 lots, more for fewer.
  const reps = Math.max(2, Math.ceil(2600 / Math.max(1, items.length * 156)) + 1);
  const loop = Array.from({ length: reps }, () => items).flat();
  return (
    <div
      ref={rowRef}
      className="relative w-full overflow-hidden py-1.5 select-none"
      style={{ touchAction: "pan-y", WebkitMaskImage: EDGE_FADE, maskImage: EDGE_FADE }}
    >
      <div ref={trackRef} className="flex gap-2 w-max will-change-transform">
        {loop.map((it, i) => (
          <HotCard key={`${it.id}-${i}`} it={it} onBid={onBid} />
        ))}
      </div>
    </div>
  );
}

function HotCard({ it, onBid }: { it: TopItem; onBid: (it: TopItem) => void }) {
  return (
    <Link
      href={it.href}
      draggable={false}
      className="group nb-lift shrink-0 w-[148px] sm:w-[160px] flex flex-col bg-white border border-[#e3d6bf] hover:border-[#c47b3e]/50 rounded-2xl p-1.5 shadow-[0_1px_2px_rgba(36,26,18,0.05)]"
    >
      <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-white ring-1 ring-black/[0.05]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={it.photo}
          alt=""
          loading="lazy"
          draggable={false}
          className="w-full h-full object-contain p-1.5 group-hover:scale-[1.06] transition-transform duration-500 ease-out"
        />
        {it.bidCount > 0 && (
          <span className="absolute bottom-1.5 right-1.5 rounded-full bg-[#241a12]/80 text-white text-[10px] font-bold px-1.5 py-0.5 tabular-nums backdrop-blur">
            {it.bidCount} bid{it.bidCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="px-1 pt-1.5 pb-0.5 text-[12.5px] font-semibold text-[#241a12] leading-snug line-clamp-2 min-h-[2.6em] group-hover:text-[#6c4d39] transition-colors">
        {it.title}
      </div>
      <div className="px-1 pb-0.5 flex items-center justify-between gap-1.5">
        <span className="font-display text-[15px] font-black text-[#4a7c59] tabular-nums leading-none">{money(it.currentBid)}</span>
        {/* Quick bid: opens the pop-up right here; the rest of the card links out. */}
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onBid(it); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onBid(it); } }}
          className="shrink-0 inline-flex items-center justify-center min-h-[30px] px-3.5 rounded-full text-[11px] font-bold bg-[#6c4d39] hover:bg-[#563e2c] text-white shadow-[0_6px_14px_-6px_rgba(108,77,57,0.6)] transition-colors"
        >
          Bid
        </div>
      </div>
    </Link>
  );
}
