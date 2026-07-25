"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type Scene = { type: "intro" | "item" | "outro"; item?: MotionItem; ms: number };

/**
 * Looping, fast-paced 1080×1080 motion graphic for social, built to be SCREEN-RECORDED.
 *
 * Why a fixed overlay and not the Fullscreen API: iOS Safari does not support
 * requestFullscreen() on a <div> at all, so the "Fullscreen" button silently did
 * nothing on the exact device the owner records with. Instead, "Play & record" opens
 * a fixed, viewport-filling black overlay (works everywhere), preloads every photo so
 * there's no flicker, runs a 3-2-1 countdown that gives time to start the phone's
 * screen recorder, then plays the loop with a top progress bar and a "loop complete"
 * flag so it's obvious where to cut. The square is centered and scaled to the largest
 * square that fits the screen — full-width on a portrait phone.
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
  const scenes: Scene[] = useMemo(() => [
    { type: "intro", ms: 2200 },
    ...items.slice(0, 10).map((item) => ({ type: "item" as const, item, ms: 1350 })),
    { type: "outro", ms: 2600 },
  ], [items]);

  const totalMs = useMemo(() => scenes.reduce((s, x) => s + x.ms, 0), [scenes]);

  const [mode, setMode] = useState<"preview" | "loading" | "countdown" | "playing">("preview");
  const [countN, setCountN] = useState(3);
  const [idx, setIdx] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [loopFlash, setLoopFlash] = useState(false);
  const [overlaySide, setOverlaySide] = useState(360);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Largest square that fits the viewport (portrait phone → full width). ──
  useEffect(() => {
    const fit = () => setOverlaySide(Math.min(window.innerWidth, window.innerHeight));
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    return () => { window.removeEventListener("resize", fit); window.removeEventListener("orientationchange", fit); };
  }, []);

  // Lock body scroll while the overlay is up.
  useEffect(() => {
    if (mode === "preview") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mode]);

  // ── Preload every image so the loop never flickers mid-record. ──
  const preload = useCallback(() => {
    const urls = [logo, ...items.slice(0, 10).map((i) => i.photo).filter(Boolean) as string[]];
    return Promise.all(
      urls.map(
        (u) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = u;
            // Safety: never hang the show on one slow image.
            setTimeout(resolve, 5000);
          })
      )
    );
  }, [logo, items]);

  const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };

  const start = useCallback(async () => {
    setMode("loading");
    await preload();
    // 3-2-1 countdown.
    setMode("countdown");
    setCountN(3);
    let n = 3;
    const tick = () => {
      n -= 1;
      if (n <= 0) {
        setIdx(0);
        setCycle(0);
        setMode("playing");
      } else {
        setCountN(n);
        timerRef.current = setTimeout(tick, 1000);
      }
    };
    timerRef.current = setTimeout(tick, 1000);
  }, [preload]);

  const exit = useCallback(() => {
    clearTimer();
    setMode("preview");
  }, []);

  // Advance scenes while playing.
  useEffect(() => {
    if (mode !== "playing") return;
    timerRef.current = setTimeout(() => {
      setIdx((i) => {
        const next = i + 1;
        if (next >= scenes.length) {
          setCycle((c) => c + 1);
          setLoopFlash(true);
          setTimeout(() => setLoopFlash(false), 1400);
          return 0;
        }
        return next;
      });
    }, scenes[idx]?.ms ?? 1300);
    return clearTimer;
  }, [mode, idx, scenes]);

  useEffect(() => () => clearTimer(), []);

  const scene = scenes[idx];

  return (
    <div>
      <style>{KEYFRAMES}</style>

      {/* ── Inline poster + start button ── */}
      <div className="max-w-sm">
        <div
          className="relative rounded-2xl overflow-hidden shadow-[0_8px_30px_rgba(108,77,57,0.18)] bg-[#faf5ea]"
          style={{ width: "100%", aspectRatio: "1 / 1" }}
        >
          <div style={{ position: "absolute", inset: 0, transformOrigin: "top left", transform: "scale(var(--posterScale))" }}
               ref={(el) => {
                 if (!el) return;
                 const parent = el.parentElement!;
                 el.style.width = `${SIZE}px`;
                 el.style.height = `${SIZE}px`;
                 el.style.setProperty("--posterScale", String(parent.clientWidth / SIZE));
               }}>
            <Frame scene={scenes[0]} scenes={scenes} idx={0} cycle={0} auction={auction} logo={logo} totalMs={totalMs} showProgress={false} />
          </div>
          <button
            onClick={start}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 text-white active:bg-black/55 transition-colors"
          >
            <span className="w-16 h-16 rounded-full bg-white/95 grid place-items-center shadow-lg mb-2">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="#6c4d39"><path d="M8 5v14l11-7z" /></svg>
            </span>
            <span className="text-lg font-extrabold">Play &amp; record</span>
            <span className="text-sm text-white/85 mt-0.5">Full screen · 3-2-1 countdown</span>
          </button>
        </div>
        <p className="text-sm text-[#8a7559] mt-2">
          Tap play, start your phone&apos;s screen recorder when the countdown hits GO, let it run one full loop, then stop.
        </p>
      </div>

      {/* ── Full-screen player overlay ── */}
      {mode !== "preview" && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center" style={{ touchAction: "none" }}>
          {/* Exit — small, corner, out of the square so it's easy to crop out. */}
          <button
            onClick={exit}
            className="absolute top-3 right-3 z-20 w-10 h-10 rounded-full bg-white/15 text-white grid place-items-center active:bg-white/30"
            aria-label="Close"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>

          {/* The square */}
          <div
            className="relative overflow-hidden bg-[#faf5ea]"
            style={{ width: overlaySide, height: overlaySide }}
          >
            <div style={{ width: SIZE, height: SIZE, transformOrigin: "top left", transform: `scale(${overlaySide / SIZE})` }}>
              <Frame
                scene={mode === "playing" ? scene : scenes[0]}
                scenes={scenes}
                idx={mode === "playing" ? idx : 0}
                cycle={cycle}
                auction={auction}
                logo={logo}
                totalMs={totalMs}
                showProgress={mode === "playing"}
              />
            </div>

            {/* Loading */}
            {mode === "loading" && (
              <div className="absolute inset-0 grid place-items-center bg-[#faf5ea]">
                <span className="text-[#6c4d39] font-bold text-lg animate-pulse">Loading photos…</span>
              </div>
            )}

            {/* Countdown */}
            {mode === "countdown" && (
              <div className="absolute inset-0 grid place-items-center bg-[#241a12]/85">
                <div className="text-center">
                  <div key={countN} className="text-white font-black leading-none" style={{ fontSize: overlaySide * 0.42, animation: "fm-count 1s ease-out" }}>
                    {countN}
                  </div>
                  <div className="text-white/90 font-extrabold uppercase tracking-widest mt-2" style={{ fontSize: overlaySide * 0.045 }}>
                    Start recording!
                  </div>
                </div>
              </div>
            )}

            {/* Loop-complete flag */}
            {loopFlash && mode === "playing" && (
              <div className="absolute top-0 left-0 right-0 grid place-items-center pt-8 pointer-events-none">
                <span className="bg-[#4a7c59] text-white font-extrabold rounded-full px-5 py-2 shadow-lg" style={{ fontSize: overlaySide * 0.035, animation: "fm-pop .4s both" }}>
                  ✓ One loop done — you can stop
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The 1080 square: persistent brand frame + a top progress bar + swapping center. */
function Frame({
  scene, scenes, idx, cycle, auction, logo, totalMs, showProgress,
}: {
  scene: Scene; scenes: Scene[]; idx: number; cycle: number;
  auction: { title: string; closes: string }; logo: string; totalMs: number; showProgress: boolean;
}) {
  return (
    <div style={{ width: SIZE, height: SIZE, position: "relative", overflow: "hidden", background: "#faf5ea", fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}>
      {/* Top progress bar — fills once over the whole loop so it's clear where to cut. */}
      {showProgress && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 10, background: "rgba(108,77,57,0.15)", zIndex: 8 }}>
          <div key={cycle} style={{ height: "100%", background: "linear-gradient(90deg,#6c4d39,#c47b3e)", width: 0, animation: `fm-progress ${totalMs}ms linear both` }} />
        </div>
      )}

      {/* Header */}
      <div style={{ position: "absolute", top: showProgress ? 28 : 22, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 16, zIndex: 6 }}>
        <span style={{ width: 16, height: 16, borderRadius: 999, background: "#c0392b", animation: "fm-pulse 1s infinite" }} />
        <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: "0.28em", textTransform: "uppercase", color: "#6c4d39" }}>Live Auction</span>
      </div>

      {/* Footer */}
      <div style={{ position: "absolute", bottom: 30, left: 0, right: 0, textAlign: "center", zIndex: 6 }}>
        <span style={{ fontSize: 38, fontWeight: 900, color: "#241a12" }}>northwoodbids.com</span>
      </div>

      {/* Progress ticks */}
      <div style={{ position: "absolute", bottom: 84, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 7, zIndex: 6 }}>
        {scenes.map((_, i) => (
          <span key={i} style={{ width: i === idx ? 30 : 9, height: 9, borderRadius: 999, background: i === idx ? "#6c4d39" : "#cdbda3", transition: "width .2s" }} />
        ))}
      </div>

      {/* Center content — keyed by scene so its entrance animations replay each time,
          while the chrome above (progress bar, header, footer, ticks) persists. */}
      <div key={`${cycle}-${idx}`} style={{ position: "absolute", left: 0, right: 0, top: 78, bottom: 100, display: "flex", flexDirection: "column" }}>
        <SceneContent scene={scene} auction={auction} logo={logo} />
      </div>
    </div>
  );
}

