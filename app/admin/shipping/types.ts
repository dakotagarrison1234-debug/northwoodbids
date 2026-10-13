/** Client-side mirror of serializeBundle() in app/api/admin/shipping/_lib.ts. */

export type Lot = {
  id: string;
  code: string | null;
  title: string;
  thumb: string | null;
  status: string;
  locationId: string | null;
  locationName: string | null;
  transferRequestId: string | null;
  transferTo: string | null;
  shelf: string | null;
  gathered: boolean;
  paid: boolean;
  atStation: boolean;
  shipChargeCents: number;
};

export type BoxStatus = "OPEN" | "CLOSED" | "PACKING" | "SHIPPED" | "DELIVERED" | "CANCELLED";

export type Box = {
  id: string;
  status: BoxStatus;
  openedAt: string;
  closesAt: string;
  closedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  /** The warehouse this box ships from (the org default for boxes opened before per-station boxes). */
  location: { id: string; name: string } | null;
  /** Whole days since the box closed (0 while OPEN). */
  daysSinceClosed: number;
  buyer: { clerkUserId: string; name: string | null; phone: string | null; email: string | null };
  ship: { name: string; street1: string; street2: string | null; city: string; state: string; zip: string; phone: string | null };
  zone: number;
  weightOz: number;
  boxCode: string | null;
  box: { code: string; dims: { l: number; w: number; h: number } } | null;
  tierCents: number;
  chargedCents: number;
  labelCostCents: number | null;
  carrier: string | null;
  service: string | null;
  serviceLabel: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  lastTrackingStatus: string | null;
  packedWeightOz: number | null;
  packedBoxCode: string | null;
  hasShipment: boolean;
  notes: string | null;
  lots: Lot[];
  lotsHere: number;
};

export type BoxOption = { code: string; dims: { l: number; w: number; h: number } };

export type Board = {
  configured: boolean;
  configMessage: string | null;
  /** The org's default station — the fallback when a box has no location. */
  station: { id: string; name: string } | null;
  /** Every warehouse that ships its own boxes — the scope chips in the header. */
  stations: { id: string; name: string }[];
  boxes: BoxOption[];
  packing: Box[];
  closed: Box[];
  open: Box[];
  shipped: Box[];
};

export type Rate = { id: string; carrier: string; service: string; label: string; cents: number; days: number | null };

export const fmtCents = (c: number) => `$${(Math.abs(c) / 100).toFixed(2)}`;
export const signedCents = (c: number) => `${c < 0 ? "-" : "+"}${fmtCents(c)}`;
export const fmtWeight = (oz: number) => (oz < 16 ? `${oz} oz` : `${(oz / 16).toFixed(oz % 16 === 0 ? 0 : 1)} lb`);
export const dimsLabel = (d: { l: number; w: number; h: number } | null | undefined) => (d ? `${d.l}×${d.w}×${d.h}` : "box not set");

/** Tracking status pill: what EasyPost says, in warehouse words. */
export function trackingPill(status: string | null, boxStatus: BoxStatus): { label: string; tone: "slate" | "blue" | "amber" | "green" | "red" } {
  if (boxStatus === "DELIVERED" || status === "delivered") return { label: "Delivered", tone: "green" };
  switch (status) {
    case "pre_transit": return { label: "Label made", tone: "slate" };
    case "in_transit": return { label: "In transit", tone: "blue" };
    case "out_for_delivery": return { label: "Out for delivery", tone: "amber" };
    case "available_for_pickup": return { label: "At post office", tone: "amber" };
    case "return_to_sender": return { label: "Returning", tone: "red" };
    case "failure": case "error": case "cancelled": return { label: "Problem", tone: "red" };
    default: return { label: "No scan yet", tone: "slate" };
  }
}

/** A lot unpaid this long after its box closed gets the red "Unpaid N days" pill (and the nudge to move it to pickup). */
export const UNPAID_NUDGE_DAYS = 3;
