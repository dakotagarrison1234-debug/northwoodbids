/* ───────────────────────────────────────────────────────────
   Northwood Bids — rustic illustration set
   Hand-drawn / woodcut feel. Espresso ink, leather, moss, parchment.
   All components accept a className and are decorative (aria-hidden).
   ─────────────────────────────────────────────────────────── */

const INK = "#241a12";
const BARK = "#3a2a1b";
const LEATHER = "#a4592a";
const LEATHER_LT = "#c47b3e";
const MOSS = "#5f7a45";
const MOSS_DK = "#47592f";
const TAN = "#cdbda3";
const SAND = "#b9a98c";
const PAPER = "#fffdf7";

/* A single pine tree (woodcut triangle stack) */
function Pine({ x, y, s = 1, fill = MOSS_DK }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-2.5" y="0" width="5" height="14" rx="1" fill={BARK} />
      <path d="M0 -46 L16 -10 L9 -10 L20 8 L-20 8 L-9 -10 L-16 -10 Z" fill={fill} />
    </g>
  );
}

/* Wide layered forest ridge — sits at the bottom of heroes / top of footers */
export function PineRidge({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 220" className={className} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      {/* far hills */}
      <path d="M0 220 V130 Q150 80 330 118 T660 104 T980 124 T1200 100 V220Z" fill={TAN} opacity="0.55" />
      {/* mid hill */}
      <path d="M0 220 V160 Q220 118 480 148 T920 142 T1200 158 V220Z" fill={SAND} opacity="0.6" />
      {/* back pine band (lighter moss) */}
      {[60, 130, 200, 280, 360, 470, 560, 650, 760, 860, 960, 1060, 1150].map((x, i) => (
        <Pine key={`b${i}`} x={x} y={150} s={0.8} fill={MOSS} />
      ))}
      {/* front pine band (dark) */}
      {[30, 110, 175, 250, 330, 420, 520, 610, 700, 800, 900, 1000, 1100, 1180].map((x, i) => (
        <Pine key={`f${i}`} x={x} y={182} s={1.15} fill={MOSS_DK} />
      ))}
      {/* ground line */}
      <rect x="0" y="206" width="1200" height="14" fill={BARK} opacity="0.85" />
    </svg>
  );
}

/* Layered mountains + sun — calm rustic backdrop */
export function MountainRange({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 320" className={className} fill="none" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <circle cx="300" cy="120" r="58" fill={LEATHER_LT} opacity="0.25" />
      <circle cx="300" cy="120" r="40" fill={LEATHER} opacity="0.30" />
      <path d="M0 320 L150 130 L250 230 L360 90 L470 220 L600 120 V320Z" fill={SAND} opacity="0.65" />
      <path d="M0 320 L120 200 L230 290 L340 180 L460 300 L600 210 V320Z" fill={BARK} opacity="0.85" />
      {/* snow caps */}
      <path d="M150 130 L128 158 L142 152 L150 162 L160 150 L172 158Z" fill={PAPER} opacity="0.9" />
      <path d="M360 90 L338 122 L352 114 L360 126 L370 112 L382 122Z" fill={PAPER} opacity="0.9" />
    </svg>
  );
}

/* Circular gavel emblem / maker's mark */
export function GavelEmblem({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill={PAPER} stroke={INK} strokeWidth="3" />
      <circle cx="60" cy="60" r="48" fill="none" stroke={LEATHER} strokeWidth="1.5" strokeDasharray="2 5" />
      {/* gavel head */}
      <g transform="rotate(-38 60 60)" stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="40" y="40" width="40" height="20" rx="3" fill={LEATHER} />
        <line x1="60" y1="60" x2="60" y2="86" stroke={BARK} strokeWidth="6" />
        <line x1="34" y1="40" x2="34" y2="60" stroke={INK} strokeWidth="4" />
        <line x1="86" y1="40" x2="86" y2="60" stroke={INK} strokeWidth="4" />
      </g>
      {/* sound block */}
      <rect x="40" y="92" width="40" height="8" rx="2" fill={BARK} />
    </svg>
  );
}

/* Wooden crate — empty states */
export function WoodenCrate({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 120" className={className} fill="none" aria-hidden="true">
      <ellipse cx="70" cy="110" rx="52" ry="7" fill={INK} opacity="0.10" />
      {/* box body */}
      <path d="M22 44 L70 56 L118 44 L118 92 L70 104 L22 92 Z" fill={SAND} stroke={BARK} strokeWidth="3" strokeLinejoin="round" />
      {/* left face shading */}
      <path d="M22 44 L70 56 L70 104 L22 92 Z" fill={TAN} opacity="0.6" />
      {/* planks */}
      <path d="M22 60 L70 72 M70 72 L118 60 M22 76 L70 88 M70 88 L118 76" stroke={BARK} strokeWidth="2" opacity="0.6" />
      <line x1="70" y1="56" x2="70" y2="104" stroke={BARK} strokeWidth="2" opacity="0.6" />
      {/* lid planks open */}
      <path d="M22 44 L42 30 L92 30 L118 44" fill="none" stroke={BARK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M42 30 L70 56 L92 30" fill={PAPER} stroke={BARK} strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

/* Pine-branch divider — between sections */
export function BranchDivider({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 24" className={className} fill="none" aria-hidden="true">
      <line x1="20" y1="12" x2="220" y2="12" stroke={TAN} strokeWidth="2" />
      <g transform="translate(120 12)">
        <circle r="4" fill={LEATHER} />
        <g stroke={MOSS_DK} strokeWidth="2.5" strokeLinecap="round">
          <path d="M-10 0 l-14 -7 M-10 0 l-14 7 M-22 0 l-12 -6 M-22 0 l-12 6" />
          <path d="M10 0 l14 -7 M10 0 l14 7 M22 0 l12 -6 M22 0 l12 6" />
        </g>
      </g>
    </svg>
  );
}

/* Small inline pine mark for badges / bullets */
export function PineMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="10.5" y="17" width="3" height="5" rx="1" fill={BARK} />
      <path d="M12 2 L18 11 L14.5 11 L20 18 L4 18 L9.5 11 L6 11 Z" fill={MOSS_DK} />
    </svg>
  );
}
