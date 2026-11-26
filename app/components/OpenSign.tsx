/**
 * "CORUNNA PICK UP / 24/7" as a real LED sign: no board or card behind it, just
 * the lettering, built out of lit dots (like the bulbs in a storefront OPEN sign)
 * glowing right on the page. Bright sign red so it stands out on the white form.
 * The soft hum switches off for reduced-motion users; browsers that can't clip a
 * background to text get solid red letters.
 */
export default function OpenSign({ town = "Corunna", className = "" }: { town?: string; className?: string }) {
  return (
    <div role="img" aria-label={`${town} pick up, open 24/7`} className={`text-center select-none ${className}`}>
      <style>{`
        .nb-led-text {
          font-family: var(--font-geist-sans), Inter, system-ui, sans-serif;
          font-weight: 900;
          color: #ff3324;
          filter: drop-shadow(0 0 2px rgba(255, 51, 36, 0.9)) drop-shadow(0 0 10px rgba(255, 51, 36, 0.45));
        }
        @supports ((-webkit-background-clip: text) or (background-clip: text)) {
          .nb-led-text {
            color: transparent;
            background-image: radial-gradient(circle, #ff3324 58%, rgba(255, 51, 36, 0.18) 64%, transparent 70%);
            -webkit-background-clip: text;
            background-clip: text;
          }
          .nb-led-sm { background-size: 3px 3px; }
          .nb-led-lg { background-size: 5px 5px; }
        }
        .nb-led-sm { font-size: clamp(18px, 6.2vw, 27px); letter-spacing: 0.15em; line-height: 1; white-space: nowrap; }
        .nb-led-lg { font-size: clamp(60px, 20vw, 86px); letter-spacing: 0.02em; line-height: 0.9; }
        @keyframes nb-led-hum { 0%, 91%, 94%, 100% { opacity: 1; } 92% { opacity: .6; } 96% { opacity: .85; } }
        .nb-led-hum { animation: nb-led-hum 6s infinite; }
        @media (prefers-reduced-motion: reduce) { .nb-led-hum { animation: none; } }
      `}</style>
      <div className="nb-led-text nb-led-sm uppercase">{town} Pick Up</div>
      <div className="nb-led-text nb-led-lg nb-led-hum mt-1.5">24/7</div>
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
