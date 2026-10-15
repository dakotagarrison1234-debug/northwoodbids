import { prisma } from "@/lib/prisma";
import type { Fulfillment, Prisma } from "@prisma/client";
import {
  deltaCents, footprint, headroom, packBundle, tierCents, withinLimits, zoneForState, fromCents,
  type Dims, type ShipPresetKey,
} from "@/lib/shipping/tiers";

/**
 * The bundle engine (docs/shipping-research.md §9 items 3–5, 14–15).
 *
 * A bundle is one box per buyer. It opens at their first shipped win, takes every
 * further shipped win for 7 days, and the buyer only ever pays the DIFFERENCE
 * between the old tier and the new one (usually $0). The delta is written on the
 * Item (`shipChargeCents`) the moment the lot closes, so every charge path —
 * auto-charge, retry, charge-owed — bills the same number without recomputing.
 *
 * Nothing in here charges a card. Nothing here talks to EasyPost.
 */

export const BUNDLE_HOLD_DAYS = 7;

export type ShipProfile = {
  name: string; street1: string; street2: string | null; city: string; state: string; zip: string; phone: string | null;
  zone: 1 | 2 | 3; verifiedAt: Date | null;
};

/** The buyer's saved address, or null if they can't ship (none / not lower-48). */
export async function getShipProfile(clerkUserId: string): Promise<ShipProfile | null> {
  const p = await prisma.bidderProfile.findUnique({
    where: { clerkUserId },
    select: { shipName: true, shipStreet1: true, shipStreet2: true, shipCity: true, shipState: true, shipZip: true, shipPhone: true, shipVerifiedAt: true, name: true, phone: true },
  });
  if (!p?.shipStreet1 || !p.shipCity || !p.shipState || !p.shipZip) return null;
  const zone = zoneForState(p.shipState);
  if (!zone) return null;
  return {
    name: p.shipName || p.name || "Northwood Bids customer",
    street1: p.shipStreet1, street2: p.shipStreet2 ?? null, city: p.shipCity, state: p.shipState.toUpperCase(), zip: p.shipZip,
    phone: p.shipPhone || p.phone || null, zone, verifiedAt: p.shipVerifiedAt ?? null,
  };
}

type ItemShipRow = {
  id: string; shipEligible: boolean; shipPreset: ShipPresetKey | null; shipWeightOz: number | null;
  shipLengthIn: Prisma.Decimal | null; shipWidthIn: Prisma.Decimal | null; shipHeightIn: Prisma.Decimal | null;
};

export const itemShipSelect = {
  id: true, shipEligible: true, shipPreset: true, shipWeightOz: true, shipLengthIn: true, shipWidthIn: true, shipHeightIn: true,
} as const;

function dimsOf(it: ItemShipRow): Partial<Dims> | null {
  if (it.shipLengthIn == null && it.shipWidthIn == null && it.shipHeightIn == null) return null;
  return {
    l: it.shipLengthIn != null ? Number(it.shipLengthIn) : undefined,
    w: it.shipWidthIn != null ? Number(it.shipWidthIn) : undefined,
    h: it.shipHeightIn != null ? Number(it.shipHeightIn) : undefined,
  };
}

/** Packed weight + dims for a lot, or null when it can't ship. */
export function itemFootprint(it: ItemShipRow): { weightOz: number; dims: Dims } | null {
  if (!it.shipEligible) return null;
  const fp = footprint({ preset: it.shipPreset, weightOz: it.shipWeightOz, dims: dimsOf(it) });
  if (!fp) return null;
  // Over the hard limits (20 lb / 22 in) is pickup-only — Custom included. There
  // is no override: the carriers we buy ground from won't take it at our tiers.
  if (!withinLimits(fp)) return null;
  return fp;
}

/** What the item page's Ship segment shows about the buyer's open box at this lot's station. */
export type OpenBoxPeek = { id: string; weightOz: number; zone: 1 | 2 | 3; headroom: ReturnType<typeof headroom> };

