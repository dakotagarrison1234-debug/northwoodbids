"use client";
/**
 * ItemCardTimer — countdown badge for item cards in browse/grid views.
 *
 * Renders NOTHING until the item is inside its final window (last 5 minutes),
 * then shows a live m:ss countdown badge. Subscribes to the item's Pusher
 * channel only while inside the window so popcorn extensions update the
 * timer in real time without a page refresh.
 *
 * A single shared Pusher connection is reused across all card timers on the
 * page (one WebSocket, many channels).
 */
import { useEffect, useRef, useState } from "react";
import Pusher from "pusher-js";

const SHOW_WINDOW_MS = 5 * 60 * 1000; // show badge in the last 5 minutes
const SUB_WINDOW_MS = 6 * 60 * 1000;  // subscribe slightly earlier than shown

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
}

export default function ItemCardTimer({ itemId, endAt: initialEndAt }: Props) {
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

  // Hidden until the final window
  if (remaining > SHOW_WINDOW_MS) return null;

  // Past zero: closing is handled by the cron within ~a minute
  if (remaining <= 0) {
    return (
      <div className="absolute top-2.5 left-2.5 bg-[#faf8f4]/85 backdrop-blur-sm text-[#6b6659] text-xs px-2.5 py-1 rounded-full font-semibold">
        Ending…
      </div>
    );
  }

  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);

  return (
    <div className="absolute top-2.5 left-2.5 bg-red-500/90 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full font-bold animate-pulse tabular-nums">
      {m}:{s.toString().padStart(2, "0")} left
    </div>
  );
}
