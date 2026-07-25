"use client";
import { useEffect, useMemo, useRef, useState } from "react";

const SIZE = 1080;

export type MotionItem = {
  id: string;
  title: string;
  price: number;
  priceLabel: string;
  retail: number;
  photo: string | null;
  isPremium: boolean;
  bidCount: number;
};

/**
 * A looping, fast-paced 1080×1080 motion graphic for social. It's built to be
 * SCREEN-RECORDED (every phone and Mac records natively to MP4, which Facebook
 * accepts cleanly) rather than exported in-browser — browser video export is WebM,
 * which FB often rejects. So this is a real animation on screen, sized to fit, with
 * a big Restart + Fullscreen so the recording is clean.
 *
 * Scenes: brand intro → each hot item flashing in with price + MSRP + %-off burst →
 * a call-to-action outro. Ranked upstream by bid activity then MSRP, so the loudest
 * lots lead.
 */
export default function FlyerMotion({
  items,
  auction,
  logo,
}: {
  items: MotionItem[];
  auction: { title: string; closes: string };
  logo: string;
}) {
  // ── scene list: intro, items…, outro ──
  const scenes = useMemo(() => {
    const arr: { type: "intro" | "item" | "outro"; item?: MotionItem; ms: number }[] = [
      { type: "intro", ms: 1700 },
      ...items.slice(0, 10).map((item) => ({ type: "item" as const, item, ms: 1200 })),
      { type: "outro", ms: 2300 },
    ];
    return arr;
  }, [items]);

  const [idx, setIdx] = useState(0);
  const [cycle, setCycle] = useState(0); // bumps each loop so entrance anims replay
  const [playing, setPlaying] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  // Fit the 1080 square to the viewport.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const byW = el.clientWidth / SIZE;
      const byH = (window.innerHeight * 0.7) / SIZE;
      setScale(Math.max(0.2, Math.min(1, byW, byH)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  // Advance scenes.
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      setIdx((i) => {
        const next = i + 1;
        if (next >= scenes.length) { setCycle((c) => c + 1); return 0; }
        return next;
      });
    }, scenes[idx]?.ms ?? 1200);
    return () => clearTimeout(t);
  }, [idx, playing, scenes]);

  const restart = () => { setIdx(0); setCycle((c) => c + 1); setPlaying(true); };
  const goFullscreen = () => { stageRef.current?.requestFullscreen?.().catch(() => {}); };

  const scene = scenes[idx];
  const sceneKey = `${cycle}-${idx}`;

  return (
    <div>
      <style>{KEYFRAMES}</style>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setPlaying((p) => !p)}
          className="inline-flex items-center gap-1.5 bg-[#6c4d39] hover:bg-[#563e2c] text-white text-base font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={restart}
          className="inline-flex items-center gap-1.5 bg-white border border-[#cdbda3] text-[#241a12] hover:bg-[#efe3d0] text-base font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          Restart
        </button>
        <button
          onClick={goFullscreen}
          className="inline-flex items-center gap-1.5 bg-white border border-[#cdbda3] text-[#241a12] hover:bg-[#efe3d0] text-base font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          Fullscreen
        </button>
      </div>

      {/* Stage — the 1080 square, shrunk to fit. */}
      <div
        ref={stageRef}
        className="rounded-2xl shadow-[0_10px_40px_rgba(108,77,57,0.18)] overflow-hidden bg-black grid place-items-center"
        style={{ width: SIZE * scale, height: SIZE * scale, maxWidth: "100%" }}
      >
        <div
          style={{
            width: SIZE, height: SIZE, transform: `scale(${scale})`, transformOrigin: "center",
            position: "relative", overflow: "hidden", background: "#faf5ea",
            fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
          }}
        >
          {/* ── Persistent brand frame ── */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 10, background: "linear-gradient(90deg,#6c4d39,#c47b3e,#6c4d39)", zIndex: 5 }} />
          <div style={{ position: "absolute", top: 22, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 14, zIndex: 5 }}>
            <span style={{ width: 14, height: 14, borderRadius: 999, background: "#c0392b", animation: "fm-pulse 1s infinite" }} />
            <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.28em", textTransform: "uppercase", color: "#6c4d39" }}>
              Live Auction
            </span>
          </div>
          <div style={{ position: "absolute", bottom: 26, left: 0, right: 0, textAlign: "center", zIndex: 5 }}>
            <span style={{ fontSize: 34, fontWeight: 900, color: "#241a12" }}>northwoodbids.com</span>
          </div>

          {/* ── Scene content ── */}
          <div key={sceneKey} style={{ position: "absolute", inset: 0, top: 64, bottom: 78, display: "flex", flexDirection: "column" }}>
            {scene?.type === "intro" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, textAlign: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt="" style={{ height: 150, maxWidth: 520, objectFit: "contain", animation: "fm-pop .5s both" }} />
                <div style={{ marginTop: 24, fontSize: 58, fontWeight: 900, color: "#241a12", lineHeight: 1.05, animation: "fm-slideup .5s .1s both" }}>
                  {auction.title}
                </div>
                <div style={{ marginTop: 18, background: "#6c4d39", color: "#fff", fontSize: 26, fontWeight: 800, padding: "12px 30px", borderRadius: 999, animation: "fm-pop .5s .25s both" }}>
                  Closes {auction.closes}
                </div>
                <div style={{ marginTop: 24, fontSize: 30, fontWeight: 700, color: "#8a5a2b", animation: "fm-slideup .5s .35s both" }}>
                  Tap the link to bid ↓
                </div>
              </div>
            )}

            {scene?.type === "item" && scene.item && (
              <ItemScene item={scene.item} />
            )}

            {scene?.type === "outro" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, textAlign: "center", background: "#6c4d39", margin: "0 40px", borderRadius: 28 }}>
                <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase", color: "#e0954f", animation: "fm-slideup .5s both" }}>
                  Bid • Win • Pick up local
                </div>
                <div style={{ marginTop: 14, fontSize: 74, fontWeight: 900, color: "#fff", lineHeight: 1, animation: "fm-pop .5s .12s both" }}>
                  northwoodbids<span style={{ color: "#e0954f" }}>.com</span>
                </div>
                <div style={{ marginTop: 22, fontSize: 30, color: "#e8d9c2", fontWeight: 600, animation: "fm-slideup .5s .28s both" }}>
                  New lots every week — free to join
                </div>
              </div>
            )}
          </div>

          {/* Progress ticks */}
          <div style={{ position: "absolute", bottom: 68, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6, zIndex: 5 }}>
            {scenes.map((_, i) => (
              <span key={i} style={{ width: i === idx ? 26 : 8, height: 8, borderRadius: 999, background: i === idx ? "#6c4d39" : "#cdbda3", transition: "width .2s" }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemScene({ item }: { item: MotionItem }) {
  const pctOff = item.retail > 0 && item.price < item.retail ? Math.round((1 - item.price / item.retail) * 100) : 0;
  const hot = item.bidCount >= 3;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "12px 44px 0" }}>
      {/* Photo */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {item.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.photo}
            alt=""
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", animation: "fm-zoom .6s both", filter: "drop-shadow(0 12px 24px rgba(0,0,0,.18))" }}
          />
        ) : (
          <div style={{ color: "#b3a085", fontSize: 28 }}>No photo</div>
        )}

        {hot && (
          <div style={{ position: "absolute", top: 8, left: 8, background: "#c0392b", color: "#fff", fontSize: 26, fontWeight: 900, padding: "8px 18px", borderRadius: 14, animation: "fm-pop .4s .1s both" }}>
            🔥 {item.bidCount} bids
          </div>
        )}
        {pctOff >= 20 && (
          <div style={{ position: "absolute", top: 8, right: 8, background: "#a32d2d", color: "#fff", fontSize: 40, fontWeight: 900, padding: "12px 22px", borderRadius: 18, transform: "rotate(-8deg)", animation: "fm-burst .5s .2s both", boxShadow: "0 8px 20px rgba(163,45,45,.35)" }}>
            {pctOff}% OFF
          </div>
        )}
      </div>

      {/* Info bar */}
      <div style={{ flexShrink: 0, background: "#fff", border: "3px solid #6c4d39", borderRadius: 22, padding: "18px 26px", marginBottom: 4, animation: "fm-slideup .5s .15s both" }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: "#241a12", lineHeight: 1.15, height: 72, overflow: "hidden" }}>
          {item.title}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a7559" }}>{item.priceLabel}</div>
            <div style={{ fontSize: 66, fontWeight: 900, color: "#6c4d39", lineHeight: 1 }}>${item.price.toLocaleString()}</div>
          </div>
          {item.retail > 0 && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 20, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a7559" }}>Retail</div>
              <div style={{ fontSize: 40, fontWeight: 900, color: "#a32d2d", lineHeight: 1 }}>${item.retail.toLocaleString()}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const KEYFRAMES = `
@keyframes fm-pop { from { opacity: 0; transform: scale(.82); } to { opacity: 1; transform: scale(1); } }
@keyframes fm-slideup { from { opacity: 0; transform: translateY(46px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fm-zoom { from { transform: scale(1.14); } to { transform: scale(1); } }
@keyframes fm-pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
@keyframes fm-burst {
  0% { opacity: 0; transform: scale(.4) rotate(-8deg); }
  60% { opacity: 1; transform: scale(1.18) rotate(-8deg); }
  100% { transform: scale(1) rotate(-8deg); }
}
`;