/**
 * What the item page shows: "from $5.49" for anonymous/no-address viewers, or
 * the buyer's exact price for this lot (as a NEW box, or the delta if it joins
 * their open box). `box` is the open box it would join (so the switch can draw
 * the room left), null when it wouldn't join one.
 */
export async function quoteForViewer(it: ItemShipRow & { locationId?: string | null; organizationId?: string; transferable?: boolean }, clerkUserId: string | null): Promise<
  | { eligible: false }
  | { eligible: true; fromCents: number; exactCents: number | null; joinsOpenBox: boolean; zone: 1 | 2 | 3 | null; needsAddress: boolean; box: OpenBoxPeek | null }
> {
  const fp = itemFootprint(it);
  if (!fp) return { eligible: false };
  const station = it.organizationId ? await stationForItem(it.organizationId, it.locationId ?? null) : null;
  // Shipping would mean a transfer this lot isn't allowed to ride (same rule as routeWonLot).
  if (station?.transfer && it.transferable === false) return { eligible: false };
  const base = { eligible: true as const, fromCents: fromCents(fp.weightOz), box: null };
  if (!clerkUserId) return { ...base, exactCents: null, joinsOpenBox: false, zone: null, needsAddress: true };
  const profile = await getShipProfile(clerkUserId);
  if (!profile) return { ...base, exactCents: null, joinsOpenBox: false, zone: null, needsAddress: true };
  // No station = no box to join here; never match a box at another station.
  const open = station && it.organizationId ? await openBundleFor(clerkUserId, it.organizationId, station.id) : null;
  if (!open) return { ...base, exactCents: tierCents(fp.weightOz, profile.zone), joinsOpenBox: false, zone: profile.zone, needsAddress: false };
  const current = open.items.map(itemFootprint).filter((x): x is NonNullable<typeof x> => !!x);
  const after = packBundle([...current, fp]);
  // Wouldn't fit: joinBundleOnWin seals the open box and starts a fresh one for
  // this lot, so quote the full first-lot tier (new box = the buyer's current zone).
  if (after.overLimit && current.length > 0) {
    return { ...base, exactCents: tierCents(fp.weightOz, profile.zone), joinsOpenBox: false, zone: profile.zone, needsAddress: false };
  }
  // The delta is priced in the OPEN box's frozen zone — the address (and zone)
  // the box opened with, not whatever the profile says today.
  const zone = open.zone as 1 | 2 | 3;
  const before = packBundle(current).weightOz;
  return {
    ...base, exactCents: deltaCents(before, after.weightOz, zone), joinsOpenBox: true, zone, needsAddress: false,
    box: { id: open.id, weightOz: before, zone, headroom: headroom(before, zone) },
  };
}

/**
 * The buyer's mode — Ship or Pickup — is ONE setting, not per lot. Picking Ship
 * on any lot (or on /shipping) makes every lot they win ship until they pick
 * Pickup. A lot that can't ship is pickup regardless (joinBundleOnWin checks
 * the footprint first). `itemId` just stamps where the switch was flipped.
 */
export async function setChoice(clerkUserId: string, choice: Fulfillment, itemId?: string | null): Promise<void> {
  await prisma.bidderProfile.upsert({
    where: { clerkUserId },
    update: { lastFulfillment: choice },
    create: { clerkUserId, lastFulfillment: choice },
  });
  if (itemId) {
    // Audit only: which lot the buyer was on when they flipped it. Never read back.
    await prisma.itemShipChoice.upsert({
      where: { itemId_clerkUserId: { itemId, clerkUserId } },
      update: { choice },
      create: { itemId, clerkUserId, choice },
    }).catch(() => {});
  }
}

