/* ───────────────────────────────────────────────────────────
   Northwood Bids — cute cartoon animal avatars
   Flat, friendly faces. Pick one; it shows around the site.
   Each component fills its container (size via className).
   ─────────────────────────────────────────────────────────── */

type IconProps = { className?: string };
const S = (props: IconProps & { children: React.ReactNode; bg: string }) => (
  <svg viewBox="0 0 64 64" className={props.className} aria-hidden="true">
    <circle cx="32" cy="32" r="32" fill={props.bg} />
    {props.children}
  </svg>
);

const INK = "#2b2017";
const W = "#fffdf7";

function Fox({ className }: IconProps) {
  return (
    <S bg="#e9a06a" className={className}>
      <path d="M14 20 L24 30 L18 40 Z M50 20 L40 30 L46 40 Z" fill="#c9622b" />
      <path d="M32 24 L48 30 Q44 48 32 50 Q20 48 16 30 Z" fill="#ec9a5e" />
      <path d="M32 38 L44 32 Q40 46 32 49 Q24 46 20 32 Z" fill={W} />
      <circle cx="26" cy="33" r="2.6" fill={INK} /><circle cx="38" cy="33" r="2.6" fill={INK} />
      <path d="M32 40 l-3 -3 h6 z" fill={INK} />
    </S>
  );
}
function Bear({ className }: IconProps) {
  return (
    <S bg="#b98a5e" className={className}>
      <circle cx="20" cy="22" r="7" fill="#8a6440" /><circle cx="44" cy="22" r="7" fill="#8a6440" />
      <circle cx="32" cy="34" r="18" fill="#a87a4f" />
      <circle cx="32" cy="38" r="9" fill="#e7d2b3" />
      <circle cx="26" cy="32" r="2.6" fill={INK} /><circle cx="38" cy="32" r="2.6" fill={INK} />
      <circle cx="32" cy="36" r="2.4" fill={INK} />
    </S>
  );
}
function Deer({ className }: IconProps) {
  return (
    <S bg="#cf9a6a" className={className}>
      <path d="M22 14 q-4 -6 -8 -4 M22 14 q-7 -2 -9 2 M42 14 q4 -6 8 -4 M42 14 q7 -2 9 2" stroke="#7a5230" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M32 20 q14 2 12 18 q-2 14 -12 16 q-10 -2 -12 -16 q-2 -16 12 -18 Z" fill="#d8a87a" />
      <ellipse cx="32" cy="42" rx="7" ry="6" fill="#efdcc6" />
      <circle cx="25" cy="33" r="2.6" fill={INK} /><circle cx="39" cy="33" r="2.6" fill={INK} />
      <ellipse cx="32" cy="40" rx="2.6" ry="2" fill={INK} />
      <circle cx="46" cy="22" r="3" fill="#e36d6d" />
    </S>
  );
}
function Owl({ className }: IconProps) {
  return (
    <S bg="#8a7d9b" className={className}>
      <path d="M16 22 q16 -10 32 0 q4 18 -4 28 q-12 8 -24 0 q-8 -10 -4 -28 Z" fill="#6f6383" />
      {/* wise glasses */}
      <circle cx="25" cy="32" r="9" fill={W} /><circle cx="39" cy="32" r="9" fill={W} />
      <circle cx="25" cy="32" r="9" fill="none" stroke={INK} strokeWidth="2" /><circle cx="39" cy="32" r="9" fill="none" stroke={INK} strokeWidth="2" />
      <line x1="34" y1="32" x2="30" y2="32" stroke={INK} strokeWidth="2" />
      <circle cx="25" cy="32" r="3" fill={INK} /><circle cx="39" cy="32" r="3" fill={INK} />
      <path d="M29 40 l3 4 l3 -4 z" fill="#e8a13a" />
    </S>
  );
}
function Rabbit({ className }: IconProps) {
  return (
    <S bg="#cbb6c9" className={className}>
      <ellipse cx="26" cy="16" rx="4.5" ry="12" fill={W} /><ellipse cx="38" cy="16" rx="4.5" ry="12" fill={W} />
      <ellipse cx="26" cy="17" rx="2" ry="8" fill="#f0c4d2" /><ellipse cx="38" cy="17" rx="2" ry="8" fill="#f0c4d2" />
      <circle cx="32" cy="38" r="16" fill={W} />
      <circle cx="26" cy="36" r="2.5" fill={INK} /><circle cx="38" cy="36" r="2.5" fill={INK} />
      <path d="M32 41 l-2.5 -2.5 h5 z" fill="#e08aa0" />
      <path d="M32 43 v3 M28 44 l-6 2 M36 44 l6 2" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
    </S>
  );
}
function Raccoon({ className }: IconProps) {
  return (
    <S bg="#9aa3ad" className={className}>
      <path d="M16 20 l8 8 M48 20 l-8 8" stroke="#5b626b" strokeWidth="7" strokeLinecap="round" />
      <circle cx="32" cy="34" r="18" fill="#c2c8cf" />
      <path d="M20 32 q6 -7 11 -2 q-2 8 -11 6 q-3 -2 0 -4 Z" fill="#4a5159" />
      <path d="M44 32 q-6 -7 -11 -2 q2 8 11 6 q3 -2 0 -4 Z" fill="#4a5159" />
      <circle cx="26" cy="32" r="2.4" fill={W} /><circle cx="38" cy="32" r="2.4" fill={W} />
      <circle cx="32" cy="40" r="2.6" fill={INK} />
    </S>
  );
}
function Wolf({ className }: IconProps) {
  return (
    <S bg="#7f8a93" className={className}>
      <path d="M16 18 L24 30 L18 34 Z M48 18 L40 30 L46 34 Z" fill="#5a636b" />
      <path d="M32 22 q15 4 13 20 q-2 12 -13 14 q-11 -2 -13 -14 q-2 -16 13 -20 Z" fill="#9aa4ad" />
      <path d="M32 40 q-8 0 -10 6 q10 6 20 0 q-2 -6 -10 -6 Z" fill="#e7ecef" />
      <circle cx="25" cy="33" r="2.6" fill={INK} /><circle cx="39" cy="33" r="2.6" fill={INK} />
      <circle cx="32" cy="40" r="2.4" fill={INK} />
    </S>
  );
}
function Cat({ className }: IconProps) {
  return (
    <S bg="#d98c8c" className={className}>
      <path d="M18 18 L26 30 L20 34 Z M46 18 L38 30 L44 34 Z" fill="#b85d5d" />
      <circle cx="32" cy="36" r="17" fill="#e5a3a3" />
      {/* girl bow */}
      <path d="M44 18 l6 -4 v8 z M44 18 l6 4 v-8 z" fill="#b83b5e" /><circle cx="44" cy="18" r="2.5" fill="#8f2c49" />
      <circle cx="26" cy="34" r="2.6" fill={INK} /><circle cx="38" cy="34" r="2.6" fill={INK} />
      <path d="M32 40 l-2 -2 h4 z" fill="#8f3a3a" />
      <path d="M32 40 v3 M27 39 l-7 1 M37 39 l7 1" stroke={INK} strokeWidth="1.3" strokeLinecap="round" />
    </S>
  );
}
function Dog({ className }: IconProps) {
  return (
    <S bg="#cdaa7a" className={className}>
      <ellipse cx="17" cy="34" rx="6" ry="12" fill="#8a6a44" /><ellipse cx="47" cy="34" rx="6" ry="12" fill="#8a6a44" />
      <circle cx="32" cy="34" r="17" fill="#dcbd92" />
      {/* young cap */}
      <path d="M14 24 q18 -14 36 0 z" fill="#3f7a52" /><path d="M50 24 q6 0 8 3 l-8 1 z" fill="#356647" />
      <circle cx="26" cy="34" r="2.6" fill={INK} /><circle cx="38" cy="34" r="2.6" fill={INK} />
      <ellipse cx="32" cy="40" rx="6" ry="4.5" fill="#efe0c8" />
      <circle cx="32" cy="39" r="2.4" fill={INK} />
    </S>
  );
}
function Frog({ className }: IconProps) {
  return (
    <S bg="#8bb86a" className={className}>
      <circle cx="22" cy="20" r="8" fill="#7aa856" /><circle cx="42" cy="20" r="8" fill="#7aa856" />
      <circle cx="22" cy="20" r="4" fill={W} /><circle cx="42" cy="20" r="4" fill={W} />
      <circle cx="22" cy="21" r="2" fill={INK} /><circle cx="42" cy="21" r="2" fill={INK} />
      <path d="M14 32 q18 18 36 0 q-2 14 -18 14 q-16 0 -18 -14 Z" fill="#83b35f" />
      <path d="M24 42 q8 5 16 0" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </S>
  );
}
function Hedgehog({ className }: IconProps) {
  return (
    <S bg="#b79b86" className={className}>
      <path d="M30 16 L34 16 L40 22 L46 20 L48 28 L52 30 L46 36 Q40 24 30 24 Z" fill="#6e5743" />
      <path d="M14 36 q4 -16 22 -14 q16 2 14 16 q-2 12 -18 12 q-16 0 -18 -14 Z" fill="#7d6450" />
      <ellipse cx="26" cy="40" rx="14" ry="11" fill="#e7d2bd" />
      <circle cx="22" cy="38" r="2.4" fill={INK} /><circle cx="32" cy="38" r="2.4" fill={INK} />
      <circle cx="17" cy="42" r="2.6" fill={INK} />
    </S>
  );
}
function Panda({ className }: IconProps) {
  return (
    <S bg="#9fb0b6" className={className}>
      <circle cx="20" cy="20" r="7" fill={INK} /><circle cx="44" cy="20" r="7" fill={INK} />
      <circle cx="32" cy="34" r="18" fill={W} />
      <ellipse cx="25" cy="32" rx="5" ry="6" fill={INK} transform="rotate(-20 25 32)" />
      <ellipse cx="39" cy="32" rx="5" ry="6" fill={INK} transform="rotate(20 39 32)" />
      <circle cx="25" cy="32" r="2" fill={W} /><circle cx="39" cy="32" r="2" fill={W} />
      <circle cx="32" cy="40" r="2.6" fill={INK} />
    </S>
  );
}

