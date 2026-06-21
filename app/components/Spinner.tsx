/* ───────────────────────────────────────────────────────────
   Northwood Bids — rustic loading spinner
   ─────────────────────────────────────────────────────────── */

interface SpinnerProps {
  /** Diameter in px. Defaults to 32 (the app's common w-8 h-8). */
  size?: number;
  className?: string;
}

export default function Spinner({ size = 32, className = "" }: SpinnerProps) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full border-2 border-[#6c4d39]/30 border-t-[#6c4d39] animate-spin ${className}`}
      aria-label="Loading"
      role="status"
    />
  );
}
