/**
 * "Corunna 24/7 Pick Up" — a lit LED shop sign in Northwood colors: espresso
 * board in a leather frame, warm dot-matrix glow, the "24/7" in signature amber,
 * cream lettering and a pine-green OPEN light. Pure CSS; the soft hum switches off
 * for reduced-motion users.
 */
export default function OpenSign({ town = "Corunna", className = "" }: { town?: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`${town} pickup is open 24/7`}
      className={`nb-led relative overflow-hidden rounded-2xl border-[4px] border-[#6c4d39] bg-gradient-to-b from-[#2a1d12] to-[#170f08] px-4 py-3.5 ring-1 ring-[#c47b3e]/40 shadow-[inset_0_0_26px_rgba(0,0,0,0.75),0_12px_28px_-12px_rgba(60,40,25,0.85)] ${className}`}
    >
      <style>{`
        .nb-led::before {
          content: ""; position: absolute; inset: 0; pointer-events: none;
          background-image: radial-gradient(rgba(240,163,90,0.13) 1px, transparent 1.4px);
          background-size: 6px 6px;
        }
        .nb-led-amber { color: #f6b56a; text-shadow: 0 0 4px #f0a35a, 0 0 12px rgba(240,163,90,0.95), 0 0 28px rgba(196,123,62,0.8), 0 0 46px rgba(196,123,62,0.45); }
        .nb-led-cream { color: #fbecd2; text-shadow: 0 0 4px rgba(251,236,210,0.9), 0 0 12px rgba(240,163,90,0.6), 0 0 22px rgba(196,123,62,0.4); }
        .nb-led-pine { color: #9fe3b0; text-shadow: 0 0 4px #7fd59a, 0 0 12px rgba(74,124,89,0.95), 0 0 26px rgba(74,124,89,0.7); }
        .nb-led-dot { background: #8fe0a6; box-shadow: 0 0 6px #8fe0a6, 0 0 14px rgba(74,124,89,0.9); }
        @keyframes nb-led-hum { 0%, 100% { opacity: 1; } 92% { opacity: 1; } 93% { opacity: .55; } 94% { opacity: 1; } 96% { opacity: .75; } 97% { opacity: 1; } }
        .nb-led-hum { animation: nb-led-hum 5s infinite; }
        @media (prefers-reduced-motion: reduce) { .nb-led-hum { animation: none; } }
      `}</style>
      <div className="relative flex items-center justify-center gap-3 sm:gap-4">
        <div className="text-center leading-none">
          <div className="nb-led-cream font-black uppercase tracking-[0.22em] text-[15px] sm:text-[17px]">{town}</div>
          <div className="nb-led-amber nb-led-hum font-black tracking-tight text-[44px] sm:text-[52px] leading-[0.95] mt-1" style={{ fontFamily: "var(--font-bitter), Georgia, serif" }}>
            24/7
          </div>
          <div className="nb-led-cream font-black uppercase tracking-[0.22em] text-[15px] sm:text-[17px] mt-1">Pick Up</div>
        </div>
        <div className="flex flex-col items-center gap-1.5 pl-3 sm:pl-4 border-l-2 border-[#6c4d39]/70">
          <span className="nb-led-dot w-3 h-3 rounded-full" aria-hidden />
          <span className="nb-led-pine font-black uppercase tracking-[0.18em] text-[20px] sm:text-[24px] leading-none">Open</span>
          <span className="text-[14px] font-bold text-[#d9c7ab] leading-tight text-center">Any day,<br />any hour</span>
        </div>
      </div>
    </div>
  );
}

/** Small lit "24/7 Pick Up" badge for location pickers and pickup cards. */
export function Open247Badge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-[#241a12] border-2 border-[#6c4d39] px-2.5 py-1 text-[13px] font-black uppercase tracking-[0.1em] text-[#f6b56a] shrink-0 ${className}`}
      style={{ textShadow: "0 0 6px rgba(240,163,90,0.85)" }}
    >
      <span className="w-2 h-2 rounded-full bg-[#8fe0a6]" style={{ boxShadow: "0 0 6px #8fe0a6, 0 0 10px rgba(74,124,89,0.9)" }} aria-hidden />
      24/7 Pick Up
    </span>
  );
}
