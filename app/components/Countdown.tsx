"use client";
import { useState, useEffect, useRef } from "react";

interface Props {
  endAt: string;         // ISO string — can change (popcorn extension)
  onExpire?: () => void; // called once when timer hits zero
}

export default function Countdown({ endAt, onExpire }: Props) {
  const [timeLeft, setTimeLeft] = useState("");
  const [urgent, setUrgent] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    // Reset fired flag when endAt changes (popcorn extension)
    firedRef.current = false;

    const tick = () => {
      const diff = new Date(endAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("Bidding closed");
        setUrgent(false);
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
      setUrgent(diff < 150_000); // red in last 2:30 (popcorn window)
      if (d > 0) setTimeLeft(`${d}d ${h}h ${m}m`);
      else if (h > 0) setTimeLeft(`${h}h ${m}m ${s}s`);
      else setTimeLeft(`${m}m ${s}s`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endAt, onExpire]);

  return (
    <span className={urgent ? "text-red-600 font-bold animate-pulse" : "text-[#4a4640] font-semibold"}>
      {timeLeft || "..."}
    </span>
  );
}
