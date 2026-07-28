"use client";
/**
 * PusherRefresh — drop into any server component to give it live updates.
 *
 * Subscribes to a Pusher channel + event, then calls router.refresh() which
 * re-runs the server component's data fetch in-place (no full navigation).
 *
 * Usage:
 *   <PusherRefresh channel="auctions" event="auction-updated" />
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Pusher from "pusher-js";

interface Props {
  channel: string;
  event: string;
  /** Optional: only refresh when this condition is true (e.g. orgSlug matches) */
  filter?: (data: Record<string, unknown>) => boolean;
  /** Min ms between refreshes — coalesces bursts during a bidding war. */
  throttleMs?: number;
}

export default function PusherRefresh({ channel, event, filter, throttleMs = 1200 }: Props) {
  const router = useRouter();

  useEffect(() => {
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    // Throttle (trailing): refresh immediately, then at most once per window while
    // events keep arriving — keeps it near-real-time without a refresh stampede.
    let last = 0;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const doRefresh = () => { last = Date.now(); router.refresh(); };
    const schedule = () => {
      const since = Date.now() - last;
      if (since >= throttleMs) { doRefresh(); return; }
      if (pending) return;
      pending = setTimeout(() => { pending = null; doRefresh(); }, throttleMs - since);
    };

    const ch = pusher.subscribe(channel);
    ch.bind(event, (data: Record<string, unknown>) => {
      if (!filter || filter(data)) schedule();
    });

    // Refresh when the page comes back into view — coming back from an item page
    // (tap Back, swipe back, or bfcache restore) re-runs the server fetch in place,
    // so a bid you just placed shows as "You're winning" without a manual refresh.
    const onVisible = () => { if (document.visibilityState === "visible") schedule(); };
    const onPageShow = () => schedule();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      if (pending) clearTimeout(pending);
      ch.unbind_all();
      pusher.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [channel, event, filter, router, throttleMs]);

  return null;
}
