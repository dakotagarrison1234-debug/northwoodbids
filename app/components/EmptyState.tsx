/* ───────────────────────────────────────────────────────────
   Northwood Bids — empty state
   WoodenCrate illustration + title + optional message + optional CTA.
   ─────────────────────────────────────────────────────────── */
import { WoodenCrate } from "./Illustrations";

interface EmptyStateProps {
  title: string;
  message?: string;
  /** Optional call-to-action rendered below the message (e.g. a Link/button). */
  cta?: React.ReactNode;
  className?: string;
}

export default function EmptyState({ title, message, cta, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center text-center py-12 px-6 ${className}`}>
      <WoodenCrate className="w-28 h-24 mb-4" />
      <h3 className="text-lg font-semibold text-[#241a12]">{title}</h3>
      {message && <p className="text-[#8a7559] text-sm mt-1.5 max-w-sm">{message}</p>}
      {cta && <div className="mt-5">{cta}</div>}
    </div>
  );
}
