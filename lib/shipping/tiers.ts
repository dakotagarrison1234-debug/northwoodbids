/**
 * Shipping numbers — the single source for presets, boxes, zones and the price
 * table (docs/shipping-research.md §4c / §9). Pure functions, no I/O, so the
 * item page, the bundle engine and the admin queue all agree to the cent.
 *
 * Model in one breath: the buyer pays a flat tier by (bundle weight band × zone);
 * extra wins ride free until the band moves up, then they pay only the difference.
 * The tier is a hard ceiling — we rate-shop the real label and keep/eat the spread.
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

/** Weight bands (packed bundle weight) × zone → price in cents. §4c table. */
export const TIERS: { maxOz: number; label: string; cents: [number, number, number] }[] = [
  { maxOz: 16,  label: "under 1 lb", cents: [549, 699, 799] },
  { maxOz: 80,  label: "1 to 5 lb",  cents: [749, 999, 1299] },
  { maxOz: 160, label: "5 to 10 lb", cents: [1099, 1499, 1999] },
  { maxOz: 320, label: "10 to 20 lb", cents: [1499, 2199, 2999] },
];

export function bandIndex(weightOz: number): number {
  const i = TIERS.findIndex((t) => weightOz <= t.maxOz);
  return i === -1 ? TIERS.length - 1 : i;
}

/** Price for a bundle of this packed weight going to this zone, in cents. */
export function tierCents(weightOz: number, zone: 1 | 2 | 3): number {
  return TIERS[bandIndex(Math.max(1, weightOz))].cents[zone - 1];
}

/** The cheapest possible price for a lot on its own — the "Ships from $X" number. */
export function fromCents(weightOz: number): number {
  return tierCents(weightOz, 1);
}

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

/**
 * The money rule. Given what the bundle weighed before and after a lot joins,
 * the buyer pays only the difference between the two tiers (≥ 0).
 */
export function deltaCents(beforeOz: number, afterOz: number, zone: 1 | 2 | 3): number {
  const before = beforeOz <= 0 ? 0 : tierCents(beforeOz, zone);
  const after = tierCents(afterOz, zone);
  return Math.max(0, after - before);
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
  "Pick Ship or Pickup once. It sticks for every lot until you change it.",
  "One flat price per box, by weight and where you live.",
  "Your box stays open 7 days. Every lot you win in that time rides in it.",
  "Extra lots ride free until the box steps up a weight range; then you pay only the difference.",
  "One box per warehouse. Owosso and Gladwin each pack their own.",
  "Ground to the lower 48. No refunds once the label prints.",
  "Ships 3 to 5 business days after your box closes and every lot is paid.",
];


/**
 * "Room left in your box": how much more weight fits before the price goes up,
 * and roughly how many more of each preset that is (each extra lot adds its
 * weight + fill). Null `nextCents` means the box is already in the top band.
 */
export function headroom(weightOz: number, zone: 1 | 2 | 3): {
  ozLeft: number; bandLabel: string; nextCents: number | null; stepCents: number; fits: { key: "SMALL" | "MEDIUM" | "LARGE"; label: string; count: number }[];
} {
  const i = bandIndex(Math.max(1, weightOz));
  const band = TIERS[i];
  const ozLeft = Math.max(0, band.maxOz - weightOz);
  const next = TIERS[i + 1] ?? null;
  const stepCents = next ? next.cents[zone - 1] - band.cents[zone - 1] : 0;
  const fits = (["SMALL", "MEDIUM", "LARGE"] as const).map((key) => ({
    key, label: PRESETS[key].label, count: weightOz <= 0 ? 0 : Math.floor(ozLeft / (PRESETS[key].weightOz + FILL_OZ)),
  }));
  return { ozLeft, bandLabel: band.label, nextCents: next ? next.cents[zone - 1] : null, stepCents, fits };
}

export type Headroom = ReturnType<typeof headroom>;


/** The smallest thing that can still join a box: a Small plus its fill. */
export const SMALLEST_ADD_OZ = PRESETS.SMALL.weightOz + FILL_OZ;

/**
 * What an OPEN box can still take, in one of four shapes:
 *   room      — more fits at this price (fits = which presets, how many)
 *   full      — the next lot pushes the box into the next band (+stepCents)
 *   top-room  — top band, still under 20 lb: more fits, and nothing costs more
 *   top-full  — top band and no room: the next lot starts a new box
 */
export function headroomState(h: Headroom):
  | { kind: "room"; fits: { key: "SMALL" | "MEDIUM" | "LARGE"; label: string; count: number }[]; stepCents: number; nextCents: number }
  | { kind: "full"; stepCents: number; nextCents: number }
  | { kind: "top-room"; fits: { key: "SMALL" | "MEDIUM" | "LARGE"; label: string; count: number }[] }
  | { kind: "top-full" } {
  const fits = h.fits.filter((f) => f.count > 0);
  const room = h.ozLeft >= SMALLEST_ADD_OZ && fits.length > 0;
  if (h.nextCents === null) return room ? { kind: "top-room", fits } : { kind: "top-full" };
  return room ? { kind: "room", fits, stepCents: h.stepCents, nextCents: h.nextCents } : { kind: "full", stepCents: h.stepCents, nextCents: h.nextCents };
}

/**
 * The ONE preset to name when there's only room for a few words: Medium when at
 * least one fits, else Small. ("3 more Smalls ride free".)
 */
export function roomPick(fits: { key: string; label: string; count: number }[]): { label: string; count: number } | null {
  const med = fits.find((f) => f.key === "MEDIUM" && f.count > 0);
  if (med) return { label: med.label, count: med.count };
  const sm = fits.find((f) => f.key === "SMALL" && f.count > 0);
  return sm ? { label: sm.label, count: sm.count } : null;
}

/** "3 more Smalls ride free" / "1 more Medium rides free" — the item-page room line. */
export function roomLine(fits: { key: string; label: string; count: number }[]): string | null {
  const pick = roomPick(fits);
  if (!pick) return null;
  return `${pick.count} more ${pick.label}${pick.count === 1 ? "" : "s"} ride${pick.count === 1 ? "s" : ""} free`;
}
