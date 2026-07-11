"use client";
import { useState } from "react";

// Best-effort "download as PNG" using html2canvas from CDN. If the R2 images aren't
// CORS-enabled the canvas is tainted and export throws — we fall back to telling the
// admin to just screenshot the flyer (which always works).
declare global {
  interface Window { html2canvas?: (el: HTMLElement, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement>; }
}

export default function DownloadFlyerButton() {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    const el = document.getElementById("flyer");
    if (!el) return;
    setBusy(true);
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
      const canvas = await window.html2canvas!(el, { useCORS: true, backgroundColor: "#f1e7d5", scale: 2 });
      const link = document.createElement("a");
      link.download = "northwood-bids-flyer.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      alert("Couldn't auto-save the image (photo security). Just screenshot the flyer below to post it.");
    } finally {
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
