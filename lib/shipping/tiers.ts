/**
 * Shipping numbers — the single source for presets, boxes, zones and the price
 * table (docs/shipping-research.md §4c / §9). Pure functions, no I/O, so the
 * item page, the bundle engine and the admin queue all agree to the cent.
 *
 * Model in one breath: everything a buyer wins in a night rides in ONE box, and
 * the box is priced by how many SPOTS it holds (a Small lot takes 1 spot, a
 * Medium 2, a Large 5) and where it goes. 1–2 spots, up to 10, up to 20, up to
 * 40: four box prices, and a lot only ever costs the difference between them.
 * Weight still sets the hard limits and the real label; spots set the price,
 * because "8 more small lots fit" is something a bidder can picture and
 * "0.6 lb of headroom" is not. We rate-shop the real label and keep/eat the spread.
 */

export type ShipPresetKey = "SMALL" | "MEDIUM" | "LARGE" | "CUSTOM";

export type Dims = { l: number; w: number; h: number }; // inches

/**
 * Calibrated to what Northwood actually lists (Oct 2026):
 *   Small  — phone case, pens, markers, makeup bag, hand towel, charger, headphones, tape dispenser
 *   Medium — Nerf pistol, body towel, stuffed animal, small neck fan: about 8×8×6, about 1 lb
 *   Large  — 2 to 5 lb, bigger than 8×8×6 (rarely shipped)
 * The weight is the packed weight used for pricing; the dims drive which stock box
 * a bundle snaps to. A lister can nudge the weight on any preset.
 */
export const PRESETS: Record<Exclude<ShipPresetKey, "CUSTOM">, { label: string; hint: string; examples: string; weightOz: number; dims: Dims }> = {
  SMALL:  { label: "Small",  hint: "under 8 oz", examples: "phone case, charger, pens, hand towel", weightOz: 6,  dims: { l: 6,  w: 4, h: 3 } },
  MEDIUM: { label: "Medium", hint: "about 1 lb",  examples: "Nerf pistol, body towel, stuffed animal", weightOz: 16, dims: { l: 8,  w: 8, h: 6 } },
  LARGE:  { label: "Large",  hint: "2 to 5 lb",   examples: "bigger than a shoebox", weightOz: 56, dims: { l: 12, w: 9, h: 6 } },
};

/** Hard limits — past these a lot is pickup-only, Custom included (no override). */
export const MAX_WEIGHT_OZ = 20 * 16;   // 20 lb
export const MAX_SIDE_IN = 22;

/** Standard box stock at the shipping station (§9.16). cuFt is informational. */
export const BOXES: { code: string; dims: Dims; cuFt: number; tareOz: number }[] = [
  { code: "6x4x4",   dims: { l: 6,  w: 4,  h: 4 }, cuFt: 0.06, tareOz: 3 },
  { code: "8x6x4",   dims: { l: 8,  w: 6,  h: 4 }, cuFt: 0.11, tareOz: 4 },
  { code: "10x8x6",  dims: { l: 10, w: 8,  h: 6 }, cuFt: 0.28, tareOz: 6 },
  { code: "12x9x6",  dims: { l: 12, w: 9,  h: 6 }, cuFt: 0.38, tareOz: 8 },
  { code: "14x10x8", dims: { l: 14, w: 10, h: 8 }, cuFt: 0.65, tareOz: 11 },
  { code: "16x12x8", dims: { l: 16, w: 12, h: 8 }, cuFt: 0.89, tareOz: 14 },
  { code: "18x14x8", dims: { l: 18, w: 14, h: 8 }, cuFt: 1.17, tareOz: 18 },
];

/**
 * Zones from the buyer's state, seen from Michigan. 1 = Michigan, 2 = everything
 * else east of the Rockies, 3 = West/Far (incl. Texas). Deliberately coarse and
 * customer-leaning (§4c). Lower 48 only — AK/HI/PR/territories return null.
 */