/** The buyer's current mode. Pickup until they ever pick Ship. */
export async function choiceFor(clerkUserId: string): Promise<Fulfillment> {
  const p = await prisma.bidderProfile.findUnique({ where: { clerkUserId }, select: { lastFulfillment: true } });
  return p?.lastFulfillment ?? "PICKUP";
}

async function openBundleFor(clerkUserId: string, organizationId: string, locationId: string) {
  return prisma.shippingBundle.findFirst({
    where: { clerkUserId, organizationId, status: "OPEN", closesAt: { gt: new Date() }, locationId },
    include: { items: { select: itemShipSelect } },
    orderBy: { openedAt: "desc" },
  });
}

/**
 * Which station a lot ships from: its own warehouse when that warehouse ships;
 * otherwise the org's default station (the lot is transferred there). Null when
 * nothing ships at all.
 */
export async function stationForItem(organizationId: string, itemLocationId: string | null): Promise<{ id: string; name: string; transfer: boolean } | null> {
  if (itemLocationId) {
    const here = await prisma.pickupLocation.findFirst({ where: { id: itemLocationId, organizationId, isShippingStation: true, isActive: true }, select: { id: true, name: true } });
    if (here) return { ...here, transfer: false };
  }
  const def = await shippingStation(organizationId);
  return def ? { ...def, transfer: true } : null;
}

/**
 * THE moment of truth, called once per won lot right after the winner is known
 * (before any charge). Decides pickup vs ship, joins/creates the bundle, and
 * writes the delta on the item. Idempotent: a lot already in a bundle returns
 * what it already has.
 *
 * Returns the delta in cents (0 for pickup). `sealedBundleId` is set on the one
 * call that had to seal a full box to make room — the caller texts that box's
 * "closed" message once.
 */
