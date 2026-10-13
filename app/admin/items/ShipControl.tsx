"use client";
import { Input, Pill } from "../ui";
import {
  PRESETS, MAX_WEIGHT_OZ, MAX_SIDE_IN, OVER_LIMIT_MESSAGE, fromCents, fmtCents, withinLimits,
  type ShipPresetKey,
} from "@/lib/shipping/tiers";

/**
 * The "Ships?" row on Add a lot / Edit lot. Off by default; Small / Medium / Large
 * take their packed weight + box from PRESETS; Custom reveals weight (lb + oz) and
 * L x W x H. One live hint line under the chips shows the "Ships from" price.
 * Shared by both forms so the labels can't drift apart.
 */

export type ShipFormValue = {
  preset: "" | ShipPresetKey;
  weightLb: string;
  weightOz: string;
  lengthIn: string;
  widthIn: string;
  heightIn: string;
};

export const SHIP_OFF: ShipFormValue = { preset: "", weightLb: "", weightOz: "", lengthIn: "", widthIn: "", heightIn: "" };

/** Form state → the fields POST /api/items and PATCH /api/items/[id] accept. */
export function shipPayload(v: ShipFormValue) {
  if (!v.preset) {
    return { shipEligible: false, shipPreset: null, shipWeightOz: null, shipLengthIn: null, shipWidthIn: null, shipHeightIn: null };
  }
  if (v.preset !== "CUSTOM") {
    const p = PRESETS[v.preset];
    const nudged = customOz(v);
    return { shipEligible: true, shipPreset: v.preset, shipWeightOz: nudged > 0 ? nudged : p.weightOz, shipLengthIn: p.dims.l, shipWidthIn: p.dims.w, shipHeightIn: p.dims.h };
  }
  const oz = customOz(v);
  return {
    shipEligible: true, shipPreset: "CUSTOM" as const,
    shipWeightOz: oz > 0 ? oz : null,
    shipLengthIn: num(v.lengthIn), shipWidthIn: num(v.widthIn), shipHeightIn: num(v.heightIn),
  };
}

/** API item → form state (the edit form loads with this). */
export function shipFromItem(it: {
  shipEligible?: boolean | null; shipPreset?: string | null; shipWeightOz?: number | null;
  shipLengthIn?: number | string | null; shipWidthIn?: number | string | null; shipHeightIn?: number | string | null;
}): ShipFormValue {
  if (!it.shipEligible || !it.shipPreset) return SHIP_OFF;
  const preset = it.shipPreset as ShipPresetKey;
  const oz = it.shipWeightOz ?? 0;
  if (preset !== "CUSTOM") {
    // Keep a nudged weight visible; a stock preset weight shows as blank (= default).
    const nudged = oz > 0 && oz !== PRESETS[preset].weightOz;
    return { ...SHIP_OFF, preset, weightLb: nudged ? String(Math.floor(oz / 16)) : "", weightOz: nudged ? String(oz % 16) : "" };
  }
  return {
    preset: "CUSTOM",
    weightLb: String(Math.floor(oz / 16)),
    weightOz: String(oz % 16),
    lengthIn: it.shipLengthIn != null ? String(Number(it.shipLengthIn)) : "",
    widthIn: it.shipWidthIn != null ? String(Number(it.shipWidthIn)) : "",
    heightIn: it.shipHeightIn != null ? String(Number(it.shipHeightIn)) : "",
  };
}

