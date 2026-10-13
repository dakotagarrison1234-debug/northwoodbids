import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getUserOrg } from "@/lib/auth";
import { BOXES, tierCents } from "@/lib/shipping/tiers";
import { serviceLabel } from "@/lib/easypost";

/**
 * Shared bits for /api/admin/shipping/** — the admin pack queue
 * (docs/shipping-research.md §9.13, P3/P4). Not a route (no route.ts here).
 */

export const ADMIN_ROLES = new Set(["OWNER", "ADMIN", "STAFF"]);

export async function requireShipAdmin() {
  const m = await getUserOrg();
  if (!m || !ADMIN_ROLES.has(m.role)) return null;
  return m;
}

export const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
export const notFound = () => NextResponse.json({ error: "Box not found" }, { status: 404 });

export const bundleInclude = {
  // The station this box ships from (null on boxes opened before per-station
  // boxes existed — serializeBundle falls back to the org's default station).
  location: { select: { id: true, name: true } },
  items: {
    select: {
      id: true, title: true, itemCode: true, status: true, locationId: true, transferRequestId: true, storageLocation: true, grabbedAt: true,
      shipChargeCents: true,
      location: { select: { name: true } },
      transferRequest: { select: { status: true, toLocation: { select: { name: true } } } },
      photos: { orderBy: [{ isPrimary: "desc" }, { order: "asc" }], take: 1, select: { url: true } },
      payments: { select: { status: true } },
    },
    orderBy: { itemCode: "asc" },
  },
} satisfies Prisma.ShippingBundleInclude;

export async function loadBundle(id: string, organizationId: string) {
  const b = await prisma.shippingBundle.findFirst({ where: { id, organizationId }, include: bundleInclude });
  return b;
}

export type LoadedBundle = NonNullable<Awaited<ReturnType<typeof loadBundle>>>;

export function boxByCode(code: string | null | undefined) {
  return BOXES.find((b) => b.code === code) ?? null;
}

