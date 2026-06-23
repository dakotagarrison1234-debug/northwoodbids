import Pusher from "pusher";

// Singleton — reused across all server-side callers
let _pusher: Pusher | null = null;

export function getPusherServer(): Pusher {
  if (!_pusher) {
    _pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      useTLS: true,
    });
  }
  return _pusher;
}

/**
 * Broadcast that auction state has changed.
 * Subscribed by /auctions page, /[orgSlug] page, and the dashboard auctions tab.
 */
export async function triggerAuctionUpdated(orgSlug?: string): Promise<void> {
  try {
    const pusher = getPusherServer();
    await pusher.trigger("auctions", "auction-updated", { orgSlug: orgSlug ?? null });
  } catch (e) {
    // Non-fatal — real-time is best-effort
    console.warn("Pusher trigger failed:", e);
  }
}

/**
 * Broadcast that a single item has closed (sold or unsold). Subscribed by the
 * item detail page + item cards so the UI flips to "ended" immediately instead
 * of waiting for a client-side timeout.
 */
export async function triggerItemClosed(itemId: string): Promise<void> {
  try {
    await getPusherServer().trigger(`item-${itemId}`, "item-closed", {});
  } catch (e) {
    console.warn("Pusher item-closed trigger failed:", e);
  }
}
