import { BOX_PRICES, MAX_SPOTS, boxStepIndex, boxView, fmtCents } from "@/lib/shipping/tiers";

/**
 * The buyer's box, pictured: one square per spot, the two prices that matter,
 * and one sentence that answers "if I pay this, how much more can I get?"
 *
 *   Your box to Columbus, OH                    5 of 10 spots
 *   [■][■][■][▣][▣][ ][ ][ ][ ][ ]
 *   1 to 2 spots ............................... $6.99
 *   3 to 10 spots .................... $9.99 total  (you're here)
 *   Win this and 5 more small lots still fit for $9.99 total.
 *   Small lot = 1 spot · medium = 2 · large = 5
 *
 * Squares: won (in the box) moss, winning right now light moss, this lot amber,
 * empty dashed. Prices are always for the WHOLE box, never per lot.
 * Pure display; the caller passes the numbers.
 */
const C_WON = "#4a7c59";
const C_WINNING = "#a9c8b1";
const C_THIS = "#c47b3e";

const lotsWord = (n: number) => `${n} more small lot${n === 1 ? "" : "s"}`;

export default function BoxSpots({
  zone,
  wonSpots = 0,
  winningSpots = 0,
  winningLots = 0,
  thisSpots = 0,
  title = "Your box",
  compact = false,
  emptyNote,
  className = "",
}: {
  zone: 1 | 2 | 3;
  /** Spots already in the open box (won). */
  wonSpots?: number;
  /** Spots of lots the buyer is winning right now (not in a box yet). */
  winningSpots?: number;
  winningLots?: number;
  /** Spots this lot would take (item page). */
  thisSpots?: number;
  title?: React.ReactNode;
  /** Quick Bid: no price rows. */
  compact?: boolean;
  /** Line to show when the box is empty and there's no lot in view. */
  emptyNote?: string;
  className?: string;
}) {
  const total = wonSpots + winningSpots + thisSpots;
  const overflow = total > MAX_SPOTS;
  const shown = Math.min(total, MAX_SPOTS);
  const v = boxView(shown, zone);
  const i = boxStepIndex(Math.max(1, shown));

  // The two price rows: the step the box is on and the next one (or the first two for an empty box).
  const rows = (shown === 0 ? [0, 1] : [i - (BOX_PRICES[i + 1] ? 0 : 1), i + (BOX_PRICES[i + 1] ? 1 : 0)])
    .filter((r, k, a) => r >= 0 && r < BOX_PRICES.length && a.indexOf(r) === k)
    .map((r) => ({
      from: r === 0 ? 1 : BOX_PRICES[r - 1].upTo + 1,
      upTo: BOX_PRICES[r].upTo,
      cents: BOX_PRICES[r].cents[zone - 1],
      current: shown > 0 && r === i,
    }));

  // The one sentence.
  let line: string;
  let tone: "moss" | "amber" = "moss";
  if (overflow) {
    line = "That's more than one box holds: this lot would start a second box.";
    tone = "amber";
  } else if (shown === 0) {
    line = emptyNote ?? `${lotsWord(BOX_PRICES[0].upTo)} ship for ${fmtCents(BOX_PRICES[0].cents[zone - 1])}.`;
  } else if (v.leftAtThisPrice > 0) {
    const more = lotsWord(v.leftAtThisPrice);
    const verb = v.leftAtThisPrice === 1 ? "fits" : "fit";
    line = thisSpots > 0
      ? `Win this and ${more} still ${verb} for ${fmtCents(v.priceCents)} total.`
      : `${more.charAt(0).toUpperCase()}${more.slice(1)} ${verb} for ${fmtCents(v.priceCents)} total.`;
  } else if (v.next) {
    line = `Full at ${fmtCents(v.priceCents)}. The next lot adds ${fmtCents(v.next.extraCents)}, then ${v.next.upTo - shown} more spots fit.`;
    tone = "amber";
  } else {
    line = "This box is full. The next lot starts a new box.";
    tone = "amber";
  }

  const cap = v.capacity;
  const squares = cap <= 20;
  // A 2-spot box draws the whole 10-spot row: the 2 at today's price, the rest
  // faint, so "up to 10 for a few dollars more" is right there in the picture.
  const drawn = cap <= 10 ? 10 : cap;
  const cell = (k: number): React.CSSProperties => {
    if (k < wonSpots) return { background: C_WON };
    if (k < wonSpots + winningSpots) return { background: C_WINNING };
    if (k < shown) return { background: C_THIS };
    if (k < cap) return { border: "1.5px dashed #b9a688" };
    return { border: "1.5px dotted #e3d6bf" };
  };

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-bold text-[#4a3a2b] truncate">{title}</span>
        <span className="text-[#8a7559] tabular-nums shrink-0">{shown} of {cap} spots</span>
      </div>

      {squares ? (
        <div className="grid gap-[3px] mt-1.5" style={{ gridTemplateColumns: `repeat(${drawn}, minmax(0, 1fr))` }}>
          {Array.from({ length: drawn }, (_, k) => <span key={k} className="h-[18px] rounded-[4px] box-border" style={cell(k)} />)}
        </div>
      ) : (
        <div className="relative h-[18px] mt-1.5 rounded-[5px] bg-[#efe3d0] overflow-hidden flex">
          <span style={{ width: `${(wonSpots / cap) * 100}%`, background: C_WON }} />
          <span style={{ width: `${(Math.min(winningSpots, cap - wonSpots) / cap) * 100}%`, background: C_WINNING }} />
          <span style={{ width: `${(Math.max(0, shown - wonSpots - winningSpots) / cap) * 100}%`, background: C_THIS }} />
        </div>
      )}

      {/* Colour key, only when the box mixes kinds of spots. */}
      {[wonSpots, winningSpots, thisSpots].filter((n) => n > 0).length > 1 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[13px] text-[#6f5b46]">
          {wonSpots > 0 && <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px]" style={{ background: C_WON }} />Won</span>}
          {winningSpots > 0 && <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px]" style={{ background: C_WINNING }} />Winning now</span>}
          {thisSpots > 0 && <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px]" style={{ background: C_THIS }} />This lot</span>}
        </div>
      )}

      {!compact && (
        <div className="mt-2">
          {rows.map((r) => (
            <div key={r.upTo} className={`flex items-center justify-between gap-3 py-1.5 border-t border-[#efe3d0] text-[14px] tabular-nums ${r.current ? "font-bold text-[#241a12]" : "text-[#6f5b46]"}`}>
              <span>{r.from === r.upTo ? `${r.upTo} spot${r.upTo === 1 ? "" : "s"}` : `${r.from} to ${r.upTo} spots`}</span>
              <span>{fmtCents(r.cents)}{r.current ? " total" : ""}</span>
            </div>
          ))}
        </div>
      )}

      <p className={`mt-1.5 text-[14px] font-semibold leading-snug ${tone === "moss" ? "text-[#2f5d3a]" : "text-[#8a4f1c]"}`}>{line}</p>
      {winningLots > 0 && (
        <p className="text-[13px] text-[#8a7559] leading-snug">
          Counts the {winningLots} lot{winningLots === 1 ? "" : "s"} you&apos;re winning now. Everything you win tonight ships together.
        </p>
      )}
      {!compact && <p className="text-[13px] text-[#8a7559] mt-0.5">Small lot = 1 spot · medium = 2 · large = 5</p>}
    </div>
  );
}
