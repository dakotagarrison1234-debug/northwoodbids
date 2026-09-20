import type { ReactNode } from "react";
import { IcoGift, IcoSpark } from "./BidIcons";
import { PineMark } from "./Illustrations";

/**
 * Themed section headers for the home page. Each section gets its own colour band
 * so it reads as its own "room" — warm amber for what's heating up, moss green for
 * what's live, espresso for what's on deck, gold for giveaways — plus a tiny eyebrow
 * line, a big display title and a one-line tagline. Pure markup, safe in client or
 * server trees. `compact` shrinks it for slots under the hero; `action` drops a small
 * link on the right where the count pill would otherwise sit.
 */

type Variant = "hot" | "live" | "upcoming" | "giveaway";

const THEME: Record<Variant, { bar: string; tint: string; eyebrow: string; pill: string }> = {
  giveaway: {
    bar: "bg-[#f0a35a]",
    tint: "from-[#fbeacb] via-[#fbeacb]/60 to-transparent",
    eyebrow: "text-[#a85f28]",
    pill: "bg-[#a85f28] text-white",
  },
  hot: {
    bar: "bg-[#c47b3e]",
    tint: "from-[#f7e4c9] via-[#f7e4c9]/60 to-transparent",
    eyebrow: "text-[#a85f28]",
    pill: "bg-[#c47b3e] text-white",
  },
  live: {
    bar: "bg-[#4a7c59]",
    tint: "from-[#dcebdf] via-[#dcebdf]/60 to-transparent",
    eyebrow: "text-[#2f5d3a]",
    pill: "bg-[#4a7c59] text-white",
  },
  upcoming: {
    bar: "bg-[#6c4d39]",
    tint: "from-[#e9dcc6] via-[#e9dcc6]/60 to-transparent",
    eyebrow: "text-[#6c4d39]",
    pill: "bg-[#6c4d39] text-white",
  },
};

function Mark({ variant }: { variant: Variant }) {
  if (variant === "hot") return <IcoSpark className="w-3.5 h-3.5" />;
  if (variant === "giveaway") return <IcoGift className="w-3.5 h-3.5" />;
  if (variant === "live")
    return (
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-[#4a7c59] opacity-70 animate-ping" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#4a7c59]" />
      </span>
    );
  return <PineMark className="w-3.5 h-3.5" />;
}

export default function SectionHeader({
  variant,
  eyebrow,
  title,
  tagline,
  count,
  countLabel,
  compact = false,
  action,
}: {
  variant: Variant;
  eyebrow: string;
  title: string;
  tagline?: string;
  count?: number;
  countLabel?: string;
  /** Smaller title and tighter padding for secondary slots (e.g. under the hero). */
  compact?: boolean;
  /** Optional small link/button rendered on the right. */
  action?: ReactNode;
}) {
  const t = THEME[variant];
  return (
    <div
      className={`relative rounded-2xl bg-gradient-to-r ${t.tint} pl-5 pr-3 sm:pr-4 flex items-center justify-between gap-3 ${
        compact ? "py-3 mb-4" : "py-3.5 sm:py-4 mb-6"
      }`}
    >
      <span className={`absolute left-0 top-3 bottom-3 w-1.5 rounded-full ${t.bar}`} aria-hidden />
      <div className="min-w-0 pl-1">
        <div className={`inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em] ${t.eyebrow}`}>
          <Mark variant={variant} /> {eyebrow}
        </div>
        <h2
          className={`font-display font-black leading-[0.95] tracking-tight text-[#241a12] mt-1 ${
            compact ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"
          }`}
        >
          {title}
        </h2>
        {tagline && <p className="text-sm text-[#6f5b46] mt-1.5 leading-snug">{tagline}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {count != null && count > 0 && (
        <span className={`shrink-0 inline-flex flex-col items-center justify-center rounded-xl px-3 py-1.5 leading-none ${t.pill}`}>
          <span className="font-display font-black text-xl tabular-nums">{count}</span>
          {countLabel && <span className="text-[9px] font-bold uppercase tracking-wider opacity-90 mt-0.5">{countLabel}</span>}
        </span>
      )}
    </div>
  );
}