export async function joinBundleOnWin(itemId: string, clerkUserId: string, organizationId: string): Promise<{ fulfillment: Fulfillment; deltaCents: number; bundleId: string | null; sealedBundleId?: string }> {
  const item = await prisma.item.findUnique({ where: { id: itemId }, select: { ...itemShipSelect, fulfillment: true, shippingBundleId: true, shipChargeCents: true, locationId: true } });
  if (!item) return { fulfillment: "PICKUP", deltaCents: 0, bundleId: null };
  if (item.shippingBundleId) return { fulfillment: "SHIP", deltaCents: item.shipChargeCents, bundleId: item.shippingBundleId };
  if (item.fulfillment === "PICKUP") {
    // A pickup lot must never carry a stale delta (e.g. relisted after a cancelled box).
    await prisma.item.updateMany({ where: { id: itemId, shipChargeCents: { not: 0 } }, data: { shipChargeCents: 0 } });
    return { fulfillment: "PICKUP", deltaCents: 0, bundleId: null };
  }

  // itemFootprint returns null for a lot that's over the hard limits on its own
  // (Custom included) — so that lot is pickup.
  const fp = itemFootprint(item);
  const choice = fp ? await choiceFor(clerkUserId) : "PICKUP";
  const profile = choice === "SHIP" ? await getShipProfile(clerkUserId) : null;
  const station = choice === "SHIP" ? await stationForItem(organizationId, item.locationId) : null;
  if (choice !== "SHIP" || !fp || !profile || !station) {
    await prisma.item.update({ where: { id: itemId }, data: { fulfillment: "PICKUP", shipChargeCents: 0 } });
    return { fulfillment: "PICKUP", deltaCents: 0, bundleId: null };
  }

  // Serialize per buyer so two lots closing in the same second can't both open a box.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ship:${clerkUserId}`}))`;
    // Re-check under the lock: a concurrent close may have already placed this lot.
    const fresh = await tx.item.findUnique({ where: { id: itemId }, select: { shippingBundleId: true, shipChargeCents: true } });
    if (fresh?.shippingBundleId) return { fulfillment: "SHIP" as const, deltaCents: fresh.shipChargeCents, bundleId: fresh.shippingBundleId };
    const now = new Date();
    const openBox = () =>
      tx.shippingBundle.create({
        data: {
          organizationId, clerkUserId, status: "OPEN", locationId: station.id,
          openedAt: now, closesAt: new Date(now.getTime() + BUNDLE_HOLD_DAYS * 86_400_000),
          shipName: profile.name, shipStreet1: profile.street1, shipStreet2: profile.street2, shipCity: profile.city,
          shipState: profile.state, shipZip: profile.zip, shipPhone: profile.phone, zone: profile.zone,
        },
        include: { items: { select: itemShipSelect } },
      });
    // One open box per buyer PER station (Owosso and Gladwin each pack their own).
    let bundle = await tx.shippingBundle.findFirst({
      where: { clerkUserId, organizationId, status: "OPEN", closesAt: { gt: now }, locationId: station.id },
      include: { items: { select: itemShipSelect } },
      orderBy: { openedAt: "desc" },
    });
    if (!bundle) bundle = await openBox();
    let current = bundle.items.map(itemFootprint).filter((x): x is NonNullable<typeof x> => !!x);
    let after = packBundle([...current, fp]);
    let sealedBundleId: string | undefined;
    if (after.overLimit && current.length > 0) {
      // This lot would push the box past 20 lb / 22 in. Seal the box as it stands
      // and start a fresh one for this lot (it pays the full first-lot tier).
      await tx.shippingBundle.update({ where: { id: bundle.id }, data: { status: "CLOSED", closedAt: now, closesAt: now } });
      sealedBundleId = bundle.id;
      bundle = await openBox();
      current = [];
      after = packBundle([fp]);
    }
    const before = packBundle(current);
    const zone = bundle.zone as 1 | 2 | 3;
    const delta = deltaCents(before.weightOz, after.weightOz, zone);
    await tx.item.update({
      where: { id: itemId },
      data: { fulfillment: "SHIP", shippingBundleId: bundle.id, shipChargeCents: delta },
    });
    await tx.shippingBundle.update({
      where: { id: bundle.id },
      data: { weightOz: after.weightOz, boxCode: after.box?.code ?? null, chargedCents: { increment: delta } },
    });
    return { fulfillment: "SHIP" as const, deltaCents: delta, bundleId: bundle.id, ...(sealedBundleId ? { sealedBundleId } : {}) };
  });
}

/**
 * A lot leaves its box (forfeited, refunded, moved to pickup, or its charge
 * failed for good). The box is re-weighed; the delta that lot carried comes off
 * `chargedCents` only when that money is no longer held — never collected
 * (unpaid) or given back (refunded). Pass `{ refunded: false }` when a PAID
 * lot's shipping could NOT be refunded so the box's running total stays honest.
 */
export async function leaveBundle(itemId: string, opts: { refunded?: boolean } = {}): Promise<void> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { shippingBundleId: true, shipChargeCents: true, shippingBundle: { select: { status: true, labelUrl: true } } },
  });
  if (!item?.shippingBundleId) return;
  const bundleId = item.shippingBundleId;
  const b = item.shippingBundle;
  // Label already bought / box already gone: the box is physical and the shipping
  // money is non-refundable (§9.10). Just detach the lot — no re-weigh, no money
  // movement, and the box is never cancelled from here.
  if (b && (b.labelUrl || b.status === "SHIPPED" || b.status === "DELIVERED")) {
    await prisma.item.update({ where: { id: itemId }, data: { shippingBundleId: null } });
    return;
  }
  // Only take the delta off the box's running total when it was actually given
  // back (or never collected). No label yet = refundable; the caller can say
  // `refunded: false` when it tried and couldn't.
  const refundable = opts.refunded === false ? false : await shippingRefundableForItem(itemId);
  await prisma.$transaction(async (tx) => {
    await tx.item.update({ where: { id: itemId }, data: { shippingBundleId: null, shipChargeCents: 0, fulfillment: null } });
    const rest = await tx.item.findMany({ where: { shippingBundleId: bundleId }, select: itemShipSelect });
    const packed = packBundle(rest.map(itemFootprint).filter((x): x is NonNullable<typeof x> => !!x));
    await tx.shippingBundle.update({
      where: { id: bundleId },
      data: {
        weightOz: packed.weightOz, boxCode: packed.box?.code ?? null,
        ...(refundable ? { chargedCents: { decrement: item.shipChargeCents } } : {}),
        ...(rest.length === 0 ? { status: "CANCELLED", closedAt: new Date() } : {}),
      },
    });
  });
}

