// Rustic shimmer placeholder. Warm-toned (not gray) sheen that sweeps left-to-right
// over a parchment base so loading states feel like the content is on its way.
// Pass a `className` to size/shape each block (width, height, rounding, etc.).
export default function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`nb-skeleton rounded-lg ${className}`} aria-hidden="true" />;
}

/** Text-line stack: a few shimmering rows of decreasing width. */
export function SkeletonLines({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  const widths = ["w-11/12", "w-4/5", "w-3/5", "w-2/3", "w-1/2"];
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`nb-skeleton rounded h-3.5 ${widths[i % widths.length]}`} />
      ))}
    </div>
  );
}

/** Lot-card placeholder matching the site's rounded-2xl cream card shape. */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-[#e3d6bf] bg-white overflow-hidden ${className}`} aria-hidden="true">
      <div className="nb-skeleton aspect-[4/3] rounded-none" />
      <div className="p-3.5 space-y-2.5">
        <div className="nb-skeleton rounded h-4 w-5/6" />
        <div className="nb-skeleton rounded h-3.5 w-1/2" />
        <div className="flex items-center justify-between pt-1">
          <div className="nb-skeleton rounded h-5 w-16" />
          <div className="nb-skeleton rounded-full h-7 w-20" />
        </div>
      </div>
    </div>
  );
}
