import { prisma } from "@/lib/prisma";

/**
 * GHL outbound webhooks for the item-transfer workflow.
 *
 * Both functions are fire-and-forget where possible and no-op when their
 * per-event env var is unset, mirroring the notifyWinners pattern in
 * lib/closeAuction.ts. App base URL comes from NEXT_PUBLIC_APP_URL.
 */

/**
 * TEAM alert: a bidder has requested a transfer. GHL routes this to staff so
 * they know which items to gather and where they're going.
 *
 * Fire-and-forget — safe to call without awaiting; errors are swallowed here.
 */
export async function notifyTransferRequested(transferId: string): Promise<void> {
  if (!process.env.GHL_TRANSFER_REQUESTED_WEBHOOK) return;

  const transfer = await prisma.transferRequest.findUnique({
    where: { id: transferId },
    include: {
      toLocation: { select: { name: true } },
      items: {
        select: {
          title: true,
          storageLocation: true,
          location: { select: { name: true } },
        },
      },
    },
  });
  if (!transfer) return;

  const profile = await prisma.bidderProfile.findUnique({
    where: { clerkUserId: transfer.clerkUserId },
    select: { email: true, phone: true, name: true },
  });
  const email = profile?.email ?? "";
  const phone = profile?.phone ?? "";
  const name = profile?.name ?? "Bidder";

  fetch(process.env.GHL_TRANSFER_REQUESTED_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // GHL contact lookup fields
      email,
      phone,
      name,
      firstName: name.split(" ")[0] || name,
      lastName: name.split(" ").slice(1).join(" ") || "",
      // Event payload
      event: "transfer_requested",
      toLocation: transfer.toLocation.name,
      itemCount: transfer.items.length,
      items: transfer.items.map((it) => ({
        title: it.title,
        fromLocation: it.location?.name ?? "Unassigned",
        storageLocation: it.storageLocation ?? null,
      })),
      window: "5–6 days",
    }),
  }).catch((err) => console.error("GHL transfer-requested webhook failed:", err));
}

/**
 * BIDDER alert: the transferred items have arrived at the destination.
 *
 * IMPORTANT: this is called by the admin PATCH BEFORE the items are detached
 * from the transfer (relocation mutation clears transferRequestId). We AWAIT
 * the fetch (wrapped in try/catch) so the payload is built and sent while the
 * items still belong to the transfer.
 */
export async function notifyTransferArrived(transferId: string): Promise<void> {
  if (!process.env.GHL_TRANSFER_ARRIVED_WEBHOOK) return;

  const transfer = await prisma.transferRequest.findUnique({
    where: { id: transferId },
    include: {
      toLocation: { select: { name: true } },
      items: { select: { title: true } },
    },
  });
  if (!transfer) return;

  const profile = await prisma.bidderProfile.findUnique({
    where: { clerkUserId: transfer.clerkUserId },
    select: { email: true, phone: true, name: true },
  });
  const email = profile?.email ?? "";
  const phone = profile?.phone ?? "";
  const name = profile?.name ?? "Bidder";

  try {
    await fetch(process.env.GHL_TRANSFER_ARRIVED_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // GHL contact lookup fields
        email,
        phone,
        name,
        firstName: name.split(" ")[0] || name,
        lastName: name.split(" ").slice(1).join(" ") || "",
        // Event payload
        event: "transfer_arrived",
        toLocation: transfer.toLocation.name,
        itemCount: transfer.items.length,
        items: transfer.items.map((it) => ({ title: it.title })),
        pickupUrl: `${process.env.NEXT_PUBLIC_APP_URL}/pickup`,
      }),
    });
  } catch (err) {
    console.error("GHL transfer-arrived webhook failed:", err);
  }
}
