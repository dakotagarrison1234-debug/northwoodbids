// Rustic shimmer placeholder. Warm-toned (not gray) sheen that sweeps left→right
// over a parchment base so loading states feel like the content is on its way.
// Pass a `className` to size/shape each block (width, height, rounding, etc.).
export default function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`nb-skeleton rounded-lg ${className}`} aria-hidden="true" />;
}
