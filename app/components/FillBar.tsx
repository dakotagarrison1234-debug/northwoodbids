import { TIERS, bandIndex, fmtCents } from "@/lib/shipping/tiers";

/**
 * One bar: how far the box has filled its current price band.
 *
 *   [##########|                 ]
 *   1.8 lb            next size up +$3.50
 *
 * Sand track, moss fill, one dark tick where the band ends (the next price).
 * 6px with no labels on the item page; 14px with the two labels on /shipping.
 */
export default function FillBar({
  weightOz,
  zone,
  height = 6,
  labels = false,
  className = "",
}: {
  weightOz: number;
  zone: 1 | 2 | 3;
  height?: 6 | 14;
  labels?: boolean;
  className?: string;
}) {
  const i = bandIndex(Math.max(1, weightOz));
  const band = TIERS[i];
  const next = TIERS[i + 1] ?? null;
  const lo = i === 0 ? 0 : TIERS[i - 1].maxOz;
  const pct = Math.round(Math.min(1, Math.max(0, (weightOz - lo) / (band.maxOz - lo))) * 100);
  const lb = Math.round((weightOz / 16) * 10) / 10;
  const stepCents = next ? next.cents[zone - 1] - band.cents[zone - 1] : 0;
  return (
    <div className={className}>
      <div
        className="relative w-full rounded-full bg-[#efe3d0] overflow-hidden"
        style={{ height }}
        role="progressbar"
        aria-valuemin={lo}
        aria-valuemax={band.maxOz}
        aria-valuenow={Math.round(weightOz)}
        aria-label={`Box weight: ${lb} lb, ${band.label}`}
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-[#4a7c59]" style={{ width: `${pct}%` }} />
        {/* The band's end: where the next price starts. */}
        <span className="absolute inset-y-0 right-0 w-[3px] bg-[#241a12]" aria-hidden="true" />
      </div>
      {labels && (
        <div className="flex items-center justify-between gap-3 mt-1.5 text-[12px] text-[#8a7559] tabular-nums">
          <span className="font-semibold text-[#6f5b46]">{lb} lb</span>
          <span>{next ? `next size up +${fmtCents(stepCents)}` : "top size"}</span>
        </div>
      )}
    </div>
  );
}
