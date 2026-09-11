"use client";
import { useEffect, useState } from "react";

/**
 * Always-on live countdown for an auction card. Ticks every second for ANY future
 * date, so every card carries a moving clock — the thing that turns a browser
 * into a bidder. Renders as a little segmented clock: two boxed units ("3d 4h",
 * "6h 22m", then "12m 30s" in the last hour) that shift colour as the moment
 * gets close — moss while there's time, amber inside 12h, red in the final hour.
 *
 * `targetIso` is the moment we count to (auction end for live, start for
 * upcoming). `mode` changes only the label + colour.
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

  const label = mode === "opens" ? "Opens in" : "Ends in";

  // Pre-hydration / first paint: same footprint, neutral colour, so the card
  // doesn't jump when the real value lands.
  if (ms === null) {
    return (
      <div className="flex items-center gap-1.5 text-[#8a7559]">
        <span className="text-[10px] font-black uppercase tracking-[0.14em]">{label}</span>
        <Unit v="--" u="" tone="bg-[#efe3d0] text-[#8a7559]" />
        <Unit v="--" u="" tone="bg-[#efe3d0] text-[#8a7559]" />
      </div>
    );
  }

  if (ms <= 0) {
    return (
      <div className="flex items-center gap-1.5 text-[#8a7559]">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#c47b3e] opacity-70 animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#c47b3e]" />
        </span>
        <span className="text-[11px] font-black uppercase tracking-[0.14em]">
          {mode === "opens" ? "Opening now" : "Closing now"}
        </span>
      </div>
    );
  }

  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  // Pressure zones (live auctions only): amber inside 12h, red inside the hour.
  const urgent = mode === "ends" && ms <= 60 * 60 * 1000;
  const soon = mode === "ends" && ms <= 12 * 60 * 60 * 1000;

  const parts: { v: string; u: string }[] =
    days > 0
      ? [{ v: String(days), u: "d" }, { v: pad(hours), u: "h" }]
      : hours > 0
      ? [{ v: String(hours), u: "h" }, { v: pad(mins), u: "m" }]
      : [{ v: String(mins), u: "m" }, { v: pad(secs), u: "s" }];

  const labelTone = urgent
    ? "text-red-700"
    : soon
    ? "text-[#a85f28]"
    : mode === "opens"
    ? "text-[#6c4d39]"
    : "text-[#2f5d3a]";

  const unitTone = urgent
    ? "bg-red-600 text-white"
    : soon
    ? "bg-[#c47b3e] text-white"
    : mode === "opens"
    ? "bg-[#6c4d39] text-[#f6ecda]"
    : "bg-[#4a7c59] text-white";

  return (
    <div className={`flex items-center gap-1.5 ${labelTone}`} aria-live="off">
      <span className="text-[10px] font-black uppercase tracking-[0.14em]">{label}</span>
      {parts.map((p) => (
        <Unit key={p.u} v={p.v} u={p.u} tone={unitTone} pulse={urgent} />
      ))}
    </div>
  );
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function Unit({ v, u, tone, pulse = false }: { v: string; u: string; tone: string; pulse?: boolean }) {
  return (
    <span
      className={`inline-flex items-baseline rounded-md px-1.5 py-0.5 leading-none tabular-nums shadow-sm ${tone} ${
        pulse ? "animate-pulse" : ""
      }`}
    >
      <span className="font-display font-black text-[13px]">{v}</span>
      {u && <span className="text-[9px] font-bold ml-px opacity-85">{u}</span>}
    </span>
  );
}