export const FAR_STATES = new Set(["WA", "OR", "CA", "NV", "ID", "MT", "WY", "UT", "CO", "AZ", "NM", "TX"]);
export const NOT_SHIPPABLE = new Set(["AK", "HI", "PR", "GU", "VI", "AS", "MP", "AA", "AE", "AP"]);
export const LOWER_48 = new Set([
  "AL","AZ","AR","CA","CO","CT","DE","FL","GA","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO",
  "MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV",
  "WI","WY","DC",
]);

export function zoneForState(stateRaw: string | null | undefined): 1 | 2 | 3 | null {
  const st = (stateRaw ?? "").trim().toUpperCase();
  if (!LOWER_48.has(st)) return null;
  if (st === "MI") return 1;
  if (FAR_STATES.has(st)) return 3;
  return 2;
}

export const ZONE_LABEL: Record<1 | 2 | 3, string> = { 1: "Michigan", 2: "Midwest & East", 3: "West" };

// ─── Spots: what a box costs ──────────────────────────────────────────────

/** Spots each preset takes in a box. */
export const SPOTS: Record<Exclude<ShipPresetKey, "CUSTOM">, number> = { SMALL: 1, MEDIUM: 2, LARGE: 5 };

/** A spot is about a Small lot plus its fill: half a pound packed. */
export const OZ_PER_SPOT = 8;

/**
 * Spots a lot takes. Presets use SPOTS (more if the lister nudged the weight up
 * past the preset); Custom lots count half a pound per spot, at least one.
 */
export function spotsFor(preset: ShipPresetKey | null | undefined, weightOz: number): number {
  if (preset === "SMALL" || preset === "MEDIUM" || preset === "LARGE") {
    const base = SPOTS[preset];
    return weightOz > PRESETS[preset].weightOz ? Math.max(base, Math.ceil(weightOz / OZ_PER_SPOT)) : base;
  }
  return Math.max(1, Math.ceil(Math.max(1, weightOz) / OZ_PER_SPOT));
}

/**
 * The four box prices: up to N spots × zone (Michigan / Midwest & East / West),
 * in cents. Same dollar steps as the old weight bands (1–2 spots ≈ under 1 lb,
 * up to 10 ≈ 5 lb), now counted in lots instead of ounces.
 */
export const BOX_PRICES: { upTo: number; cents: [number, number, number] }[] = [
  { upTo: 2,  cents: [549, 699, 799] },
  { upTo: 10, cents: [749, 999, 1299] },
  { upTo: 20, cents: [1099, 1499, 1999] },
  { upTo: 40, cents: [1499, 2199, 2999] },
];

/** A box never holds more than this; the next lot starts a new box. */
export const MAX_SPOTS = BOX_PRICES[BOX_PRICES.length - 1].upTo;

export function boxStepIndex(spots: number): number {
  const i = BOX_PRICES.findIndex((t) => spots <= t.upTo);
  return i === -1 ? BOX_PRICES.length - 1 : i;
}

/** What a box holding this many spots costs, in cents (0 for an empty box). */
export function boxCents(spots: number, zone: 1 | 2 | 3): number {
  if (spots <= 0) return 0;
  return BOX_PRICES[boxStepIndex(spots)].cents[zone - 1];
}

/** The money rule: a lot costs only what it moves the box price by (≥ 0). */
export function addCents(beforeSpots: number, afterSpots: number, zone: 1 | 2 | 3): number {
  return Math.max(0, boxCents(afterSpots, zone) - boxCents(beforeSpots, zone));
}

/** The cheapest a box with this lot can be: the Michigan price. */
export function shipsFromCents(spots: number): number {
  return boxCents(Math.max(1, spots), 1);
}

/**
 * Everything a bidder needs to picture their box at `spots`:
 * the price now, how many spots are left at that price, and the next step.
 *   { spots, capacity, priceCents, leftAtThisPrice, next: { upTo, cents, extraCents } | null, full }
 * `full` = no room at all (the next lot starts a new box).
 */