const MAP: Record<string, (p: IconProps) => React.ReactElement> = {
  fox: Fox, bear: Bear, deer: Deer, owl: Owl, rabbit: Rabbit, raccoon: Raccoon,
  wolf: Wolf, cat: Cat, dog: Dog, frog: Frog, hedgehog: Hedgehog, panda: Panda,
};

export const AVATARS: { key: string; label: string }[] = [
  { key: "fox", label: "Fox" }, { key: "bear", label: "Bear" }, { key: "deer", label: "Deer" },
  { key: "owl", label: "Owl" }, { key: "rabbit", label: "Rabbit" }, { key: "raccoon", label: "Raccoon" },
  { key: "wolf", label: "Wolf" }, { key: "cat", label: "Cat" }, { key: "dog", label: "Dog" },
  { key: "frog", label: "Frog" }, { key: "hedgehog", label: "Hedgehog" }, { key: "panda", label: "Panda" },
];

export function hasAvatar(key?: string | null): boolean {
  return !!key && key in MAP;
}

/** Renders the chosen animal avatar, or null if the key is unknown/empty. */
export function Avatar({ avatarKey, className }: { avatarKey?: string | null; className?: string }) {
  if (!avatarKey || !(avatarKey in MAP)) return null;
  const C = MAP[avatarKey];
  return <C className={className} />;
}
