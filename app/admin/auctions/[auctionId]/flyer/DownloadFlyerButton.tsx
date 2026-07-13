"use client";
import { useState } from "react";

// "Download as PNG" via html2canvas (CDN). The flyer is a real 1080×1080 element
// that's only *displayed* shrunk, so we drop the preview transform for the moment
// of capture and put it straight back — otherwise html2canvas bakes the shrink in
// and you get a tiny image floating in a big empty square.
declare global {
  interface Window { html2canvas?: (el: HTMLElement, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement>; }
}

const SIZE = 1080;

export default function DownloadFlyerButton() {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    const flyer = document.getElementById("flyer");
    const scaleEl = document.getElementById("flyer-scale");
    const stageEl = document.getElementById("flyer-stage");
    if (!flyer || !scaleEl || !stageEl) return;

    setBusy(true);

    // Remember the preview sizing so we can restore it no matter what happens.
    const prevTransform = scaleEl.style.transform;
    const prevStageH = stageEl.style.height;
    const prevStageW = stageEl.style.width;

    try {
      if (!window.html2canvas) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("load failed"));
          document.body.appendChild(s);
        });
      }

      // Render at true size for the capture. The stage keeps overflow hidden, so
      // the page doesn't visibly lurch while this happens.
      scaleEl.style.transform = "none";
      // Let the browser lay it out before we snapshot it.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const canvas = await window.html2canvas!(flyer, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        scale: 1,          // the element is already 1080 — no upscaling needed
        width: SIZE,
        height: SIZE,
        windowWidth: SIZE,
        windowHeight: SIZE,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
      });

      const link = document.createElement("a");
      link.download = "northwood-bids-flyer.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      alert("Couldn't auto-save the image. Screenshot the flyer below instead — it's sized to fit your screen.");
    } finally {
      scaleEl.style.transform = prevTransform;
      stageEl.style.height = prevStageH;
      stageEl.style.width = prevStageW;
      setBusy(false);
    }
  };

  return (
    <button
      onClick={download}
      disabled={busy}
      className="bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white text-base font-semibold px-5 py-2.5 rounded-xl transition-colors"
    >
      {busy ? "Preparing…" : "Download image"}
    </button>
  );
}
