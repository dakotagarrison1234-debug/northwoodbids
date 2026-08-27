import { prisma } from "@/lib/prisma";

/**
 * Concierge lookup — the read-only "brain" behind the GoHighLevel support bot and
 * (later) the website chat widget. Given the PHONE NUMBER that started the
 * conversation, it returns that one bidder's current, NON-FINANCIAL status:
 * what they won, where each item physically is, whether it's ready or being moved,
 * and their pickup appointment (or that they still need to book one).
 *
 * Hard rules baked in here (not left to the bot to remember):
 *  - Only ever returns data for the exact phone that was passed in. No cross-lookups.
 *  - NEVER exposes anything about money: no balances, no card status, no amounts.
 *    (We don't even select those columns.) Returns/refunds are a human's job.
 */

const BASE = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://northwoodbids.com";
const TZ = "America/Detroit";

/** Last-10-digits key for matching a phone regardless of formatting (+1, dashes…). */
function phoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/** "Thu, Jul 31 at 2:00 PM" in Michigan time. */
function fmtWhen(d: Date): string {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "short", month: "short", day: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour: "numeric", minute: "2-digit",
  }).format(d);
  return `${day} at ${time}`;
}

export type ConciergeItem = {
  title: string;
  state: "picked_up" | "moving" | "ready_booked" | "ready_unbooked" | "processing";
  stateLabel: string;
  locationName: string | null;
};

export type ConciergeStatus = {
  found: boolean;
  firstName: string | null;
  itemCount: number;
  items: ConciergeItem[];
  pickup: {
    booked: boolean;
    when: string | null;
    locationName: string | null;
    address: string | null;
    boxed: boolean;
    /** The staged spot string (e.g. "Shelf 2") when the order is boxed & waiting. */
    spot: string | null;
  };
  needsToBook: boolean;
  links: { bookPickup: string; account: string };
  /** A ready-to-relay, customer-safe message the bot can send as-is. */
  briefing: string;
};

const LINKS = { bookPickup: `${BASE}/pickup`, account: `${BASE}/dashboard` };

function notFound(): ConciergeStatus {
  return {
    found: false,
    firstName: null,
    itemCount: 0,
    items: [],
    pickup: { booked: false, when: null, locationName: null, address: null, boxed: false, spot: null },
    needsToBook: false,
    links: LINKS,
    briefing:
      "Hmm, I can't find an account hitched to this phone number. If you bid under a " +
      "different number or email, holler and I'll take another look — otherwise a team " +
      "member will reach out to help.",
  };
}

/** Resolve a phone number to a bidder's clerkUserId, matching on last-10-digits. */
async function findBidderByPhone(phone: string): Promise<{ clerkUserId: string; name: string | null } | null> {
  const key = phoneKey(phone);
  if (!key) return null;

  // Fast path: common stored formats.
  const candidates = [key, `+1${key}`, `1${key}`, `+${key}`];
  const exact = await prisma.bidderProfile.findFirst({
    where: { phone: { in: candidates } },
    select: { clerkUserId: true, name: true },
  });
  if (exact) return exact;

  // Fallback: scan phones and compare normalized keys (covers dashed/parenthesized
  // formats). Single-business scale — a few thousand rows at most.
  const all = await prisma.bidderProfile.findMany({
    where: { phone: { not: null } },
    select: { clerkUserId: true, name: true, phone: true },
  });
  const hit = all.find((p) => phoneKey(p.phone) === key);
  return hit ? { clerkUserId: hit.clerkUserId, name: hit.name } : null;
}

/**
 * Build the full non-financial status for whoever owns `phone`.
 * Returns `{ found: false }` (with a friendly briefing) if no bidder matches.
 */