/** Buyer taps "Ship it now": the box stops taking wins today. */
export async function shipItNow(bundleId: string, clerkUserId: string): Promise<boolean> {
  const r = await prisma.shippingBundle.updateMany({
    where: { id: bundleId, clerkUserId, status: "OPEN" },
    data: { status: "CLOSED", closesAt: new Date(), closedAt: new Date() },
  });
  return r.count > 0;
}

/** Cron: close boxes whose 7 days are up. Returns the closed ids. */
export async function closeDueBundles(now: Date = new Date()): Promise<string[]> {
  const due = await prisma.shippingBundle.findMany({ where: { status: "OPEN", closesAt: { lte: now } }, select: { id: true } });
  if (due.length === 0) return [];
  await prisma.shippingBundle.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { status: "CLOSED", closedAt: now } });
  return due.map((d) => d.id);
}

/** Cron: boxes closing within the next 24h that haven't had their "ships tomorrow" text. */
export async function bundlesDueForDay6Text(now: Date = new Date()) {
  return prisma.shippingBundle.findMany({
    where: { status: "OPEN", day6NotifiedAt: null, closesAt: { gt: now, lte: new Date(now.getTime() + 86_400_000) } },
    select: { id: true, clerkUserId: true, closesAt: true, weightOz: true, chargedCents: true, zone: true, items: { select: { id: true } } },
  });
}

