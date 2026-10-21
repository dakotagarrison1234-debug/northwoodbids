import type { ShipPresetKey } from "./tiers";

/**
 * The size language — one source of truth for the colour, letter and label of
 * each shipping size. SizeBadge, FreeBlocks, the grid cards and the box tiles
 * all read this, so Small is always moss, Medium always amber, Large always
 * leather, everywhere a buyer sees them.
 */

export type SizeKey = "S" | "M" | "L" | "C";

export const SIZE_STYLE: Record<SizeKey, { letter: string; label: string; bg: string; fg: string }> = {
  S: { letter: "S", label: "Small",  bg: "#4a7c59", fg: "#ffffff" },
  M: { letter: "M", label: "Medium", bg: "#c47b3e", fg: "#ffffff" },
  L: { letter: "L", label: "Large",  bg: "#6c4d39", fg: "#ffffff" },
  C: { letter: "C", label: "Custom", bg: "#241a12", fg: "#ffffff" },
};

/** The plain-English weight hint for each size, for intros and help. */
export const SIZE_HINT: Record<SizeKey, string> = {
  S: "under 8 oz",
  M: "about 1 lb",
  L: "2 to 5 lb",
  C: "custom size",
};

/** An empty FreeBlock: sand with muted text. */
export const SIZE_EMPTY = { bg: "#efe3d0", fg: "#a3927b" };

/** The three preset sizes in display order (FreeBlocks). */
export const SIZE_ORDER: ("SMALL" | "MEDIUM" | "LARGE")[] = ["SMALL", "MEDIUM", "LARGE"];

/** Preset → size letter. Custom (or unknown) → "C". */
export function sizeKeyOf(preset: ShipPresetKey | string | null | undefined): SizeKey {
  switch (preset) {
    case "SMALL": return "S";
    case "MEDIUM": return "M";
    case "LARGE": return "L";
    default: return "C";
  }
}
