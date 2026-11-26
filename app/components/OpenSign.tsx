/**
 * "Corunna 24/7 Pick Up" — a lit LED shop sign (think the OPEN sign in a
 * storefront window): dark board, a dot-matrix glow, neon lettering with a soft
 * hum. Pure CSS, no images. The hum switches off for reduced-motion users.
 */
export default function OpenSign({ town = "Corunna", className = "" }: { town?: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`${town} pickup is open 24/7`}
      className={`nb-led relative overflow-hidden rounded-2xl border-[3px] border-[#3a2a1c] bg-[#120b06] px-4 py-3.5 shadow-[inset_0_0_24px_rgba(0,0,0,0.8),0_10px_26px_-12px_rgba(36,26,18,0.8)] ${className}`}
    >
      <style>{`
        .nb-led::before {
          content: ""; position: absolute; inset: 0; pointer-events: none;
          background-image: radial-gradient(rgba(255,120,60,0.10) 1px, transparent 1.4px);
          background-size: 6px 6px;
        }
        .nb-led-red { color: #ff5a3c; text-shadow: 0 0 4px #ff5a3c, 0 0 12px #ff3a1c, 0 0 26px rgba(255,58,28,0.85), 0 0 44px rgba(255,58,28,0.5); }
        .nb-led-amber { color: #ffc46b; text-shadow: 0 0 4px #ffb347, 0 0 12px rgba(255,170,60,0.9), 0 0 24px rgba(255,150,40,0.55); }
        .nb-led-dot { background: #4dff88; box-shadow: 0 0 6px #4dff88, 0 0 14px rgba(77,255,136,0.8); }
        @keyframes nb-led-hum { 0%, 100% { opacity: 1; } 92% { opacity: 1; } 93% { opacity: .55; } 94% { opacity: 1; } 96% { opacity: .75; } 97% { opacity: 1; } }
        .nb-led-hum { animation: nb-led-hum 5s infinite; }
        @media (prefers-reduced-motion: reduce) { .nb-led-hum { animation: none; } }
      `}</style>
      <div className="relative flex items-center justify-center gap-3 sm:gap-4">
        <div className="text-center leading-none">
          <div className="nb-led-amber font-black uppercase tracking-[0.22em] text-[15px] sm:text-[17px]">{town}</div>
          <div className="nb-led-red nb-led-hum font-black tracking-tight text-[44px] sm:text-[52px] leading-[0.95] mt-1" style={{ fontFamily: "var(--font-bitter), Georgia, serif" }}>
            24/7
          </div>
          <div className="nb-led-amber font-black uppercase tracking-[0.22em] text-[15px] sm:text-[17px] mt-1">Pick Up</div>
        </div>
        <div className="flex flex-col items-center gap-1.5 pl-3 sm:pl-4 border-l-2 border-[#3a2a1c]">
          <span className="nb-led-dot w-3 h-3 rounded-full" aria-hidden />
          <span className="nb-led-red font-black uppercase tracking-[0.18em] text-[20px] sm:text-[24px] leading-none">Open</span>
          <span className="text-[13px] font-bold text-[#c9b79a] leading-tight text-center">Any day,<br />any hour</span>
        </div>
      </div>
    </div>
  );
}

/** Small lit "24/7 Pick Up" badge for location pickers and pickup cards. */
export function Open247Badge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-[#120b06] border border-[#3a2a1c] px-2.5 py-1 text-[13px] font-black uppercase tracking-[0.1em] text-[#ffc46b] shrink-0 ${className}`}
      style={{ textShadow: "0 0 6px rgba(255,170,60,0.8)" }}
    >
      <span className="w-2 h-2 rounded-full bg-[#4dff88]" style={{ boxShadow: "0 0 6px #4dff88" }} aria-hidden />
      24/7 Pick Up
    </span>
  );
}
