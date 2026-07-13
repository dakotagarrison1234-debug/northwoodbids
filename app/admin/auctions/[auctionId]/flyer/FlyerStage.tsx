"use client";
import { useEffect, useRef, useState } from "react";

/**
 * The flyer is built at its REAL export size (1080×1080 — Facebook/Instagram's
 * square). That's far bigger than a phone screen, so we shrink it to fit with a
 * CSS transform: what you see is the whole flyer, no scrolling, screenshot-able
 * in one go — while the underlying element stays a pixel-perfect 1080 square for
 * the PNG export.
 *
 * The download button removes the transform for the moment of capture (see
 * DownloadFlyerButton), which is why the scale lives on its own wrapper.
 */
export const FLYER_SIZE = 1080;

export default function FlyerStage({ children }: { children: React.ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = () => {
      const byWidth = el.clientWidth / FLYER_SIZE;
      // Leave room for the page header/help text so the whole square is on screen.
      const byHeight = (window.innerHeight * 0.66) / FLYER_SIZE;
      setScale(Math.max(0.2, Math.min(1, byWidth, byHeight)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  return (
    <div ref={boxRef} className="w-full">
      {/* Stage reserves exactly the scaled footprint, so nothing below it jumps. */}
      <div
        id="flyer-stage"
        style={{ height: FLYER_SIZE * scale, width: FLYER_SIZE * scale, overflow: "hidden" }}
        className="rounded-2xl shadow-[0_10px_40px_rgba(108,77,57,0.18)] max-w-full"
      >
        <div
          id="flyer-scale"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: FLYER_SIZE,
            height: FLYER_SIZE,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
