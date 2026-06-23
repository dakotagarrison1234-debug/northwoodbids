import { prisma } from "@/lib/prisma";

/**
 * Pickup scheduling helpers. All pickup times are interpreted in the business's
 * timezone (Michigan / America/Detroit), independent of the server's timezone.
 */

export const PICKUP_TZ = "America/Detroit";
export type Slot = { startsAt: string; remaining: number };

const DAYS_AHEAD = 28;
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Calendar year/month/day + weekday of an instant, as seen in the pickup timezone. */
function zonedYMD(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PICKUP_TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(date);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  return { y: +m.year, mo: +m.month, d: +m.day, weekday: WD[m.weekday] };
}

/** UTC offset (ms) of the pickup timezone at the given instant. */
function tzOffsetMs(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PICKUP_TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour === 24 ? 0 : +m.hour, +m.minute, +m.second);
  return asUTC - date.getTime();
}

/** Convert a wall-clock time in the pickup timezone to the correct UTC instant. */
function zonedWallToUtc(y: number, mo0: number, d: number, hh: number, mm: number) {
  const naive = Date.UTC(y, mo0, d, hh, mm);
  const offset = tzOffsetMs(new Date(naive));
  return new Date(naive - offset);
}

/** Item IDs a bidder still needs to pick up: won, paid (PENDING_PICKUP), not yet on an appointment. */
export async function getUnscheduledPickupItemIds(
  clerkUserId: string,
  organizationId: string
): Promise<string[]> {
  const wonBids = await prisma.bid.findMany({
    where: { clerkUserId, status: "WON", item: { organizationId } },
    select: { itemId: true },
  });
  const ids = [...new Set(wonBids.map((b) => b.itemId))];
  if (ids.length === 0) return [];
  const items = await prisma.item.findMany({
    // Not on an appointment AND not riding a transfer — those are handled elsewhere.
    where: { id: { in: ids }, status: "PENDING_PICKUP", pickupAppointmentId: null, transferRequestId: null },
    select: { id: true },
  });
  return items.map((i) => i.id);
}

/**
 * Attach a bidder's unscheduled pickup items to their soonest upcoming SCHEDULED
 * appointment, if they have one. Called after items become PENDING_PICKUP so later
 * wins automatically join an already-booked appointment.
 */
