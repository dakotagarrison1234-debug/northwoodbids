import { SIZE_STYLE, SIZE_HINT, type SizeKey } from "@/lib/shipping/sizes";

/**
 * The ships badge: a coloured pill with a little parcel and the box size
 * letter — "[box] S". The parcel is what keeps "S" from reading as a shirt
 * size; the colour (moss / amber / leather) is the size language used on the
 * Shipping page too. Lives on the item page photo (30px), the grid and list
 * cards (20px) and the lot tiles in a box (20px).
 */
export default function SizeBadge({ size, px = 24, className = "" }: { size: SizeKey; px?: number; className?: string }) {
  const s = SIZE_STYLE[size];
  const icon = Math.round(px * 0.6);
  return (
    <span
      className={`inline-flex items-center font-black leading-none select-none shrink-0 whitespace-nowrap ${className}`}
      style={{
        height: px,
        paddingLeft: Math.round(px * 0.28),
        paddingRight: Math.round(px * 0.32),
        gap: Math.round(px * 0.16),
        borderRadius: px,
        background: s.bg,
        color: s.fg,
        fontSize: Math.round(px * 0.5),
      }}
      title={`Ships · ${s.label} box, ${SIZE_HINT[size]}`}
      aria-label={`Ships, ${s.label} box`}
      role="img"
    >
      <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2.8 3.5 7.2v9.6L12 21.2l8.5-4.4V7.2z" />
        <path d="M3.5 7.2 12 11.6l8.5-4.4M12 11.6v9.6" />
      </svg>
      {s.letter}
    </span>
  );
}
