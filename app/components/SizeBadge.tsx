import { SIZE_STYLE, type SizeKey } from "@/lib/shipping/sizes";

/**
 * The size badge: a rounded square with S / M / L (C for a custom size) in the
 * size's colour. It says two things at once — this lot ships, and how big it
 * is. Lives on the item page photo (30px), the grid and list cards (20px) and
 * the lot tiles in a box (20px).
 */
export default function SizeBadge({ size, px = 24, className = "" }: { size: SizeKey; px?: number; className?: string }) {
  const s = SIZE_STYLE[size];
  return (
    <span
      className={`inline-flex items-center justify-center font-black leading-none select-none shrink-0 ${className}`}
      style={{ width: px, height: px, borderRadius: Math.round(px * 0.28), background: s.bg, color: s.fg, fontSize: Math.round(px * 0.52) }}
      title={`${s.label} · ships`}
      aria-label={`${s.label}, ships`}
      role="img"
    >
      {s.letter}
    </span>
  );
}
