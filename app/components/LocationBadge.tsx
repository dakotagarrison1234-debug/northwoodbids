// High-visibility location/warehouse badge. Warm burnt-orange + pin so the WHERE
// of an item or pickup pops off the rustic theme and is impossible to miss
// (on-palette — the app avoids teal/blue).
export default function LocationBadge({
  name,
  size = "md",
  className = "",
}: {
  name: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const pad = size === "sm" ? "px-2 py-0.5 text-xs gap-1" : "px-2.5 py-1 text-sm gap-1.5";
  const icon = size === "sm" ? 12 : 14;
  return (
    <span
      className={`inline-flex items-center ${pad} rounded-full font-bold bg-[#c47b3e]/15 text-[#8a4f1c] border border-[#c47b3e]/40 ${className}`}
    >
      <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21s-7-6.3-7-11a7 7 0 1 1 14 0c0 4.7-7 11-7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
      {name}
    </span>
  );
}