function SceneContent({ scene, auction, logo }: { scene: Scene; auction: { title: string; closes: string }; logo: string }) {
  if (scene.type === "intro") {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 64, textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" style={{ height: 168, maxWidth: 560, objectFit: "contain", animation: "fm-pop .6s both" }} />
        <div style={{ marginTop: 28, fontSize: 62, fontWeight: 900, color: "#241a12", lineHeight: 1.05, animation: "fm-slideup .55s .12s both" }}>{auction.title}</div>
        <div style={{ marginTop: 22, background: "#6c4d39", color: "#fff", fontSize: 30, fontWeight: 800, padding: "14px 34px", borderRadius: 999, animation: "fm-pop .55s .28s both" }}>
          Closes {auction.closes}
        </div>
        <div style={{ marginTop: 26, fontSize: 34, fontWeight: 700, color: "#8a5a2b", animation: "fm-slideup .55s .4s both" }}>Tap the link to bid ↓</div>
      </div>
    );
  }
  if (scene.type === "outro") {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 44px" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 56, textAlign: "center", background: "#6c4d39", borderRadius: 32 }}>
          <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase", color: "#e0954f", animation: "fm-slideup .5s both" }}>Bid • Win • Pick up local</div>
          <div style={{ marginTop: 16, fontSize: 78, fontWeight: 900, color: "#fff", lineHeight: 1, animation: "fm-pop .5s .12s both" }}>
            northwoodbids<span style={{ color: "#e0954f" }}>.com</span>
          </div>
          <div style={{ marginTop: 24, fontSize: 32, color: "#e8d9c2", fontWeight: 600, animation: "fm-slideup .5s .28s both" }}>New lots every week — free to join</div>
        </div>
      </div>
    );
  }
  // item
  const item = scene.item!;
  const pctOff = item.retail > 0 && item.price < item.retail ? Math.round((1 - item.price / item.retail) * 100) : 0;
  const hot = item.bidCount >= 3;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "12px 44px 0", minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {item.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.photo} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", animation: "fm-zoom .6s both", filter: "drop-shadow(0 14px 28px rgba(0,0,0,.2))" }} />
        ) : (
          <div style={{ color: "#b3a085", fontSize: 30 }}>No photo</div>
        )}
        {hot && (
          <div style={{ position: "absolute", top: 6, left: 6, background: "#c0392b", color: "#fff", fontSize: 28, fontWeight: 900, padding: "9px 20px", borderRadius: 16, animation: "fm-pop .4s .1s both" }}>
            🔥 {item.bidCount} bids
          </div>
        )}
        {pctOff >= 20 && (
          <div style={{ position: "absolute", top: 6, right: 6, background: "#a32d2d", color: "#fff", fontSize: 44, fontWeight: 900, padding: "13px 24px", borderRadius: 20, transform: "rotate(-8deg)", animation: "fm-burst .55s .2s both", boxShadow: "0 10px 24px rgba(163,45,45,.4)" }}>
            {pctOff}% OFF
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0, background: "#fff", border: "3px solid #6c4d39", borderRadius: 24, padding: "20px 28px", marginBottom: 6, animation: "fm-slideup .5s .15s both" }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: "#241a12", lineHeight: 1.15, height: 76, overflow: "hidden" }}>{item.title}</div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 18, marginTop: 10 }}>
          <div>
            <div style={{ fontSize: 21, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a7559" }}>{item.priceLabel}</div>
            <div style={{ fontSize: 72, fontWeight: 900, color: "#6c4d39", lineHeight: 1 }}>${item.price.toLocaleString()}</div>
          </div>
          {item.retail > 0 && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 21, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a7559" }}>Retail</div>
              <div style={{ fontSize: 44, fontWeight: 900, color: "#a32d2d", lineHeight: 1 }}>${item.retail.toLocaleString()}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const KEYFRAMES = `
@keyframes fm-pop { from { opacity: 0; transform: scale(.82); } to { opacity: 1; transform: scale(1); } }
@keyframes fm-slideup { from { opacity: 0; transform: translateY(48px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fm-zoom { from { transform: scale(1.14); } to { transform: scale(1); } }
@keyframes fm-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes fm-burst { 0% { opacity: 0; transform: scale(.4) rotate(-8deg); } 60% { opacity: 1; transform: scale(1.2) rotate(-8deg); } 100% { transform: scale(1) rotate(-8deg); } }
@keyframes fm-count { 0% { opacity: 0; transform: scale(1.6); } 30% { opacity: 1; transform: scale(1); } 100% { opacity: .85; transform: scale(.9); } }
@keyframes fm-progress { from { width: 0; } to { width: 100%; } }
`;