export async function getBidderStatus(phone: string): Promise<ConciergeStatus> {
  const bidder = await findBidderByPhone(phone);
  if (!bidder) return notFound();

  const { clerkUserId } = bidder;
  const firstName = (bidder.name ?? "").trim().split(/\s+/)[0] || null;

  // Everything they've won.
  const wonBids = await prisma.bid.findMany({
    where: { clerkUserId, status: "WON" },
    select: { itemId: true },
  });
  const ids = [...new Set(wonBids.map((b) => b.itemId))];

  // Note the deliberately narrow select — no price/payment columns are read at all.
  const items = ids.length
    ? await prisma.item.findMany({
        where: { id: { in: ids } },
        select: {
          title: true,
          status: true,
          location: { select: { name: true } },
          pickupAppointment: {
            select: { status: true, startsAt: true, stagedSpot: true, location: { select: { name: true, address: true } } },
          },
          transferRequest: { select: { status: true, toLocation: { select: { name: true } } } },
        },
      })
    : [];

  const conciergeItems: ConciergeItem[] = items.map((it) => {
    const loc = it.location?.name ?? null;
    const appt = it.pickupAppointment;
    const xfer = it.transferRequest;

    if (it.status === "PICKED_UP") {
      return { title: it.title, state: "picked_up", stateLabel: "Picked up ✓", locationName: loc };
    }
    if (xfer && (xfer.status === "REQUESTED" || xfer.status === "LOADED")) {
      const to = xfer.toLocation?.name ?? "your pickup location";
      return {
        title: it.title,
        state: "moving",
        stateLabel: `Being moved to ${to} — we'll let you know when it's ready`,
        locationName: loc,
      };
    }
    if (appt && appt.status === "SCHEDULED") {
      const where = appt.location?.name ?? loc ?? "your pickup location";
      const when = appt.startsAt ? fmtWhen(appt.startsAt) : null;
      const boxed = appt.stagedSpot ? " (boxed and waiting)" : "";
      return {
        title: it.title,
        state: "ready_booked",
        stateLabel: when ? `Ready for pickup — ${when} at ${where}${boxed}` : `Ready at ${where}${boxed}`,
        locationName: where,
      };
    }
    if (it.status === "PENDING_PICKUP") {
      return {
        title: it.title,
        state: "ready_unbooked",
        stateLabel: loc ? `Ready at ${loc} — needs a pickup time booked` : "Ready — needs a pickup time booked",
        locationName: loc,
      };
    }
    // Won but not yet ready to hand over. We never say why (payment is off-limits).
    return {
      title: it.title,
      state: "processing",
      stateLabel: "Being processed — we'll text you when it's ready",
      locationName: loc,
    };
  });

  // Their next scheduled pickup, if any.
  const nextAppt = await prisma.pickupAppointment.findFirst({
    where: { clerkUserId, status: "SCHEDULED", startsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true, stagedSpot: true, location: { select: { name: true, address: true } } },
  });

  const needsToBook = !nextAppt && conciergeItems.some((i) => i.state === "ready_unbooked");

  const pickup = {
    booked: !!nextAppt,
    when: nextAppt ? fmtWhen(nextAppt.startsAt) : null,
    locationName: nextAppt?.location?.name ?? null,
    address: nextAppt?.location?.address ?? null,
    boxed: !!nextAppt?.stagedSpot,
    spot: nextAppt?.stagedSpot ?? null,
  };

  return {
    found: true,
    firstName,
    itemCount: conciergeItems.length,
    items: conciergeItems,
    pickup,
    needsToBook,
    links: LINKS,
    briefing: buildBriefing(firstName, conciergeItems, pickup, needsToBook),
  };
}

/**
 * Customer-safe message the bot relays verbatim. No money, ever.
 *
 * Deliberately CONCISE — it does NOT enumerate every item. It gives the count and
 * the one thing the customer actually asked for: where, when, which spot, and that
 * it's self-serve. e.g.
 *   "Your 2 items are ready for pickup at Owosso on Thu, Jul 31 at 2:30 PM, Shelf 2.
 *    Come on in and help yourself — the doors are unlocked!"
 */
function buildBriefing(
  firstName: string | null,
  items: ConciergeItem[],
  pickup: ConciergeStatus["pickup"],
  needsToBook: boolean
): string {
  const hi = firstName ? `Howdy ${firstName}! ` : "Howdy! ";

  if (items.length === 0) {
    return (
      `${hi}I don't see any won items on your account right now. If you just won ` +
      `something it may still be updating — check back in a bit, or a team member can help.`
    );
  }

  const n = items.length;
  const noun = (c: number) => `${c} item${c !== 1 ? "s" : ""}`;
  const isare = (c: number) => (c === 1 ? "is" : "are");
  const itthey = (c: number) => (c === 1 ? "it's" : "they're");

  const notReady = items.filter((i) => i.state === "moving" || i.state === "processing").length;
  const allPickedUp = items.every((i) => i.state === "picked_up");

  // Already collected.
  if (allPickedUp) {
    return `${hi}Looks like your ${noun(n)} ${isare(n)} already picked up — you're all set!`;
  }

  // Booked pickup — the common "when's my pickup" answer. Short and self-serve.
  if (pickup.booked) {
    const loc = pickup.locationName ? ` at ${pickup.locationName}` : "";
    const when = pickup.when ? ` on ${pickup.when}` : "";
    const spot = pickup.spot ? `, ${pickup.spot}` : "";
    let msg = `${hi}Your ${noun(n)} ${isare(n)} ready for pickup${loc}${when}${spot}. Come on in and help yourself — the doors are unlocked!`;
    if (notReady > 0 && notReady < n) {
      msg += ` (${noun(notReady)} ${isare(notReady)} still on the way — I'll text you when ${itthey(notReady)} ready.)`;
    }
    return msg;
  }

  // Ready, but no time booked yet.
  if (needsToBook) {
    return `${hi}Your ${noun(n)} ${isare(n)} ready to grab — just pick a pickup time here and come help yourself: ${LINKS.bookPickup}`;
  }

  // Still being gathered / moved between warehouses.
  if (notReady > 0) {
    return `${hi}Your ${noun(n)} ${isare(n)} being gathered for pickup — I'll text you the moment ${itthey(n)} ready.`;
  }

  // Ready but nothing to book (edge) — keep it short.
  const where = pickup.locationName ? ` at ${pickup.locationName}` : "";
  return `${hi}Your ${noun(n)} ${isare(n)} ready for pickup${where}. Come on in and help yourself — the doors are unlocked!`;
}
