"use client";
import { useEffect, useState } from "react";

/**
 * Always-on live countdown for an auction card. Unlike the old "urgency pill" — which
 * only appeared inside 48h and showed a static "Ends in 3h" that never moved — this
 * ticks every second for ANY future date, so every card has a live clock the way a
 * home-shopping channel always shows one. The ticking is the thing that pulls a
 * browser into "I should bid before this runs out."
 *
 * `target` is the moment we're counting to (auction end for live, auction start for
 * upcoming). `mode` only changes the label + colour.
 */
export default function AuctionCountdown({
  targetIso,
  mode = "ends",
}: {
  targetIso: string;
  mode?: "ends" | "opens";
}) {
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(targetIso).getTime();
    const tick = () => setMs(target - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  // Pre-hydration / first paint: render a neutral placeholder of the same size so
  // the card doesn't jump when the real value lands.
  if (ms === null) {
    return (
      <div className="flex items-center gap-1.5 text-[#8a7559]">
        <ClockIcon />
        <span className="text-sm font-semibold tabular-nums">— — —</span>
      </div>
    );
  }

  if (ms <= 0) {
    return (
      <div className="flex items-center gap-1.5 text-[#8a7559]">
        <ClockIcon />
        <span className="text-sm font-bold">{mode === "opens" ? "Starting…" : "Closing…"}</span>
      </div>
    );
  }

  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  // Under an hour is the pressure zone — go red and show seconds ticking.
  const urgent = mode === "ends" && ms <= 60 * 60 * 1000;
  const soon = mode === "ends" && ms <= 12 * 60 * 60 * 1000;

  // Show the two most significant units so it reads cleanly at any range:
  // "3d 4h", "6h 22m", or "12m 30s" in the final hour.
  const parts: { v: number; u: string }[] =
    days > 0
      ? [{ v: days, u: "d" }, { v: hours, u: "h" }]
      : hours > 0
      ? [{ v: hours, u: "h" }, { v: mins, u: "m" }]
      : [{ v: mins, u: "m" }, { v: secs, u: "s" }];

  const color = urgent
    ? "text-red-600"
    : soon
    ? "text-amber-600"
    : mode === "opens"
    ? "text-[#6c4d39]"
    : "text-[#4a7c59]";

  return (
    <div className={`flex items-center gap-1.5 ${color}`}>
      <ClockIcon urgent={urgent} />
      <span className="text-[11px] font-bold uppercase tracking-wide opacity-80">
        {mode === "opens" ? "Opens in" : "Ends in"}
      </span>
      <span className="flex items-center gap-1 tabular-nums font-extrabold text-sm">
        {parts.map((p) => (
          <span key={p.u}>
            {p.v}
            <span className="text-[11px] font-bold opacity-70">{p.u}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

function ClockIcon({ urgent = false }: { urgent?: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={urgent ? "animate-pulse" : ""}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}