export function boxView(spots: number, zone: 1 | 2 | 3) {
  const s = Math.max(0, spots);
  const i = boxStepIndex(Math.max(1, s));
  const step = BOX_PRICES[i];
  const nextStep = BOX_PRICES[i + 1] ?? null;
  const priceCents = s > 0 ? step.cents[zone - 1] : 0;
  return {
    spots: s,
    capacity: step.upTo,
    priceCents,
    stepPriceCents: step.cents[zone - 1],
    leftAtThisPrice: Math.max(0, step.upTo - s),
    next: nextStep ? { upTo: nextStep.upTo, cents: nextStep.cents[zone - 1], extraCents: nextStep.cents[zone - 1] - step.cents[zone - 1] } : null,
    full: s >= MAX_SPOTS,
  };
}

export type BoxView = ReturnType<typeof boxView>;

export const fmtCents = (c: number) => `$${(c / 100).toFixed(2)}`;

// ─── Item → packed footprint ───────────────────────────────────────────────

export type ShipItem = {
  preset: ShipPresetKey | null;
  weightOz: number | null;
  dims: Partial<Dims> | null;
};

/** Resolve a lot's packed weight + dims from its preset (or custom values). */
export function footprint(it: ShipItem): { weightOz: number; dims: Dims } | null {
  if (it.preset && it.preset !== "CUSTOM") {
    const p = PRESETS[it.preset];
    return { weightOz: it.weightOz ?? p.weightOz, dims: { ...p.dims, ...(it.dims ?? {}) } as Dims };
  }
  if (it.preset === "CUSTOM" && it.weightOz && it.dims?.l && it.dims?.w && it.dims?.h) {
    return { weightOz: it.weightOz, dims: { l: it.dims.l, w: it.dims.w, h: it.dims.h } };
  }
  return null;
}

/** Can this lot be shipped at all (within the hard limits)? */
export function withinLimits(fp: { weightOz: number; dims: Dims }): boolean {
  const longest = Math.max(fp.dims.l, fp.dims.w, fp.dims.h);
  return fp.weightOz <= MAX_WEIGHT_OZ && longest <= MAX_SIDE_IN;
}

/**
 * Incremental weight when a lot joins an existing box: the item itself plus
 * 2 oz of fill. The box is only counted once (via the first item's preset
 * weight, which already includes a box).
 */
export const FILL_OZ = 2;

// ─── Bundle math ───────────────────────────────────────────────────────────

const vol = (d: Dims) => d.l * d.w * d.h;

/**
 * Packed weight + snapped box for a set of lots. First lot = its full packed
 * weight; each further lot adds its weight + fill. Box = smallest standard box
 * whose volume ≥ sum of item volumes × 1.15, floored at the largest single lot's
 * dims. Falls back to the biggest box when nothing fits (admin can override).
 */
export function packBundle(items: { weightOz: number; dims: Dims }[]): { weightOz: number; box: (typeof BOXES)[number] | null; overLimit: boolean } {
  if (items.length === 0) return { weightOz: 0, box: null, overLimit: false };
  const weightOz = items.reduce((s, it, i) => s + it.weightOz + (i === 0 ? 0 : FILL_OZ), 0);
  // A preset's dims already ARE its packed box, so a single lot snaps to the box
  // that fits its dims; the 15% fill factor only applies when combining lots.
  const need = items.reduce((s, it) => s + vol(it.dims), 0) * (items.length > 1 ? 1.15 : 1);
  const biggest = items.reduce((m, it) => {
    const s = [it.dims.l, it.dims.w, it.dims.h].sort((a, b) => b - a);
    return [Math.max(m[0], s[0]), Math.max(m[1], s[1]), Math.max(m[2], s[2])];
  }, [0, 0, 0]);
  const fits = (b: (typeof BOXES)[number]) => {
    const s = [b.dims.l, b.dims.w, b.dims.h].sort((a, b2) => b2 - a);
    return vol(b.dims) >= need && s[0] >= biggest[0] && s[1] >= biggest[1] && s[2] >= biggest[2];
  };
  const box = BOXES.find(fits) ?? BOXES[BOXES.length - 1];
  const overLimit = weightOz > MAX_WEIGHT_OZ || Math.max(...biggest) > MAX_SIDE_IN;
  return { weightOz, box, overLimit };
}

