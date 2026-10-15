"use client";
import { TIERS, bandIndex, bandPosition, fmtCents } from "@/lib/shipping/tiers";

/**
 * The band meter: where a box sits on the four weight bands and what the next
 * one costs.
 *
 *   $5.49 (you)            $7.49
 *   [#########|---------|---------|---------]
 *   0        1 lb      5 lb      10 lb    20 lb
 *
 * Each band is a quarter of the bar (to scale, "under 1 lb" would be a sliver)
 * and the fill moves through its band in proportion to the weight. The current
 * band's price sits at the start of its segment; the next band's price sits at
 * the next breakpoint (the start of the next segment). Under 400px the inner breakpoint labels are dropped so nothing
 * collides — the two prices are what matter on a phone.
 *
 * `slim` is the item-page version: one bar, the current band only, no labels.
 */
export default function BandMeter({
  weightOz,
  zone,
  slim = false,
  className = "",
}: {
  weightOz: number;
  zone: 1 | 2 | 3;
  slim?: boolean;
  className?: string;
}) {
  const i = bandIndex(Math.max(1, weightOz));
  const band = TIERS[i];
  const next = TIERS[i + 1] ?? null;
  const top = next === null;
  const fillColor = top ? "bg-[#c47b3e]" : "bg-[#4a7c59]";
  const z = zone - 1;

  if (slim) {
    // Current band only: 0..1 across this band.
    const lo = i === 0 ? 0 : TIERS[i - 1].maxOz;
    const pct = Math.round(Math.min(1, Math.max(0, (weightOz - lo) / (band.maxOz - lo))) * 100);
    return (
      <div
        className={`h-1.5 rounded-full bg-[#efe3d0] overflow-hidden ${className}`}
        role="progressbar"
        aria-valuemin={lo}
        aria-valuemax={band.maxOz}
        aria-valuenow={weightOz}
        aria-label={`Your box: ${band.label} band`}
      >
        <div className={`h-full rounded-full ${fillColor}`} style={{ width: `${pct}%` }} />
      </div>
    );
  }

  const pos = bandPosition(weightOz);
  const n = TIERS.length;
  const segW = 100 / n;
  return (
    <div className={className}>
      {/* Prices: this band's at the start of its segment, the next band's at the next breakpoint. */}
      <div className="relative h-5 text-[13px] tabular-nums">
        <span className="absolute font-black text-[#241a12] whitespace-nowrap" style={{ left: `calc(${i * segW}% + 2px)` }}>
          {fmtCents(band.cents[z])}
        </span>
        {next && (
          <span className="absolute font-semibold text-[#8a7559] whitespace-nowrap" style={{ left: `calc(${(i + 1) * segW}% + 4px)` }}>
            {fmtCents(next.cents[z])}
          </span>
        )}
      </div>
      <div
        className="relative h-3 rounded-full bg-[#efe3d0] border border-[#e3d6bf] overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={TIERS[n - 1].maxOz}
        aria-valuenow={weightOz}
        aria-label={`Box weight: ${band.label} band`}
      >
        <div className={`absolute inset-y-0 left-0 rounded-full ${fillColor}`} style={{ width: `${pos * 100}%` }} />
        {/* Band breakpoints */}
        {TIERS.slice(0, -1).map((t, k) => (
          <span key={t.maxOz} className="absolute inset-y-0 w-px bg-[#241a12]/20" style={{ left: `${(k + 1) * segW}%` }} aria-hidden="true" />
        ))}
      </div>
      {/* Breakpoint labels — hidden under 400px so they never collide. */}
      <div className="relative h-4 mt-1 text-[11px] text-[#8a7559] tabular-nums hidden min-[400px]:block">
        {TIERS.map((t, k) => (
          <span
            key={t.maxOz}
            className={`absolute whitespace-nowrap ${k === n - 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
            style={{ left: `${(k + 1) * segW}%` }}
          >
            {t.maxOz / 16} lb
          </span>
        ))}
      </div>
    </div>
  );
}
