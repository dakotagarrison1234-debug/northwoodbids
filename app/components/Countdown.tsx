"use client";
import { useState, useEffect, useRef } from "react";

interface Props {
  endAt: string;         // ISO string — can change (popcorn extension)
  onExpire?: () => void; // called once when timer hits zero
}

type Tier = "closed" | "urgent" | "soon" | "normal";

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
      // Color by urgency so the timer reads at a glance: green plenty of time,
      // amber under an hour, red in the final few minutes.
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
      ? "text-red-600 font-extrabold animate-pulse"
      : tier === "soon"
      ? "text-amber-600 font-bold"
      : tier === "closed"
      ? "text-[#8a7559] font-semibold"
      : "text-green-700 font-bold";

  return <span className={cls}>{timeLeft || "..."}</span>;
}