// ─── Listing input → stored fields ─────────────────────────────────────────

export type ShipFields = {
  shipEligible: boolean;
  shipPreset: ShipPresetKey | null;
  shipWeightOz: number | null;
  shipLengthIn: number | null;
  shipWidthIn: number | null;
  shipHeightIn: number | null;
};

export const OVER_LIMIT_MESSAGE = "Over 20 lb or 22 in can't ship — pickup only.";

/**
 * Validate what the listing form sends and turn it into the columns we store.
 * Presets snap to PRESETS (the form can't nudge them); Custom needs all four
 * numbers and must sit inside the hard limits (20 lb / 22 in) — anything bigger
 * is refused, not overridden. Returns { error } on bad input so the API can 400.
 */
export function parseShipInput(body: {
  shipEligible?: unknown; shipPreset?: unknown; shipWeightOz?: unknown;
  shipLengthIn?: unknown; shipWidthIn?: unknown; shipHeightIn?: unknown;
}): { fields: ShipFields } | { error: string } {
  const off: ShipFields = { shipEligible: false, shipPreset: null, shipWeightOz: null, shipLengthIn: null, shipWidthIn: null, shipHeightIn: null };
  const preset = typeof body.shipPreset === "string" ? body.shipPreset.toUpperCase() : "";
  if (!preset || body.shipEligible === false) return { fields: off };
  if (preset === "SMALL" || preset === "MEDIUM" || preset === "LARGE") {
    const p = PRESETS[preset];
    // A preset may carry a nudged weight ("Medium, but it's really 4.5 lb"); the
    // box dims always come from the preset. Anything over the ceiling is refused.
    const nudged = Number(body.shipWeightOz);
    const weightOz = Number.isFinite(nudged) && nudged > 0 ? Math.round(nudged) : p.weightOz;
    if (weightOz > MAX_WEIGHT_OZ) return { error: OVER_LIMIT_MESSAGE };
    return { fields: { shipEligible: true, shipPreset: preset, shipWeightOz: weightOz, shipLengthIn: p.dims.l, shipWidthIn: p.dims.w, shipHeightIn: p.dims.h } };
  }
  if (preset !== "CUSTOM") return { error: "Unknown shipping size." };
  const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : null; };
  const weightOz = n(body.shipWeightOz);
  const l = n(body.shipLengthIn), w = n(body.shipWidthIn), h = n(body.shipHeightIn);
  if (!weightOz) return { error: "Custom shipping needs a weight." };
  if (!l || !w || !h) return { error: "Custom shipping needs length, width and height." };
  if (weightOz > MAX_WEIGHT_OZ || Math.max(l, w, h) > MAX_SIDE_IN) return { error: OVER_LIMIT_MESSAGE };
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { fields: { shipEligible: true, shipPreset: "CUSTOM", shipWeightOz: Math.round(weightOz), shipLengthIn: r2(l), shipWidthIn: r2(w), shipHeightIn: r2(h) } };
}

/**
 * How we explain it — the address modal, /shipping and the help page all read
 * these same lines so the story never drifts. Short sentences, one idea each.
 */
export const HOW_IT_WORKS = [
  "Pick Ship once. It sticks for every lot until you switch back to Pickup.",
  "Everything you win in a night ships in one box, for one price.",
  "A small lot takes 1 spot, a medium 2, a large 5.",
  "1 to 2 spots is the lowest price. Up to 10 spots costs a few dollars more, and so on.",
  "Each warehouse packs its own box: Corunna and Gladwin.",
  "Ground to the lower 48. Ships 3 to 5 business days after the auction closes and every lot is paid.",
  "No refunds once the label prints.",
];
