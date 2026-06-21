/* ───────────────────────────────────────────────────────────
   Northwood Bids — cartoon animal avatars
   Recognizable, friendly faces on contrasting backdrops.
   Each component fills its container (size via className).
   ─────────────────────────────────────────────────────────── */

type IconProps = { className?: string };
const INK = "#241a12";
const W = "#fffdf7";

const S = ({ bg, children, className }: { bg: string; children: React.ReactNode; className?: string }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
    <circle cx="32" cy="32" r="32" fill={bg} />
    {children}
  </svg>
);

function Pig({ className }: IconProps) {
  return (
    <S bg="#6f9bc4" className={className}>
      <path d="M20 17 l-4 -8 l10 5 Z M44 17 l4 -8 l-10 5 Z" fill="#e58aa0" />
      <circle cx="32" cy="34" r="17" fill="#f0a6b4" />
      <ellipse cx="32" cy="40" rx="9.5" ry="7" fill="#e57f97" />
      <ellipse cx="29" cy="40" rx="1.6" ry="2.2" fill="#7a3f4f" /><ellipse cx="35" cy="40" rx="1.6" ry="2.2" fill="#7a3f4f" />
      <circle cx="25" cy="31" r="2.3" fill={INK} /><circle cx="39" cy="31" r="2.3" fill={INK} />
    </S>
  );
}
function Chicken({ className }: IconProps) {
  return (
    <S bg="#4f8a6e" className={className}>
      <circle cx="27" cy="14" r="3.4" fill="#d8463f" /><circle cx="32.5" cy="11.5" r="3.8" fill="#d8463f" /><circle cx="38" cy="14" r="3.4" fill="#d8463f" />
      <circle cx="32" cy="35" r="16" fill={W} />
      <path d="M32 38 l-9 2.5 l9 2.5 Z" fill="#e8a13a" />
      <path d="M29 43 q1.5 5 3 0 M33 43 q1.5 5 3 0" fill="#d8463f" />
      <circle cx="26" cy="33" r="2.3" fill={INK} /><circle cx="38" cy="33" r="2.3" fill={INK} />
    </S>
  );
}
function Cow({ className }: IconProps) {
  return (
    <S bg="#7a9b5e" className={className}>
      <path d="M21 13 q-3 -7 1 -7 q3 2 2 8 Z M43 13 q3 -7 -1 -7 q-3 2 -2 8 Z" fill="#d8c9a8" />
      <path d="M15 21 q-7 -2 -8 4 q6 4 10 -1 Z M49 21 q7 -2 8 4 q-6 4 -10 -1 Z" fill="#b58f6a" />
      <circle cx="32" cy="35" r="17" fill={W} />
      <path d="M16 30 q9 -7 15 -1 q-1 10 -10 9 q-8 -1 -8 -5 q0 -2 3 -3 Z" fill="#2b2017" />
      <ellipse cx="32" cy="43" rx="10" ry="7" fill="#e8a6ad" />
      <ellipse cx="29" cy="43" rx="1.6" ry="2.4" fill="#a86b73" /><ellipse cx="35" cy="43" rx="1.6" ry="2.4" fill="#a86b73" />
      <circle cx="24" cy="32" r="2.3" fill={W} /><circle cx="24" cy="32" r="1.2" fill={INK} /><circle cx="39" cy="32" r="2.3" fill={INK} />
    </S>
  );
}
function Horse({ className }: IconProps) {
  return (
    <S bg="#3f7d72" className={className}>
      <path d="M23 16 l-3 -9 l7 6 Z M41 16 l3 -9 l-7 6 Z" fill="#5c3d24" />
      <ellipse cx="32" cy="35" rx="13" ry="18" fill="#9a6b43" />
      <path d="M20 22 q3 -12 13 -13 q-7 7 -9 16 q-3 0 -4 -3 Z" fill="#5c3d24" />
      <ellipse cx="32" cy="47" rx="8" ry="7" fill="#b98a5e" />
      <ellipse cx="29" cy="48" rx="1.4" ry="2" fill="#5c3d24" /><ellipse cx="35" cy="48" rx="1.4" ry="2" fill="#5c3d24" />
      <circle cx="26" cy="33" r="2.3" fill={INK} /><circle cx="38" cy="33" r="2.3" fill={INK} />
    </S>
  );
}
function Goat({ className }: IconProps) {
  return (
    <S bg="#56708a" className={className}>
      <path d="M23 16 q-9 -11 -16 -5 q5 9 16 9 Z M41 16 q9 -11 16 -5 q-5 9 -16 9 Z" fill="#c4b59a" />
      <path d="M17 23 q-7 1 -7 7 q6 1 9 -3 Z M47 23 q7 1 7 7 q-6 1 -9 -3 Z" fill="#ece2cf" />
      <ellipse cx="32" cy="35" rx="14" ry="16" fill="#ece2cf" />
      <ellipse cx="32" cy="42" rx="7" ry="5" fill="#dcc9ad" />
      <path d="M29 47 q3 7 6 0 q-3 3 -6 0 Z" fill="#ece2cf" />
      <circle cx="26" cy="33" r="2.3" fill={INK} /><circle cx="38" cy="33" r="2.3" fill={INK} />
    </S>
  );
}
function Fox({ className }: IconProps) {
  return (
    <S bg="#33485f" className={className}>
      <path d="M16 15 L27 28 L20 32 Z M48 15 L37 28 L44 32 Z" fill="#b6511f" />
      <path d="M32 21 L47 30 Q43 47 32 49 Q21 47 17 30 Z" fill="#e58a3e" />
      <path d="M32 36 L43 31 Q40 46 32 48 Q24 46 21 31 Z" fill={W} />
      <circle cx="25" cy="32" r="2.5" fill={INK} /><circle cx="39" cy="32" r="2.5" fill={INK} />
      <path d="M32 40 l-3 -3 h6 z" fill={INK} />
    </S>
  );
}
function Deer({ className }: IconProps) {
  return (
    <S bg="#7089a8" className={className}>
      <path d="M22 14 q-3 -8 -8 -9 M22 14 q-8 -4 -11 -1 M42 14 q3 -8 8 -9 M42 14 q8 -4 11 -1" stroke="#7a5230" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M17 21 q-7 -1 -8 6 q6 3 10 -2 Z M47 21 q7 -1 8 6 q-6 3 -10 -2 Z" fill="#a07a4f" />
      <ellipse cx="32" cy="36" rx="13" ry="16" fill="#c79a6a" />
      <ellipse cx="32" cy="44" rx="7" ry="5.5" fill="#efdcc6" />
      <circle cx="32" cy="43" r="2" fill={INK} />
      <circle cx="26" cy="34" r="2.3" fill={INK} /><circle cx="38" cy="34" r="2.3" fill={INK} />
    </S>
  );
}
function Raccoon({ className }: IconProps) {
  return (
    <S bg="#b56f4f" className={className}>
      <path d="M15 16 L27 27 L19 30 Z M49 16 L37 27 L45 30 Z" fill="#6b727a" />
      <circle cx="32" cy="34" r="17" fill="#c2c8cf" />
      <path d="M30 22 q-3 8 -10 9 M34 22 q3 8 10 9" stroke="#8a929a" strokeWidth="2" fill="none" />
      <ellipse cx="25" cy="33" rx="6.5" ry="5.5" fill="#2b2017" /><ellipse cx="39" cy="33" rx="6.5" ry="5.5" fill="#2b2017" />
      <circle cx="25" cy="33" r="2" fill={W} /><circle cx="39" cy="33" r="2" fill={W} />
      <path d="M32 41 l-2.5 -2.5 h5 z" fill={INK} />
    </S>
  );
}
function Bear({ className }: IconProps) {
  return (
    <S bg="#c2913a" className={className}>
      <circle cx="20" cy="22" r="7.5" fill="#7a5230" /><circle cx="44" cy="22" r="7.5" fill="#7a5230" />
      <circle cx="20" cy="22" r="3.5" fill="#a87a4f" /><circle cx="44" cy="22" r="3.5" fill="#a87a4f" />
      <circle cx="32" cy="35" r="17" fill="#9a6b43" />
      <ellipse cx="32" cy="41" rx="9" ry="7" fill="#e7d2b3" />
      <circle cx="32" cy="38" r="2.6" fill={INK} />
      <circle cx="25" cy="32" r="2.4" fill={INK} /><circle cx="39" cy="32" r="2.4" fill={INK} />
    </S>
  );
}
function Bunny({ className }: IconProps) {
  return (
    <S bg="#a86e8e" className={className}>
      <ellipse cx="26" cy="14" rx="4.5" ry="12" fill={W} /><ellipse cx="38" cy="14" rx="4.5" ry="12" fill={W} />
      <ellipse cx="26" cy="15" rx="2" ry="8" fill="#f0c4d2" /><ellipse cx="38" cy="15" rx="2" ry="8" fill="#f0c4d2" />
      <circle cx="32" cy="39" r="16" fill={W} />
      <circle cx="26" cy="37" r="2.3" fill={INK} /><circle cx="38" cy="37" r="2.3" fill={INK} />
      <path d="M32 42 l-2.5 -2.5 h5 z" fill="#e08aa0" />
      <path d="M32 44 v3 M28 45 l-7 1 M36 45 l7 1" stroke={INK} strokeWidth="1.3" strokeLinecap="round" />
    </S>
  );
}
function Frog({ className }: IconProps) {
  return (
    <S bg="#4f6f9b" className={className}>
      <circle cx="22" cy="19" r="8.5" fill="#6cae54" /><circle cx="42" cy="19" r="8.5" fill="#6cae54" />
      <circle cx="22" cy="18" r="4.2" fill={W} /><circle cx="42" cy="18" r="4.2" fill={W} />
      <circle cx="22" cy="19" r="2" fill={INK} /><circle cx="42" cy="19" r="2" fill={INK} />
      <path d="M12 30 q20 20 40 0 q-3 17 -20 17 q-17 0 -20 -17 Z" fill="#6cae54" />
      <path d="M24 40 q8 6 16 0" stroke="#2f5e2a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="26" cy="38" r="1.4" fill="#2f5e2a" /><circle cx="38" cy="38" r="1.4" fill="#2f5e2a" />
    </S>
  );
}
function Dog({ className }: IconProps) {
  return (
    <S bg="#6a5f8c" className={className}>
      <path d="M17 21 q-7 2 -7 13 q0 8 9 8 l5 -16 Z" fill="#7a5230" /><path d="M47 21 q7 2 7 13 q0 8 -9 8 l-5 -16 Z" fill="#7a5230" />
      <circle cx="32" cy="34" r="16" fill="#cdaa78" />
      <ellipse cx="32" cy="40" rx="8" ry="6.5" fill="#efe0c8" />
      <circle cx="32" cy="38" r="2.5" fill={INK} />
      <circle cx="26" cy="32" r="2.3" fill={INK} /><circle cx="38" cy="32" r="2.3" fill={INK} />
    </S>
  );
}
function Cat({ className }: IconProps) {
  return (
    <S bg="#9b5f6f" className={className}>
      <path d="M18 17 L29 28 L22 31 Z M46 17 L35 28 L42 31 Z" fill="#cf7f3e" />
      <path d="M20 19 L27 27 L23 29 Z M44 19 L37 27 L41 29 Z" fill="#e6b07a" />
      <circle cx="32" cy="35" r="16" fill="#e3a05f" />
      <circle cx="26" cy="33" r="2.4" fill={INK} /><circle cx="38" cy="33" r="2.4" fill={INK} />
      <path d="M32 39 l-2 -2 h4 z" fill="#7a3f2a" />
      <path d="M32 39 v3 M27 38 l-7 1 M37 38 l7 1" stroke={INK} strokeWidth="1.3" strokeLinecap="round" />
    </S>
  );
}

const MAP: Record<string, (p: IconProps) => React.ReactElement> = {
  pig: Pig, chicken: Chicken, cow: Cow, horse: Horse, goat: Goat, fox: Fox,
  deer: Deer, raccoon: Raccoon, bear: Bear, bunny: Bunny, frog: Frog, dog: Dog, cat: Cat,
};

export const AVATARS: { key: string; label: string }[] = [
  { key: "pig", label: "Pig" }, { key: "chicken", label: "Chicken" }, { key: "cow", label: "Cow" },
  { key: "horse", label: "Horse" }, { key: "goat", label: "Goat" }, { key: "fox", label: "Fox" },
  { key: "deer", label: "Deer" }, { key: "raccoon", label: "Raccoon" }, { key: "bear", label: "Bear" },
  { key: "bunny", label: "Bunny" }, { key: "frog", label: "Frog" }, { key: "dog", label: "Dog" },
  { key: "cat", label: "Cat" },
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
