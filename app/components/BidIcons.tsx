/* ───────────────────────────────────────────────────────────
   Northwood Bids — custom inline icon set + mascot.
   Clean single-weight line icons that inherit `currentColor`, so
   they sit right on any background (cream, gold ticket, red hero).
   Used everywhere in place of emoji. All decorative (aria-hidden).
   ─────────────────────────────────────────────────────────── */

type P = { className?: string };
const base = (className: string) => ({
  className,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
});

export function IcoNew({ className = "w-5 h-5" }: P) {
  return (
    <svg {...base(className)}>
      <path d="M20.6 13.4 12 22l-8.6-8.6a4.2 4.2 0 0 1 0-6 4.2 4.2 0 0 1 6 0l2.6 2.6" />
      <path d="M17 3.5v5M14.5 6h5" />
    </svg>
  );
}

export function IcoMagnifier({ className = "w-5 h-5" }: P) {
  return (
    <svg {...base(className)}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.5-4.5" />
      <path d="M8 10.5h5M10.5 8v5" />
    </svg>
  );
}

export function IcoCoin({ className = "w-5 h-5" }: P) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9M14.3 9.3c-.5-.9-1.4-1.3-2.5-1.3-1.4 0-2.4.8-2.4 1.9 0 2.6 5 1.3 5 3.9 0 1.2-1.1 2-2.6 2-1.2 0-2.2-.5-2.6-1.4" />
    </svg>
  );
}

export function IcoTruck({ className = "w-5 h-5" }: P) {
  return (
    <svg {...base(className)}>
      <path d="M2 6.5h10v8H2zM12 9.5h4l3 3v2h-7z" />
      <circle cx="6" cy="17" r="1.8" />
      <circle cx="16.5" cy="17" r="1.8" />
    </svg>
  );
}

export function IcoGift({ className = "w-5 h-5" }: P) {
  return (
    <svg {...base(className)}>
      <rect x="3.5" y="9" width="17" height="12" rx="1.5" />
      <path d="M3.5 13h17M12 9v12" />
      <path d="M12 9S9.8 4.8 7.7 5.6C6.2 6.2 7 9 9 9zM12 9s2.2-4.2 4.3-3.4C17.8 6.2 17 9 15 9z" />
    </svg>
  );
}

export function IcoShield({ className = "w-5 h-5" }: P) {
  return (
    <svg {...base(className)}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m8.5 11.5 2.5 2.5 4.5-4.5" />
    </svg>
  );
}

export function IcoTicket({ className = "w-5 h-5" }: P) {
  return (
    <svg {...base(className)}>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5V9a1.8 1.8 0 0 0 0 6v2.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5V15a1.8 1.8 0 0 0 0-6z" />
      <path d="M13 6.5v11" strokeDasharray="1.5 2" />
    </svg>
  );
}

export function IcoMegaphone({ className = "w-5 h-5" }: P) {
  return (
    <svg {...base(className)}>
      <path d="M4 9.5v5a1.5 1.5 0 0 0 1.5 1.5H7l1 4h2l-.7-4L19 20V4L9.5 8H5.5A1.5 1.5 0 0 0 4 9.5z" />
    </svg>
  );
}

export function IcoLink({ className = "w-5 h-5" }: P) {
  return (
    <svg {...base(className)}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M8 12 5.8 14.2a3.2 3.2 0 0 0 4.5 4.5L13 16.3" />
      <path d="M16 12l2.2-2.2a3.2 3.2 0 0 0-4.5-4.5L11 7.7" />
    </svg>
  );
}

export function IcoShare({ className = "w-5 h-5" }: P) {
  return (
    <svg {...base(className)}>
      <circle cx="6" cy="12" r="2.3" />
      <circle cx="17.5" cy="6" r="2.3" />
      <circle cx="17.5" cy="18" r="2.3" />
      <path d="M8 11 15.5 7M8 13l7.5 4" />
    </svg>
  );
}

export function IcoBolt({ className = "w-5 h-5" }: P) {
  return (
    <svg {...base(className)}>
      <path d="M13 2 4 13.5h6L11 22l9-11.5h-6z" />
    </svg>
  );
}

export function IcoUsers({ className = "w-5 h-5" }: P) {
  return (
    <svg {...base(className)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c0-3.3 2.7-5 6-5s6 1.7 6 5" />
      <path d="M16 5.2A3 3 0 0 1 16 11M21 19c0-2.6-1.4-4.2-3.5-4.8" />
    </svg>
  );
}

export function IcoCheck({ className = "w-5 h-5" }: P) {
  return (
    <svg {...base(className)}>
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  );
}

export function IcoLock({ className = "w-5 h-5" }: P) {
  return (
    <svg {...base(className)}>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function IcoSpark({ className = "w-5 h-5" }: P) {
  return (
    <svg {...base(className)}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </svg>
  );
}

export function IcoTrophy({ className = "w-5 h-5" }: P) {
  return (
    <svg {...base(className)}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0z" />
      <path d="M7 5H4v1.5A3.5 3.5 0 0 0 7 10M17 5h3v1.5A3.5 3.5 0 0 1 17 10M9.5 15h5M12 13v2M8.5 20h7l-.7-3h-5.6z" />
    </svg>
  );
}

/**
 * The Bid Critter — Northwood's woodland mascot (a little fox), used for
 * celebratory moments (winner cards, giveaway hero). Rustic palette, not
 * line-only, so it reads as the site's character rather than an icon.
 */
export function BidCritter({ className = "w-16 h-16" }: P) {
  const INK = "#241a12";
  const FUR = "#c47b3e";
  const FUR_DK = "#a85f28";
  const CREAM = "#fbf4e6";
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {/* ears */}
      <path d="M14 22 L10 6 L26 16 Z" fill={FUR} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M50 22 L54 6 L38 16 Z" fill={FUR} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M15 18 L13 10 L21 16 Z" fill={FUR_DK} />
      <path d="M49 18 L51 10 L43 16 Z" fill={FUR_DK} />
      {/* head */}
      <path d="M32 14 C46 14 52 24 52 34 C52 46 43 54 32 54 C21 54 12 46 12 34 C12 24 18 14 32 14 Z" fill={FUR} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      {/* cheeks / muzzle cream */}
      <path d="M32 30 C40 30 46 34 46 40 C46 47 39 52 32 52 C25 52 18 47 18 40 C18 34 24 30 32 30 Z" fill={CREAM} />
      {/* eyes */}
      <ellipse cx="24" cy="32" rx="2.6" ry="3.2" fill={INK} />
      <ellipse cx="40" cy="32" rx="2.6" ry="3.2" fill={INK} />
      <circle cx="25" cy="31" r="0.9" fill={CREAM} />
      <circle cx="41" cy="31" r="0.9" fill={CREAM} />
      {/* nose + smile */}
      <path d="M32 40 l-3 -2 h6 z" fill={INK} />
      <path d="M32 42 v2 M32 44 c-3 0 -4 -1.5 -4 -1.5 M32 44 c3 0 4 -1.5 4 -1.5" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
