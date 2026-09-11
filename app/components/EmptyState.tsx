/* ───────────────────────────────────────────────────────────
   Northwood Bids — empty state
   An open crate (or the Bid Critter) + a short, confident line + optional CTA.
   ─────────────────────────────────────────────────────────── */
import { WoodenCrate } from "./Illustrations";
import { BidCritter } from "./BidIcons";

interface EmptyStateProps {
  title: string;
  message?: string;
  /** Optional call-to-action rendered below the message (e.g. a Link/button). */
  cta?: React.ReactNode;
  /** "crate" (default) for empty lists; "critter" for friendlier, personal spots. */
  art?: "crate" | "critter";
  /** Wrap in a cream card with a dashed border (good inside grids). */
  framed?: boolean;
  className?: string;
}

export default function EmptyState({ title, message, cta, art = "crate", framed = false, className = "" }: EmptyStateProps) {
  const frame = framed ? "rounded-2xl border border-dashed border-[#cdbda3] bg-[#fbf4e6]/70" : "";
  return (
    <div className={`flex flex-col items-center text-center py-12 px-6 ${frame} ${className}`}>
      <div className="nb-float mb-4">
        {art === "critter" ? <BidCritter className="w-20 h-20" /> : <WoodenCrate className="w-28 h-24" />}
      </div>
      <h3 className="font-display text-lg font-bold text-[#241a12]">{title}</h3>
      {message && <p className="text-[#8a7559] text-sm mt-1.5 max-w-sm leading-relaxed">{message}</p>}
      {cta && <div className="mt-5">{cta}</div>}
    </div>
  );
}
