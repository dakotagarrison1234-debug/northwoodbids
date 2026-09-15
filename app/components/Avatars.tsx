/* ───────────────────────────────────────────────────────────
   Northwood Bids — Bid Critter avatars
   3D-rendered animal portraits served from /public/critters/<key>.webp
   (256px WebP, colored backdrop baked in). Each avatar fills its
   container (size via className) and is clipped to a circle.
   ─────────────────────────────────────────────────────────── */

export const AVATARS: { key: string; label: string }[] = [
  { key: "pig", label: "Pig" }, { key: "chicken", label: "Chicken" }, { key: "cow", label: "Cow" },
  { key: "horse", label: "Horse" }, { key: "goat", label: "Goat" }, { key: "fox", label: "Fox" },
  { key: "deer", label: "Deer" }, { key: "raccoon", label: "Raccoon" }, { key: "bear", label: "Bear" },
  { key: "bunny", label: "Bunny" }, { key: "frog", label: "Frog" }, { key: "dog", label: "Dog" },
  { key: "cat", label: "Cat" },
];

const KEYS = new Set(AVATARS.map((a) => a.key));

export function hasAvatar(key?: string | null): boolean {
  return !!key && KEYS.has(key);
}

/** Renders the chosen animal avatar, or null if the key is unknown/empty. */
export function Avatar({ avatarKey, className }: { avatarKey?: string | null; className?: string }) {
  if (!avatarKey || !KEYS.has(avatarKey)) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/critters/${avatarKey}.webp`}
      alt=""
      aria-hidden="true"
      width={256}
      height={256}
      decoding="async"
      draggable={false}
      className={`block rounded-full object-cover select-none ${className ?? ""}`}
    />
  );
}
