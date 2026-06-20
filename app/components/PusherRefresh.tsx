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
}

export default function PusherRefresh({ channel, event, filter }: Props) {
  const router = useRouter();

  useEffect(() => {
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    const ch = pusher.subscribe(channel);
    ch.bind(event, (data: Record<string, unknown>) => {
      if (!filter || filter(data)) {
        router.refresh();
      }
    });

    return () => {
      ch.unbind_all();
      pusher.disconnect();
    };
  }, [channel, event, filter, router]);

  return null;
}
