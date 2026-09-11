/* ───────────────────────────────────────────────────────────
   Northwood Bids — loading spinner
   A leather ring with a small amber tick sweeping the other way.
   Optional label sits beside it in muted brand text.
   ─────────────────────────────────────────────────────────── */

interface SpinnerProps {
  /** Diameter in px. Defaults to 32 (the app's common w-8 h-8). */
  size?: number;
  /** Optional short label, e.g. "Loading lots". */
  label?: string;
  className?: string;
}

export default function Spinner({ size = 32, label, className = "" }: SpinnerProps) {
  const ring = Math.max(2, Math.round(size / 14));
  return (
    <div className={`inline-flex items-center gap-3 ${className}`} role="status" aria-label={label ?? "Loading"}>
      <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
        <span
          className="absolute inset-0 rounded-full animate-spin"
          style={{ border: `${ring}px solid rgba(108,77,57,0.22)`, borderTopColor: "#6c4d39" }}
        />
        <span
          className="nb-spin-rev absolute rounded-full"
          style={{
            inset: Math.round(size * 0.28),
            border: `${ring}px solid transparent`,
            borderBottomColor: "#f0a35a",
          }}
        />
      </span>
      {label && <span className="text-sm text-[#8a7559]">{label}</span>}
    </div>
  );
}