const num = (s: string): number | null => {
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const customOz = (v: ShipFormValue) => {
  const lb = parseFloat(v.weightLb) || 0;
  const oz = parseFloat(v.weightOz) || 0;
  return Math.round(lb * 16 + oz);
};

/** Human check used by the forms before saving; null when fine. */
export function shipProblem(v: ShipFormValue): string | null {
  if (!v.preset) return null;
  if (v.preset !== "CUSTOM") return customOz(v) > MAX_WEIGHT_OZ ? OVER_LIMIT_MESSAGE : null;
  const oz = customOz(v);
  if (oz <= 0) return "Custom shipping needs a weight.";
  const l = num(v.lengthIn), w = num(v.widthIn), h = num(v.heightIn);
  if (!l || !w || !h) return "Custom shipping needs length, width and height.";
  if (!withinLimits({ weightOz: oz, dims: { l, w, h } })) return OVER_LIMIT_MESSAGE;
  return null;
}

const labelCls = "text-[13px] font-black uppercase tracking-[0.14em] text-[#8a7559] mb-1 block";
const fmtLb = (oz: number) => (oz < 16 ? `${oz} oz` : `${Math.round((oz / 16) * 10) / 10} lb`);

function Chip({ on, children, disabled, onClick, className = "" }: { on: boolean; children: React.ReactNode; disabled?: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex flex-col items-center justify-center min-h-[44px] px-2 rounded-xl text-[15px] font-bold border transition-colors leading-tight disabled:opacity-60 ${
        on ? "bg-[#241a12] text-[#f6ecda] border-[#241a12] shadow-sm" : "bg-white text-[#6f5b46] border-[#e6dac6] hover:bg-[#f4ede1]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export default function ShipControl({ value, onChange, readOnly = false, lockedNote = "Locked once sold." }: { value: ShipFormValue; onChange: (v: ShipFormValue) => void; readOnly?: boolean; lockedNote?: string }) {
  const set = (patch: Partial<ShipFormValue>) => onChange({ ...value, ...patch });

  // Live hint under the chips.
  let hint: React.ReactNode = null;
  if (value.preset && value.preset !== "CUSTOM") {
    const p = PRESETS[value.preset];
    const oz = customOz(value) > 0 ? customOz(value) : p.weightOz;
    hint = oz > MAX_WEIGHT_OZ
      ? <span className="text-red-700">{OVER_LIMIT_MESSAGE}</span>
      : <>Counts as <strong className="text-[#241a12]">{fmtLb(oz)}</strong> in {p.dims.l === 8 || p.dims.l === 18 ? "an" : "a"} {p.dims.l}×{p.dims.w}×{p.dims.h} box · {p.examples} · ships from <strong className="text-[#241a12]">{fmtCents(fromCents(oz))}</strong> in Michigan</>;
  } else if (value.preset === "CUSTOM") {
    const oz = customOz(value);
    const l = num(value.lengthIn), w = num(value.widthIn), h = num(value.heightIn);
    if (oz > 0 && l && w && h) {
      const fp = { weightOz: oz, dims: { l, w, h } };
      hint = withinLimits(fp)
        ? <>Ships from <strong className="text-[#241a12]">{fmtCents(fromCents(oz))}</strong> in Michigan</>
        : <span className="text-red-700">{OVER_LIMIT_MESSAGE}</span>;
    } else {
      hint = `Enter weight and size to see the price (up to ${MAX_WEIGHT_OZ / 16} lb, ${MAX_SIDE_IN} in on the longest side).`;
    }
  }

  if (readOnly) {
    const label = !value.preset ? "Off" : value.preset === "CUSTOM" ? "Custom" : PRESETS[value.preset].label;
    return (
      <div>
        <span className={labelCls}>Ships?</span>
        <div className="flex flex-wrap items-center gap-2 min-h-[44px]">
          <Pill tone={value.preset ? "green" : "slate"}>{label}</Pill>
          {hint && <span className="text-[15px] text-[#8a7559]">{hint}</span>}
          <span className="text-[15px] text-[#8a7559]">{lockedNote}</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <span className={labelCls}>Ships?</span>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
        <Chip on={!value.preset} onClick={() => onChange(SHIP_OFF)}>Off</Chip>
        {(["SMALL", "MEDIUM", "LARGE"] as const).map((k) => (
          <Chip key={k} on={value.preset === k} onClick={() => set({ preset: k, weightLb: "", weightOz: "" })}>
            <span>{PRESETS[k].label}</span>
            <span className={`text-[13px] font-semibold ${value.preset === k ? "text-[#f6ecda]/70" : "text-[#8a7559]"}`}>{PRESETS[k].hint}</span>
            <span className={`text-[13px] font-semibold ${value.preset === k ? "text-[#f6ecda]/70" : "text-[#8a7559]"}`}>{PRESETS[k].dims.l}×{PRESETS[k].dims.w}×{PRESETS[k].dims.h}</span>
          </Chip>
        ))}
        <Chip on={value.preset === "CUSTOM"} onClick={() => set({ preset: "CUSTOM" })}>
          <span>Custom</span>
          <span className={`text-[13px] font-semibold ${value.preset === "CUSTOM" ? "text-[#f6ecda]/70" : "text-[#8a7559]"}`}>type it in</span>
        </Chip>
      </div>

      {value.preset && value.preset !== "CUSTOM" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[15px] text-[#8a7559]">Heavier or lighter than that? Weight:</span>
          <div className="relative w-24">
            <Input value={value.weightLb} onChange={(e) => set({ weightLb: e.target.value })} type="number" inputMode="decimal" min={0} placeholder={String(Math.floor(PRESETS[value.preset].weightOz / 16))} className="!pr-9 tabular-nums" aria-label="Pounds" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a7559] font-bold text-[15px]">lb</span>
          </div>
          <div className="relative w-24">
            <Input value={value.weightOz} onChange={(e) => set({ weightOz: e.target.value })} type="number" inputMode="decimal" min={0} max={15} placeholder={String(PRESETS[value.preset].weightOz % 16)} className="!pr-9 tabular-nums" aria-label="Ounces" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a7559] font-bold text-[15px]">oz</span>
          </div>
        </div>
      )}

      {value.preset === "CUSTOM" && (
        <div className="mt-2 rounded-xl bg-[#faf5ea] border border-[#e6dac6] p-3 space-y-2">
          <div>
            <span className={labelCls}>Weight</span>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <Input value={value.weightLb} onChange={(e) => set({ weightLb: e.target.value })} type="number" inputMode="decimal" min={0} placeholder="0" className="!pr-10 tabular-nums" aria-label="Pounds" />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8a7559] font-bold text-[15px]">lb</span>
              </div>
              <div className="relative">
                <Input value={value.weightOz} onChange={(e) => set({ weightOz: e.target.value })} type="number" inputMode="decimal" min={0} max={15} placeholder="0" className="!pr-10 tabular-nums" aria-label="Ounces" />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8a7559] font-bold text-[15px]">oz</span>
              </div>
            </div>
          </div>
          <div>
            <span className={labelCls}>Size (inches)</span>
            <div className="grid grid-cols-3 gap-2">
              <Input value={value.lengthIn} onChange={(e) => set({ lengthIn: e.target.value })} type="number" inputMode="decimal" min={0} placeholder="L" className="tabular-nums" aria-label="Length in inches" />
              <Input value={value.widthIn} onChange={(e) => set({ widthIn: e.target.value })} type="number" inputMode="decimal" min={0} placeholder="W" className="tabular-nums" aria-label="Width in inches" />
              <Input value={value.heightIn} onChange={(e) => set({ heightIn: e.target.value })} type="number" inputMode="decimal" min={0} placeholder="H" className="tabular-nums" aria-label="Height in inches" />
            </div>
          </div>
        </div>
      )}

      {hint && <p className="text-[15px] text-[#8a7559] mt-1.5">{hint}</p>}
    </div>
  );
}
