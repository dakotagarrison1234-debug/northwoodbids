import { SIZE_EMPTY, SIZE_ORDER, SIZE_STYLE, sizeKeyOf } from "@/lib/shipping/sizes";
import { fmtCents } from "@/lib/shipping/tiers";

type Fit = { key: "SMALL" | "MEDIUM" | "LARGE"; count: number };

/**
 * Three equal blocks: how many more of each size ride free in the box.
 *
 *   [ 3 ]        [ 1 ]        [   ]
 *   SMALL FREE   MEDIUM FREE  LARGE
 *
 * A block fills with its size colour when something fits; at zero it goes sand
 * and drops the word "free". `step` marks the one size that would tip the box
 * into the next price (ink block, gold "+$3.50") — the item page passes the
 * lot's own size there. Dumb on purpose: the caller computes `fits`.
 */
export default function FreeBlocks({
  fits,
  size = "compact",
  step = null,
  className = "",
}: {
  fits: Fit[];
  /** compact = 22px numbers (item page, Quick Bid); large = 30px (/shipping). */
  size?: "compact" | "large";
  step?: { key: "SMALL" | "MEDIUM" | "LARGE"; cents: number } | null;
  className?: string;
}) {
  const num = size === "large" ? "text-[30px]" : "text-[22px]";
  // "+$10.00" (the biggest step) at full size would brush a 375px block's edge; one notch down keeps it clear.
  const stepNum = size === "large" ? "text-[26px] tracking-tight" : "text-[20px] tracking-tight";
  const pad = size === "large" ? "px-1 pt-3 pb-2.5" : "px-1 pt-2 pb-1.5";
  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`}>
      {SIZE_ORDER.map((key) => {
        const style = SIZE_STYLE[sizeKeyOf(key)];
        const count = fits.find((f) => f.key === key)?.count ?? 0;
        const isStep = step?.key === key;
        const on = count > 0;
        const bg = isStep ? "#241a12" : on ? style.bg : SIZE_EMPTY.bg;
        const fg = isStep ? "#f0a35a" : on ? style.fg : SIZE_EMPTY.fg;
        // "+$3.50" means this size is NOT free, so its label drops the word too.
        const label = `${style.label.toUpperCase()}${on && !isStep ? " FREE" : ""}`;
        return (
          <div key={key} className={`rounded-xl text-center min-w-0 ${pad}`} style={{ background: bg, color: fg }}>
            <div className={`${isStep ? stepNum : num} font-black leading-none tabular-nums`}>{isStep ? `+${fmtCents(step.cents)}` : count}</div>
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] leading-tight mt-1">{label}</div>
          </div>
        );
      })}
    </div>
  );
}
