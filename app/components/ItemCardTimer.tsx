"use client";
/**
 * ItemCardTimer — always-on "time left" badge for item cards in browse/grid/home
 * views. Shows the remaining time at ANY range (days → hours → the final m:ss),
 * so a bidder can always see how long a lot has left without opening it. Colour
 * walks the brand ramp as it gets close: moss far out, amber inside 12h, red
 * inside the last hour, red with a pulsing clock in the final 5 minutes.
 *
 * It subscribes to the item's Pusher channel only once it's near the end, so
 * popcorn (anti-snipe) extensions push a new end time in real time without a
 * page refresh — and it doesn't open hundreds of sockets for far-off lots.
 *
 * A single shared Pusher connection is reused across every card timer on the page.
 */
import { useEffect, useRef, useState } from "react";
import Pusher from "pusher-js";

const SUB_WINDOW_MS = 6 * 60 * 1000; // subscribe to extensions in the last ~6 min
const URGENT_MS = 5 * 60 * 1000;     // red + pulse
const HOUR_MS = 60 * 60 * 1000;      // red
const SOON_MS = 12 * 60 * 60 * 1000; // amber

// Module-level shared Pusher client — one connection for the whole page
let sharedPusher: Pusher | null = null;
function getPusher(): Pusher {
  if (!sharedPusher) {
    sharedPusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });
  }
  return sharedPusher;
}

interface Props {
  itemId: string;
  endAt: string; // ISO — item.itemEndAt ?? auction.endAt
  inline?: boolean; // list-row / inline variant: no absolute positioning
  plain?: boolean;  // no pill/background — just small coloured text (sits by the condition)
}

export default function ItemCardTimer({ itemId, endAt: initialEndAt, inline, plain }: Props) {
  const [endAt, setEndAt] = useState(initialEndAt);
  const [remaining, setRemaining] = useState<number>(
    () => new Date(initialEndAt).getTime() - Date.now()
  );
  const subscribedRef = useRef(false);

  // Tick every second
  useEffect(() => {
    const tick = () => setRemaining(new Date(endAt).getTime() - Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endAt]);

  // Subscribe to popcorn extensions only once we're near the window
  useEffect(() => {
    if (subscribedRef.current) return;
    if (remaining > SUB_WINDOW_MS || remaining <= -60_000) return;

    subscribedRef.current = true;
    const pusher = getPusher();
    const channel = pusher.subscribe(`item-${itemId}`);
    const handler = (data: { newEndAt?: string }) => {
      if (data?.newEndAt) setEndAt(data.newEndAt);
    };
    channel.bind("new-bid", handler);

    return () => {
      channel.unbind("new-bid", handler);
      pusher.unsubscribe(`item-${itemId}`);
      subscribedRef.current = false;
    };
  }, [remaining, itemId]);

  const totalSec = Math.max(0, Math.floor(remaining / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  // Two most-significant units, tightening as it runs out.
  const label =
    remaining <= 0
      ? "Ending…"
      : days > 0
      ? `${days}d ${hours}h`
      : hours > 0
      ? `${hours}h ${mins}m`
      : `${mins}:${secs.toString().padStart(2, "0")}`;

  // Shared urgency ramp (matches Countdown on the lot page):
  // moss (plenty of time) → amber (inside 12h) → red (final hour) → red + pulse (5 min).
  const urgency: "ended" | "urgent" | "hour" | "soon" | "calm" =
    remaining <= 0
      ? "ended"
      : remaining <= URGENT_MS
      ? "urgent"
      : remaining <= HOUR_MS
      ? "hour"
      : remaining <= SOON_MS
      ? "soon"
      : "calm";

  // ── Plain variant: no pill, just small coloured text next to the condition. ──
  if (plain) {
    const t = {
      ended: "text-[#8a7559]",
      urgent: "text-[#b42318]",
      hour: "text-[#b42318]",
      soon: "text-[#b06a28]",
      calm: "text-[#3c6449]",
    }[urgency];
    return (
      <span className={`inline-flex items-center gap-1 tabular-nums font-semibold ${t}`}>
        <ClockIcon pulse={urgency === "urgent"} />
        {label}
      </span>
    );
  }

  const base = inline
    ? "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold tabular-nums"
    : "absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full font-bold tabular-nums shadow-sm backdrop-blur-sm";

  if (urgency === "ended") {
    return (
      <span className={`${base} ${inline ? "bg-[#f1e7d5] text-[#6f5b46]" : "bg-[#f1e7d5]/90 text-[#6f5b46]"}`}>
        <ClockIcon />
        Ending…
      </span>
    );
  }

  const tone = inline
    ? {
        urgent: "bg-[#d92d20] text-white",
        hour: "bg-[#fdecec] text-[#b42318] border border-[#f3b8b3]",
        soon: "bg-[#f0a35a]/25 text-[#8a4f1c] border border-[#c47b3e]/40",
        calm: "bg-[#4a7c59]/12 text-[#3c6449] border border-[#4a7c59]/25",
      }[urgency]
    : {
        urgent: "bg-[#d92d20] text-white",
        hour: "bg-[#b42318]/92 text-white",
        soon: "bg-[#c47b3e]/92 text-white",
        calm: "bg-[#2f4a37]/85 text-[#f1e7d5]",
      }[urgency];

  return (
    <span className={`${base} ${tone}`}>
      <ClockIcon pulse={urgency === "urgent"} />
      {label}
      {hours > 0 || days > 0 ? " left" : ""}
    </span>
  );
}

function ClockIcon({ pulse = false }: { pulse?: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={pulse ? "animate-pulse" : undefined}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}