export async function attachToUpcomingAppointment(
  clerkUserId: string,
  organizationId: string
): Promise<{ attached: number; startsAt: Date | null }> {
  const appt = await prisma.pickupAppointment.findFirst({
    where: { clerkUserId, organizationId, status: "SCHEDULED", startsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
  });
  if (!appt) return { attached: 0, startsAt: null };
  const itemIds = await getUnscheduledPickupItemIds(clerkUserId, organizationId);
  if (itemIds.length === 0) return { attached: 0, startsAt: appt.startsAt };
  // Only fold in items that are actually AT the appointment's location (or have no
  // assigned home location). Items sitting at another location must be transferred
  // first — they get attached after the transfer is marked dropped off.
  const matching = await prisma.item.findMany({
    where: {
      id: { in: itemIds },
      OR: [{ locationId: appt.locationId }, { locationId: null }],
    },
    select: { id: true },
  });
  if (matching.length === 0) return { attached: 0, startsAt: appt.startsAt };
  await prisma.item.updateMany({
    where: { id: { in: matching.map((i) => i.id) } },
    data: { pickupAppointmentId: appt.id },
  });
  return { attached: matching.length, startsAt: appt.startsAt };
}

/**
 * Fold a bidder's newly-won items into an EXISTING, not-yet-loaded transfer so
 * they ride along to the same destination — as long as the transfer is still
 * "REQUESTED" (once it's LOADED the truck is packed and nothing new can be added).
 *
 * Only items sitting at a DIFFERENT location than the transfer's destination are
 * added (items already at the destination are "ready" and attach to the pickup
 * appointment instead). When the bidder has several pending transfers, we target
 * the one headed to their upcoming appointment's location; otherwise, the single
 * pending transfer. Ambiguous cases (multiple transfers, no appointment) are left
 * for the bidder to sort out manually.
 */
export async function attachToPendingTransfers(
  clerkUserId: string,
  organizationId: string
): Promise<{ attached: number; toLocationName: string | null }> {
  // Still-gathering transfers only — never touch LOADED/COMPLETED/CANCELLED ones.
  const transfers = await prisma.transferRequest.findMany({
    where: { clerkUserId, organizationId, status: "REQUESTED" },
    orderBy: { createdAt: "asc" },
    select: { id: true, toLocationId: true, toLocation: { select: { name: true } } },
  });
  if (transfers.length === 0) return { attached: 0, toLocationName: null };

  // Prefer the transfer headed to the bidder's upcoming appointment location.
  const appt = await prisma.pickupAppointment.findFirst({
    where: { clerkUserId, organizationId, status: "SCHEDULED", startsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
    select: { locationId: true },
  });

  let target = appt ? transfers.find((t) => t.toLocationId === appt.locationId) ?? null : null;
  if (!target) target = transfers.length === 1 ? transfers[0] : null;
  if (!target) return { attached: 0, toLocationName: null }; // ambiguous — don't guess

  const wonBids = await prisma.bid.findMany({
    where: { clerkUserId, status: "WON", item: { organizationId } },
    select: { itemId: true },
  });
  const ids = [...new Set(wonBids.map((b) => b.itemId))];
  if (ids.length === 0) return { attached: 0, toLocationName: target.toLocation?.name ?? null };

  // Loose paid items not on an appointment or transfer, sitting somewhere OTHER
  // than the destination (destination items are ready and go to the appointment).
  const loose = await prisma.item.findMany({
    where: {
      id: { in: ids },
      status: "PENDING_PICKUP",
      pickupAppointmentId: null,
      transferRequestId: null,
      locationId: { not: null },
      NOT: { locationId: target.toLocationId },
    },
    select: { id: true },
  });
  if (loose.length === 0) return { attached: 0, toLocationName: target.toLocation?.name ?? null };

  await prisma.item.updateMany({
    where: { id: { in: loose.map((i) => i.id) } },
    data: { transferRequestId: target.id },
  });
  return { attached: loose.length, toLocationName: target.toLocation?.name ?? null };
}

/**
 * Run after a payment settles: fold the newly-paid items into the bidder's
 * existing pickup appointment (items at its location) AND into any not-yet-loaded
 * transfer (items elsewhere). Appointment attach runs first so destination items
 * are claimed there, and the transfer pass only sweeps up what's left. The bidder
 * sees the result on their dashboard pickup card (no notification needed).
 */
export async function autoAttachPaidItems(
  clerkUserId: string,
  organizationId: string
): Promise<void> {
  await attachToUpcomingAppointment(clerkUserId, organizationId);
  await attachToPendingTransfers(clerkUserId, organizationId);
}

/**
 * Available bookable slots for a location over the next 4 weeks (capacity-aware,
 * Michigan time). Pass `excludeAppointmentId` when validating a RESCHEDULE so the
 * appointment being moved doesn't count against its own destination capacity.
 */
export async function getAvailableSlots(
  locationId: string,
  excludeAppointmentId?: string
): Promise<Slot[]> {
  const windows = await prisma.pickupWindow.findMany({ where: { locationId, isActive: true } });
  if (windows.length === 0) return [];

  const now = new Date();
  const horizon = new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);

  // Enumerate each Detroit CALENDAR day exactly once. Anchor on noon UTC of
  // today's Detroit date and step +24h: noon ±1h stays on the same calendar day,
  // so DST transition days are never skipped or double-counted.
  const today = zonedYMD(now);
  const noonAnchor = Date.UTC(today.y, today.mo - 1, today.d, 12, 0, 0);

  const candidates: Date[] = [];
  for (let dayOffset = 0; dayOffset <= DAYS_AHEAD; dayOffset++) {
    const dayInstant = new Date(noonAnchor + dayOffset * 24 * 60 * 60 * 1000);
    const { y, mo, d, weekday } = zonedYMD(dayInstant);
    for (const w of windows) {
      if (w.weekday !== weekday) continue;
      for (let m = w.startMinutes; m + w.slotMinutes <= w.endMinutes; m += w.slotMinutes) {
        const slot = zonedWallToUtc(y, mo - 1, d, Math.floor(m / 60), m % 60);
        if (slot.getTime() > now.getTime() && slot.getTime() <= horizon.getTime()) candidates.push(slot);
      }
    }
  }
  if (candidates.length === 0) return [];

  const existing = await prisma.pickupAppointment.findMany({
    where: {
      locationId,
      status: "SCHEDULED",
      startsAt: { gte: now, lte: horizon },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: { startsAt: true },
  });
  const usedByTime = new Map<number, number>();
  for (const a of existing) {
    const t = a.startsAt.getTime();
    usedByTime.set(t, (usedByTime.get(t) ?? 0) + 1);
  }

  // capacity from the first matching window for each slot
  const slots: Slot[] = [];
  const seen = new Set<number>();
  for (const c of candidates) {
    if (seen.has(c.getTime())) continue;
    seen.add(c.getTime());
    const { weekday } = zonedYMD(c);
    const mins = (() => {
      const p = new Intl.DateTimeFormat("en-US", { timeZone: PICKUP_TZ, hour12: false, hour: "2-digit", minute: "2-digit" }).formatToParts(c);
      const m: Record<string, string> = {}; for (const x of p) m[x.type] = x.value;
      return (+m.hour === 24 ? 0 : +m.hour) * 60 + +m.minute;
    })();
    const win = windows.find((w) => w.weekday === weekday && mins >= w.startMinutes && mins < w.endMinutes);
    const cap = win?.capacityPerSlot ?? 1;
    const remaining = cap - (usedByTime.get(c.getTime()) ?? 0);
    if (remaining > 0) slots.push({ startsAt: c.toISOString(), remaining });
  }
  slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return slots;
}

/** Capacity (max appointments) of the window covering a given slot instant, 0 if none. */
export async function getSlotCapacity(locationId: string, startsAtIso: string): Promise<number> {
  const windows = await prisma.pickupWindow.findMany({ where: { locationId, isActive: true } });
  if (windows.length === 0) return 0;
  const c = new Date(startsAtIso);
  const { weekday } = zonedYMD(c);
  const p = new Intl.DateTimeFormat("en-US", { timeZone: PICKUP_TZ, hour12: false, hour: "2-digit", minute: "2-digit" }).formatToParts(c);
  const m: Record<string, string> = {};
  for (const x of p) m[x.type] = x.value;
  const mins = (+m.hour === 24 ? 0 : +m.hour) * 60 + +m.minute;
  const win = windows.find((w) => w.weekday === weekday && mins >= w.startMinutes && mins < w.endMinutes);
  return win?.capacityPerSlot ?? 0;
}