/** Carrier tracking page when EasyPost didn't give us one (manual Mark shipped). */
export function trackingUrlFor(carrier: string | null | undefined, code: string | null | undefined): string | null {
  if (!code) return null;
  const c = (carrier ?? "").toUpperCase();
  if (c.startsWith("USPS")) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(code)}`;
  if (c.startsWith("UPS")) return `https://www.ups.com/track?tracknum=${encodeURIComponent(code)}`;
  if (c.startsWith("FEDEX")) return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(code)}`;
  return null;
}

/**
 * The station a box ships from: its own `location` (set when the box opened),
 * else the org's default station for boxes that predate per-station boxes.
 */
export function stationOf(b: { location: { id: string; name: string } | null }, fallback: { id: string; name: string } | null) {
  return b.location ?? fallback;
}

/**
 * May a label be bought / the box be marked shipped? PACKING always; CLOSED only
 * when every lot is paid and physically at THIS BOX's station (no open
 * transfer) — i.e. the cron would flip it to PACKING on its next tick anyway.
 */
export function canShipNow(b: LoadedBundle, fallback: { id: string } | null): boolean {
  if (b.status === "PACKING") return true;
  const station = b.location ?? fallback;
  if (b.status !== "CLOSED" || !station || b.items.length === 0) return false;
  return b.items.every((it) => it.locationId === station.id && !it.transferRequestId && it.payments.some((p) => p.status === "PAID"));
}

export const NOT_READY_MESSAGE = "This box isn't ready: every lot has to be paid and at the box's warehouse first.";

/** Days since the box closed (0 while it's still open). Drives the "Unpaid N days" pill. */
export function daysSinceClosed(closedAt: Date | null, now: Date = new Date()): number {
  if (!closedAt) return 0;
  return Math.max(0, Math.floor((now.getTime() - closedAt.getTime()) / 86_400_000));
}

/** Lots leave every pickup list once the box is sealed. */
export async function markLotsShipped(bundleId: string) {
  await prisma.item.updateMany({
    where: { shippingBundleId: bundleId, status: "PENDING_PICKUP" },
    data: { status: "PICKED_UP", pickedUpAt: new Date(), grabbedAt: null, needsPlacement: false },
  });
}

/** Undo of the above (label refunded, shipment reopened). */
export async function markLotsUnshipped(bundleId: string) {
  await prisma.item.updateMany({
    where: { shippingBundleId: bundleId, status: "PICKED_UP" },
    data: { status: "PENDING_PICKUP", pickedUpAt: null },
  });
}

/** Append a dated line to the bundle's notes. */
export function appendNote(existing: string | null | undefined, line: string): string {
  const stamp = new Date().toLocaleString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const entry = `${stamp} — ${line}`;
  return existing && existing.trim() ? `${existing.trim()}\n${entry}` : entry;
}

/** Shape the admin page reads. One function so every route returns the same thing. */
export function serializeBundle(
  b: LoadedBundle,
  buyer: { name: string | null; phone: string | null; email: string | null } | null,
  fallbackStation: { id: string; name: string } | null,
) {
  const box = boxByCode(b.packedBoxCode ?? b.boxCode);
  // "At station" means at THIS box's warehouse, not the org default.
  const station = stationOf(b, fallbackStation);
  const lots = b.items.map((it) => {
    const paid = it.payments.some((p) => p.status === "PAID");
    const onTransfer = !!it.transferRequestId && it.transferRequest?.status !== "COMPLETED" && it.transferRequest?.status !== "CANCELLED";
    const atStation = !!station && it.locationId === station.id && !onTransfer;
    return {
      id: it.id,
      code: it.itemCode,
      title: it.title,
      thumb: it.photos[0]?.url ?? null,
      status: it.status,
      locationId: it.locationId,
      locationName: it.location?.name ?? null,
      transferRequestId: it.transferRequestId,
      transferTo: onTransfer ? (it.transferRequest?.toLocation?.name ?? null) : null,
      shelf: it.storageLocation,
      gathered: it.grabbedAt != null,
      paid,
      atStation,
      shipChargeCents: it.shipChargeCents,
    };
  });
  const tier = b.weightOz > 0 ? tierCents(b.weightOz, b.zone as 1 | 2 | 3) : 0;
  return {
    id: b.id,
    status: b.status,
    openedAt: b.openedAt.toISOString(),
    closesAt: b.closesAt.toISOString(),
    closedAt: b.closedAt?.toISOString() ?? null,
    shippedAt: b.shippedAt?.toISOString() ?? null,
    deliveredAt: b.deliveredAt?.toISOString() ?? null,
    location: station ? { id: station.id, name: station.name } : null,
    daysSinceClosed: daysSinceClosed(b.closedAt),
    buyer: { clerkUserId: b.clerkUserId, name: buyer?.name ?? b.shipName ?? null, phone: buyer?.phone ?? b.shipPhone ?? null, email: buyer?.email ?? null },
    ship: { name: b.shipName, street1: b.shipStreet1, street2: b.shipStreet2, city: b.shipCity, state: b.shipState, zip: b.shipZip, phone: b.shipPhone },
    zone: b.zone,
    weightOz: b.weightOz,
    boxCode: b.boxCode,
    box: box ? { code: box.code, dims: box.dims } : null,
    tierCents: tier,
    chargedCents: b.chargedCents,
    labelCostCents: b.labelCostCents,
    carrier: b.carrier,
    service: b.service,
    serviceLabel: b.carrier && b.service ? serviceLabel(b.carrier, b.service) : b.carrier,
    trackingCode: b.trackingCode,
    trackingUrl: b.trackingUrl,
    labelUrl: b.labelUrl,
    lastTrackingStatus: b.lastTrackingStatus,
    packedWeightOz: b.packedWeightOz,
    packedBoxCode: b.packedBoxCode,
    hasShipment: !!b.easypostShipmentId,
    notes: b.notes,
    lots,
    lotsHere: lots.filter((l) => l.atStation).length,
  };
}

export type SerializedBundle = ReturnType<typeof serializeBundle>;

export async function buyersFor(clerkUserIds: string[]) {
  const ids = [...new Set(clerkUserIds)];
  if (ids.length === 0) return new Map<string, { name: string | null; phone: string | null; email: string | null }>();
  const rows = await prisma.bidderProfile.findMany({ where: { clerkUserId: { in: ids } }, select: { clerkUserId: true, name: true, phone: true, email: true } });
  return new Map(rows.map((r) => [r.clerkUserId, { name: r.name, phone: r.phone, email: r.email }]));
}