/** The shipping-station location for an org (falls back to the oldest active one). */
export async function shippingStation(organizationId: string): Promise<{ id: string; name: string } | null> {
  const station = await prisma.pickupLocation.findFirst({ where: { organizationId, isShippingStation: true, isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  if (station) return station;
  return prisma.pickupLocation.findFirst({ where: { organizationId, isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
}

/**
 * Cron: a CLOSED box whose every lot is paid and physically at the station
 * (no open transfer) moves to PACKING — the admin queue.
 */
export async function advanceClosedBundles(organizationId: string): Promise<number> {
  const fallback = await shippingStation(organizationId);
  const closed = await prisma.shippingBundle.findMany({
    where: { organizationId, status: "CLOSED" },
    select: { id: true, locationId: true, items: { select: { id: true, locationId: true, transferRequestId: true, status: true, payments: { select: { status: true } } } } },
  });
  let n = 0;
  for (const b of closed) {
    if (b.items.length === 0) continue;
    const stationId = b.locationId ?? fallback?.id;
    if (!stationId) continue;
    const ready = b.items.every((it) =>
      it.locationId === stationId && !it.transferRequestId && it.status === "PENDING_PICKUP" && it.payments.some((p) => p.status === "PAID")
    );
    if (ready) {
      await prisma.shippingBundle.update({ where: { id: b.id }, data: { status: "PACKING" } });
      n++;
    }
  }
  return n;
}

/** Sum of shipping deltas for a set of lots — what every charge path adds to the bill. */
export async function shipCentsForItems(itemIds: string[]): Promise<number> {
  if (itemIds.length === 0) return 0;
  const rows = await prisma.item.findMany({ where: { id: { in: itemIds } }, select: { shipChargeCents: true } });
  return rows.reduce((s, r) => s + r.shipChargeCents, 0);
}

/**
 * Per-lot shipping deltas (itemId → cents) so a charge path can write each lot's
 * OWN delta onto its Payment row (`shippingAmount`) instead of splitting evenly.
 * Lots that aren't shipping simply aren't in the map (treat as 0).
 */
export async function shipCentsByItem(itemIds: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (itemIds.length === 0) return m;
  const rows = await prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, shipChargeCents: true } });
  for (const r of rows) if (r.shipChargeCents > 0) m.set(r.id, r.shipChargeCents);
  return m;
}

/**
 * Can a lot's shipping charge still be refunded? Yes until the label is bought
 * (§9.10: "shipping charges are non-refundable once the label is bought").
 * Lots that never shipped return false (nothing to refund).
 */
export async function shippingRefundableForItem(itemId: string): Promise<boolean> {
  const it = await prisma.item.findUnique({
    where: { id: itemId },
    select: { shipChargeCents: true, shippingBundle: { select: { status: true, labelUrl: true, shippedAt: true } } },
  });
  if (!it?.shippingBundle || it.shipChargeCents <= 0) return false;
  const b = it.shippingBundle;
  return !b.labelUrl && !b.shippedAt && (b.status === "OPEN" || b.status === "CLOSED" || b.status === "PACKING");
}

/**
 * Everything the buyer's dashboard "Your box" card and /shipping need.
 * Default (dashboard): the 5 newest, delivered boxes only for a week.
 * `{ all: true }` (/shipping): up to 50, delivered boxes kept.
 * `headroom` = how much more fits in the box before the price moves up a band
 * (priced in the box's frozen zone).
 */
export async function bundleSummaryFor(clerkUserId: string, opts: { all?: boolean } = {}) {
  const bundles = await prisma.shippingBundle.findMany({
    where: {
      clerkUserId,
      OR: [
        { status: { in: ["OPEN", "CLOSED", "PACKING", "SHIPPED"] } },
        opts.all ? { status: "DELIVERED" } : { status: "DELIVERED", deliveredAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
      ],
    },
    orderBy: { openedAt: "desc" },
    take: opts.all ? 50 : 5,
    select: {
      id: true, status: true, openedAt: true, closesAt: true, closedAt: true, weightOz: true, boxCode: true, chargedCents: true, zone: true,
      carrier: true, service: true, trackingCode: true, trackingUrl: true, shippedAt: true, deliveredAt: true, lastTrackingStatus: true,
      shipCity: true, shipState: true, organizationId: true, locationId: true,
      location: { select: { name: true } },
      items: {
        select: {
          id: true, title: true, shipChargeCents: true, locationId: true, transferRequestId: true,
          payments: { select: { status: true } },
          photos: { where: { isPrimary: true }, take: 1, select: { url: true } },
        },
      },
    },
  });
  // Boxes opened before per-station boxes have no locationId: fall back to the
  // org default, same as advanceClosedBundles.
  const fallbackByOrg = new Map<string, string | null>();
  for (const b of bundles) {
    if (b.locationId || fallbackByOrg.has(b.organizationId)) continue;
    fallbackByOrg.set(b.organizationId, (await shippingStation(b.organizationId))?.id ?? null);
  }
  return bundles.map(({ organizationId, locationId, items, ...b }) => {
    const stationId = locationId ?? fallbackByOrg.get(organizationId) ?? null;
    const zone = b.zone as 1 | 2 | 3;
    return {
      ...b,
      tierCents: b.weightOz > 0 ? tierCents(b.weightOz, zone) : 0,
      weightLb: Math.round((b.weightOz / 16) * 10) / 10,
      headroom: headroom(b.weightOz, zone),
      // Per lot: paid (any PAID row) and physically at the box's own station (no open transfer).
      items: items.map(({ payments, locationId: at, transferRequestId, ...it }) => ({
        ...it,
        paid: payments.some((p) => p.status === "PAID"),
        atStation: !!stationId && at === stationId && !transferRequestId,
      })),
    };
  });
}
