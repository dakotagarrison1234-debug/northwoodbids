"use client";

export type ShipMode = "PICKUP" | "SHIP";

/**
 * The two-segment Pickup / Ship switch. One control everywhere the mode shows
 * up (item page, Quick Bid, /shipping) so it always looks and behaves the same:
 *
 *   [ Pickup   Free ]  [ Ship   $5.49 ]
 *
 * Selected segment is leather with cream text; the other is white. Every
 * segment is at least 44px tall so it's a clean thumb target at 375px. Purely
 * presentational — the caller owns the fetch and the optimistic state.
 */
export default function ShipModeSwitch({
  mode,
  onPick,
  shipPrice,
  pickupPrice = "Free",
  busy = false,
  size = "md",
  className = "",
}: {
  mode: ShipMode;
  onPick: (next: ShipMode) => void;
  /** The live number for THIS lot: "$5.49", "+$2.00", "Free", "from $5.49". */
  shipPrice: string;
  pickupPrice?: string;
  busy?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const h = size === "sm" ? "min-h-[44px] px-3" : "min-h-[48px] px-3.5";
  const seg = (on: boolean) =>
    `${h} flex items-center justify-center gap-1.5 rounded-xl font-bold transition-colors disabled:opacity-70 nb-focus ` +
    (on ? "bg-[#6c4d39] text-[#faf5ea]" : "bg-white text-[#241a12] hover:bg-[#faf5ea]");
  const price = (on: boolean) => `tabular-nums font-semibold whitespace-nowrap ${on ? "text-[#f6ecda]/85" : "text-[#8a7559]"}`;
  // "FREE" rides at the same size and weight as "Ship", in gold. Gold on the
  // white (unselected) segment is unreadable, so that side uses amber.
  const free = shipPrice === "FREE";
  const freeCls = (on: boolean) => `text-[15px] font-bold whitespace-nowrap ${on ? "text-[#f0a35a]" : "text-[#c47b3e]"}`;
  return (
    <div
      role="radiogroup"
      aria-label="Pickup or ship"
      className={`grid grid-cols-2 gap-1 p-1 rounded-2xl bg-[#f4ede1] border border-[#e3d6bf] ${className}`}
    >
      <button type="button" role="radio" aria-checked={mode === "PICKUP"} disabled={busy} onClick={() => onPick("PICKUP")} className={seg(mode === "PICKUP")}>
        <span className="text-[15px]">Pickup</span>
        <span className={`text-[13px] ${price(mode === "PICKUP")}`}>{pickupPrice}</span>
      </button>
      <button type="button" role="radio" aria-checked={mode === "SHIP"} disabled={busy} onClick={() => onPick("SHIP")} className={seg(mode === "SHIP")}>
        <span className="text-[15px]">Ship</span>
        <span className={free ? freeCls(mode === "SHIP") : `text-[13px] ${price(mode === "SHIP")}`}>{shipPrice}</span>
      </button>
    </div>
  );
}
