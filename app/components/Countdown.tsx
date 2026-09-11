"use client";
import { useState, useEffect, useRef } from "react";

interface Props {
  endAt: string;         // ISO string — can change (popcorn extension)
  onExpire?: () => void; // called once when timer hits zero
}

type Tier = "closed" | "urgent" | "soon" | "normal";

/**
 * Inline "time left" for the lot page. Colour walks the brand ramp as the clock
 * runs down: moss (plenty of time) → amber (inside the hour) → red + pulse
 * (final five minutes). Same props as before; only the presentation changed.
 */
export default function Countdown({ endAt, onExpire }: Props) {
  const [timeLeft, setTimeLeft] = useState("");
  const [tier, setTier] = useState<Tier>("normal");
  const firedRef = useRef(false);

  useEffect(() => {
    // Reset fired flag when endAt changes (popcorn extension)
    firedRef.current = false;

    const tick = () => {
      const diff = new Date(endAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("Bidding closed");
        setTier("closed");
        if (!firedRef.current) {
          firedRef.current = true;
          onExpire?.();
        }
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTier(diff < 300_000 ? "urgent" : diff < 3_600_000 ? "soon" : "normal");
      if (d > 0) setTimeLeft(`${d}d ${h}h ${m}m`);
      else if (h > 0) setTimeLeft(`${h}h ${m}m ${s}s`);
      else setTimeLeft(`${m}m ${s}s`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endAt, onExpire]);

  const cls =
    tier === "urgent"
      ? "text-[#b42318] font-extrabold"
      : tier === "soon"
      ? "text-[#b06a28] font-bold"
      : tier === "closed"
      ? "text-[#8a7559] font-semibold"
      : "text-[#3c6449] font-bold";

  const dot =
    tier === "urgent"
      ? "bg-[#d92d20]"
      : tier === "soon"
      ? "bg-[#f0a35a]"
      : tier === "closed"
      ? "bg-[#cdbda3]"
      : "bg-[#4a7c59]";

  return (
    <span className={`inline-flex items-center gap-1.5 tabular-nums ${cls}`}>
      <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
        {tier === "urgent" && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#d92d20] opacity-75 animate-ping" />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dot}`} />
      </span>
      {timeLeft || "..."}
    </span>
  );
}
