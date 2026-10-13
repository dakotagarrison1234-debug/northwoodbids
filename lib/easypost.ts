import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * EasyPost — the label counter (docs/shipping-research.md §3, §9.7; docs/shipping.md).
 *
 * Thin fetch client for https://api.easypost.com/v2, no SDK. We use four calls:
 * verify an address, create a shipment (which returns every carrier's rates),
 * buy one rate (which returns the label + tracking), refund a label. Tracking
 * updates come back to us on /api/webhooks/easypost.
 *
 * Speed is ground only (§9.7): the rate shop keeps USPS Ground Advantage (incl.
 * Cubic), USPS Priority (Cubic / flat rate) and UPS Ground / Ground Saver, drops
 * anything Express / Overnight / Next-Day, and buys the cheapest.
 *
 * Env:
 *   EASYPOST_API_KEY          — production key (test keys only buy fake labels)
 *   EASYPOST_WEBHOOK_SECRET   — optional; verifies tracker webhooks
 *   SHIP_FROM_NAME / SHIP_FROM_STREET / SHIP_FROM_CITY / SHIP_FROM_STATE /
 *   SHIP_FROM_ZIP / SHIP_FROM_PHONE — the return address when the shipping
 *   station's PickupLocation.address can't be parsed ("street, city, ST zip").
 *
 * Nothing here logs the key. Every call times out at 20s.
 */

const EP_BASE = "https://api.easypost.com/v2";
const TIMEOUT_MS = 20_000;

export function easypostConfigured(): boolean {
  return !!process.env.EASYPOST_API_KEY;
}

/** The one-line admin message for when labels can't be bought. */
export const EASYPOST_UNSET_MESSAGE = "Labels need EASYPOST_API_KEY — see docs/shipping.md. Use Mark shipped for now.";

// ─── Types (the slice of EasyPost's objects we read) ────────────────────────

export type EpAddress = {
  name?: string | null;
  company?: string | null;
  street1: string;
  street2?: string | null;
  city: string;
  state: string;
  zip: string;
  country?: string;
  phone?: string | null;
  email?: string | null;
  residential?: boolean | null;
};

export type EpRate = {
  id: string;
  carrier: string;
  service: string;
  rate: string; // "6.12"
  currency?: string;
  delivery_days?: number | null;
  est_delivery_days?: number | null;
  delivery_date_guaranteed?: boolean | null;
  carrier_account_id?: string;
};

export type EpShipment = {
  id: string;
  reference?: string | null;
  status?: string;
  rates?: EpRate[];
  selected_rate?: EpRate | null;
  postage_label?: { id: string; label_url: string; label_pdf_url?: string | null; label_file_type?: string | null } | null;
  tracking_code?: string | null;
  tracker?: { id: string; public_url?: string | null; status?: string | null } | null;
  refund_status?: string | null;
  messages?: { carrier?: string; type?: string; message?: string }[];
};

export type EpVerifiedAddress = EpAddress & {
  id?: string;
  verifications?: {
    delivery?: { success: boolean; errors?: { code?: string; field?: string; message?: string }[]; details?: unknown };
    zip4?: { success: boolean; errors?: { code?: string; field?: string; message?: string }[] };
  };
};

export class EasyPostError extends Error {
  constructor(message: string, public status: number, public body: string) {
    super(message);
  }
}

// ─── Transport ──────────────────────────────────────────────────────────────

async function ep<T>(path: string, method: "GET" | "POST" | "DELETE", body?: Record<string, unknown>): Promise<T> {
  const key = process.env.EASYPOST_API_KEY;
  if (!key) throw new EasyPostError("EASYPOST_API_KEY is not set", 0, "");
  const res = await fetch(`${EP_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `EasyPost ${path} returned ${res.status}`;
    try {
      const j = JSON.parse(text) as { error?: { code?: string; message?: string; errors?: { field?: string; message?: string }[] } };
      if (j.error?.message) msg += `: ${j.error.message}`;
      const fieldErrs = (j.error?.errors ?? []).map((e) => [e.field, e.message].filter(Boolean).join(" ")).filter(Boolean);
      if (fieldErrs.length) msg += ` (${fieldErrs.join("; ")})`;
    } catch {
      /* raw body kept below */
    }
    throw new EasyPostError(msg, res.status, text);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/** Plain-English error for the admin page. Never includes the key. */
export function easypostErrorMessage(e: unknown): string {
  if (e instanceof EasyPostError) return e.message;
  if (e instanceof Error && e.name === "TimeoutError") return "EasyPost didn't answer in 20 seconds. Try again.";
  if (e instanceof Error) return e.message;
  return "EasyPost request failed";
}

// ─── Addresses ──────────────────────────────────────────────────────────────

/**
 * Verify + normalize an address (USPS delivery check). Returns the cleaned
 * address EasyPost suggests, whether it's deliverable, and the reasons if not.
 * Free when bundled with a label; we also use it when a buyer saves an address.
 */
export async function verifyAddress(addr: EpAddress): Promise<{ ok: boolean; normalized: EpAddress; errors: string[]; id: string | null }> {
  const r = await ep<{ address?: EpVerifiedAddress } | EpVerifiedAddress>("/addresses", "POST", {
    address: { ...addr, country: addr.country ?? "US" },
    verify: ["delivery"],
  });
  const a = ("address" in r && r.address ? r.address : r) as EpVerifiedAddress;
  const delivery = a.verifications?.delivery;
  const ok = !!delivery?.success;
  const errors = (delivery?.errors ?? []).map((e) => e.message ?? e.code ?? "Address could not be verified").filter(Boolean);
  const normalized: EpAddress = {
    name: a.name ?? addr.name ?? null,
    company: a.company ?? addr.company ?? null,
    street1: a.street1 ?? addr.street1,
    street2: a.street2 ?? addr.street2 ?? null,
    city: a.city ?? addr.city,
    state: (a.state ?? addr.state).toUpperCase(),
    zip: a.zip ?? addr.zip,
    country: a.country ?? "US",
    phone: a.phone ?? addr.phone ?? null,
    email: a.email ?? addr.email ?? null,
    residential: a.residential ?? null,
  };
  return { ok, normalized, errors: ok ? [] : errors.length ? errors : ["Address could not be verified"], id: a.id ?? null };
}

// ─── Shipments / rates ──────────────────────────────────────────────────────

export type CreateShipmentInput = {
  to: EpAddress;
  from: EpAddress;
  parcel: { length: number; width: number; height: number; weightOz: number };
  /** Our bundle id — shows on the EasyPost dashboard and comes back on webhooks. */
  reference: string;
};

/**
 * Create a shipment. EasyPost rates it against every carrier account on the
 * account (USPS is built in; UPS once added) and returns the list. Labels are
 * requested as 4x6 PDF so "Print label" opens straight into the PDF viewer and
 * prints at actual size on the Rollo, same as the pull-list labels.
 */
export async function createShipment(input: CreateShipmentInput): Promise<EpShipment> {
  const { to, from, parcel, reference } = input;
  return ep<EpShipment>("/shipments", "POST", {
    shipment: {
      to_address: { ...to, country: to.country ?? "US" },
      from_address: { ...from, country: from.country ?? "US" },
      parcel: {
        length: round1(parcel.length),
        width: round1(parcel.width),
        height: round1(parcel.height),
        weight: round1(parcel.weightOz),
      },
      reference,
      options: { label_format: "PDF", label_size: "4x6", print_custom_1: reference },
    },
  });
}

export async function getShipment(shipmentId: string): Promise<EpShipment> {
  return ep<EpShipment>(`/shipments/${encodeURIComponent(shipmentId)}`, "GET");
}

/** Ask for fresh rates on an existing (unbought) shipment — rates go stale after a while. */
export async function rerateShipment(shipmentId: string): Promise<EpRate[]> {
  const r = await ep<{ rates?: EpRate[] } | EpRate[]>(`/shipments/${encodeURIComponent(shipmentId)}/rerate`, "POST", {});
  return Array.isArray(r) ? r : (r.rates ?? []);
}

/**
 * Ground only (§9.7). Exact service names as EasyPost returns them:
 *   USPS: GroundAdvantage (Cubic pricing is applied inside the same service when
 *         the box qualifies), Priority (Cubic / flat-rate boxes ride here too).
 *   UPS:  Ground, GroundSaver (UPS line-haul, USPS last mile), and the older
 *         SurePost names Ground Saver replaced.
 * Everything else (Express, NextDay, 2ndDayAir, 3DaySelect, FedEx…) is dropped.
 */
const ALLOWED: Record<string, Set<string>> = {
  USPS: new Set(["GroundAdvantage", "Priority"]),
  UPS: new Set(["Ground", "GroundSaver", "SurePostUnder1Lb", "SurePostOver1Lb"]),
};
const EXCLUDE_WORDS = /express|overnight|nextday|next_day|2ndday|3day|earlyam|expedited/i;

function carrierKey(carrier: string): string | null {
  const c = carrier.toUpperCase();
  if (c === "USPS") return "USPS";
  if (c === "UPS" || c === "UPSDAP" || c.startsWith("UPS")) return "UPS";
  return null;
}

export function isAllowedGround(rate: Pick<EpRate, "carrier" | "service">): boolean {
  const key = carrierKey(rate.carrier);
  if (!key) return false;
  if (EXCLUDE_WORDS.test(rate.service)) return false;
  return ALLOWED[key].has(rate.service);
}

export function rateCents(rate: EpRate): number {
  const n = Number.parseFloat(rate.rate);
  return Number.isFinite(n) ? Math.round(n * 100) : Number.MAX_SAFE_INTEGER;
}

/** Cheapest allowed ground rate, or null when nothing ground-ish came back. */
export function pickCheapestGround(rates: EpRate[] | undefined | null): EpRate | null {
  const ok = (rates ?? []).filter((r) => isAllowedGround(r) && Number.isFinite(Number.parseFloat(r.rate)));
  if (ok.length === 0) return null;
  ok.sort((a, b) => rateCents(a) - rateCents(b) || (a.delivery_days ?? 99) - (b.delivery_days ?? 99));
  return ok[0];
}

/** Human label: "USPS Ground Advantage", "UPS Ground Saver". */
export function serviceLabel(carrier: string, service: string): string {
  const c = carrierKey(carrier) ?? carrier;
  const s = service
    .replace(/SurePostUnder1Lb|SurePostOver1Lb/, "Ground Saver")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
  return `${c} ${s}`;
}

// ─── Buy / refund ───────────────────────────────────────────────────────────

export type BoughtLabel = {
  shipmentId: string;
  labelUrl: string;
  trackingCode: string;
  trackingUrl: string | null;
  trackerId: string | null;
  carrier: string;
  service: string;
  costCents: number;
};

/** The label already on a shipment (null until it's been bought). */
export function labelFromShipment(s: EpShipment): BoughtLabel | null {
  const url = s.postage_label?.label_pdf_url || s.postage_label?.label_url;
  if (!url || !s.tracking_code || !s.selected_rate) return null;
  return {
    shipmentId: s.id,
    labelUrl: url,
    trackingCode: s.tracking_code,
    trackingUrl: s.tracker?.public_url ?? null,
    trackerId: s.tracker?.id ?? null,
    carrier: s.selected_rate.carrier,
    service: s.selected_rate.service,
    costCents: rateCents(s.selected_rate),
  };
}

/**
 * Buy a rate. Idempotent against a double tap: if EasyPost says the shipment is
 * already purchased we fetch it and hand back the label it already has.
 */
export async function buyShipment(shipmentId: string, rateId: string): Promise<BoughtLabel> {
  try {
    const s = await ep<EpShipment>(`/shipments/${encodeURIComponent(shipmentId)}/buy`, "POST", { rate: { id: rateId } });
    const label = labelFromShipment(s);
    if (!label) throw new EasyPostError("EasyPost bought the label but returned no label URL or tracking code", 0, JSON.stringify(s));
    return label;
  } catch (e) {
    if (e instanceof EasyPostError && /already|purchased/i.test(e.message)) {
      const s = await getShipment(shipmentId);
      const label = labelFromShipment(s);
      if (label) return label;
    }
    throw e;
  }
}

/** Request a postage refund (USPS refunds unscanned labels within ~30 days; UPS voids). */
export async function refundShipment(shipmentId: string): Promise<{ refundStatus: string | null }> {
  const s = await ep<EpShipment>(`/shipments/${encodeURIComponent(shipmentId)}/refund`, "POST", {});
  return { refundStatus: s.refund_status ?? null };
}

// ─── From address (the shipping station) ────────────────────────────────────

/**
 * Best-effort parse of a PickupLocation.address written as
 * "123 Main St, Owosso, MI 48867" (street2 may sit before the city, e.g.
 * "123 Main St, Suite B, Owosso, MI 48867").
 */
export function parseStationAddress(text: string | null | undefined, hintCity?: string | null): { street1: string; street2: string | null; city: string; state: string; zip: string } | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, " ").trim();

  // 1. With commas: "street[, suite], city, ST zip" or "street, city, ST, zip".
  const parts = clean.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 3) {
    let tail = parts[parts.length - 1];
    let rest = parts.slice(0, -1);
    // "ST, 48817" split across two parts → join them.
    if (/^\d{5}(-\d{4})?$/.test(tail) && rest.length >= 3 && /^[A-Za-z]{2}\.?$/.test(rest[rest.length - 1])) {
      tail = `${rest[rest.length - 1]} ${tail}`;
      rest = rest.slice(0, -1);
    }
    const last = tail.match(/^([A-Za-z]{2})\.?\s+(\d{5})(?:-\d{4})?$/);
    if (last && rest.length >= 2) {
      const city = rest[rest.length - 1];
      const streetParts = rest.slice(0, -1);
      return { street1: streetParts[0], street2: streetParts.length > 1 ? streetParts.slice(1).join(", ") : null, city, state: last[1].toUpperCase(), zip: last[2] };
    }
  }

  // 2. No commas: "301 N Shiawassee St Corunna MI 48817". Read zip + state off
  //    the end, then the city: the warehouse's own name if it appears right
  //    before the state (it usually does), else the last single word.
  const m = clean.replace(/,/g, " ").replace(/\s+/g, " ").match(/^(.*?)\s+([A-Za-z]{2})\.?\s+(\d{5})(?:-\d{4})?$/);
  if (!m) return null;
  const before = m[1].trim();
  const state = m[2].toUpperCase();
  const zip = m[3];
  const hint = (hintCity ?? "").trim();
  let city: string | null = null;
  let street: string | null = null;
  if (hint && before.toLowerCase().endsWith(hint.toLowerCase())) {
    city = hint;
    street = before.slice(0, before.length - hint.length).trim();
  } else {
    const words = before.split(" ");
    if (words.length >= 3) {
      city = words[words.length - 1];
      street = words.slice(0, -1).join(" ");
    }
  }
  if (!city || !street) return null;
  return { street1: street, street2: null, city, state, zip };
}

/**
 * The return address on a label. Every station ships its own boxes, so this
 * reads the BOX's warehouse (`locationId` — its PickupLocation.address) first;
 * a box with no location (opened before per-station boxes) uses the org's
 * default station; if that address can't be parsed, the SHIP_FROM_* env vars.
 * Returns the reason when nothing works so the admin page can say what to fix.
 */
export async function fromAddressFor(organizationId: string, locationId: string | null = null): Promise<{ address: EpAddress | null; error: string | null }> {
  const stationSelect = { name: true, address: true, isShippingStation: true } as const;
  const [org, own, fallback] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    locationId ? prisma.pickupLocation.findFirst({ where: { id: locationId, organizationId }, select: stationSelect }) : null,
    prisma.pickupLocation.findFirst({
      where: { organizationId, isActive: true },
      orderBy: [{ isShippingStation: "desc" }, { createdAt: "asc" }],
      select: stationSelect,
    }),
  ]);
  const company = process.env.SHIP_FROM_NAME || org?.name || "Northwood Bids";
  const phone = process.env.SHIP_FROM_PHONE || null;
  // Same fallback as shippingStation() in lib/shipping/bundle.ts: the box's own
  // warehouse, else the flagged default station, else the oldest active warehouse.
  const station = own ?? fallback;
  const parsed = parseStationAddress(station?.address, station?.name);
  if (parsed) {
    return { address: { name: company, company, ...parsed, country: "US", phone }, error: null };
  }
  const street1 = process.env.SHIP_FROM_STREET;
  const city = process.env.SHIP_FROM_CITY;
  const state = process.env.SHIP_FROM_STATE;
  const zip = process.env.SHIP_FROM_ZIP;
  if (street1 && city && state && zip) {
    return { address: { name: company, company, street1, street2: null, city, state: state.toUpperCase(), zip, country: "US", phone }, error: null };
  }
  const why = station
    ? `The ${station.name} address needs a street, city, state and zip (Settings > Locations), e.g. "301 N Shiawassee St, Corunna, MI 48817".`
    : "No warehouse is set up (Settings > Locations), and SHIP_FROM_STREET/CITY/STATE/ZIP aren't set.";
  return { address: null, error: why };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ─── Webhook signature ──────────────────────────────────────────────────────

/**
 * EasyPost signs webhooks with HMAC-SHA256 over the raw body using the webhook
 * secret (NFKD-normalized), sent as `X-Hmac-Signature: hmac-sha256-hex=<hex>`.
 * With no EASYPOST_WEBHOOK_SECRET set: in production every post is refused
 * (unsigned tracking posts could otherwise flip boxes / fire texts); anywhere
 * else unsigned posts are accepted so the route can be tried out. Logged once.
 */
let warnedNoSecret = false;
export function verifyEasyPostWebhook(rawBody: string, header: string | null): boolean {
  const secret = process.env.EASYPOST_WEBHOOK_SECRET;
  if (!secret) {
    const prod = process.env.VERCEL_ENV === "production";
    if (!warnedNoSecret) {
      warnedNoSecret = true;
      console.warn(`[easypost] EASYPOST_WEBHOOK_SECRET is not set — ${prod ? "refusing" : "accepting unsigned"} tracking webhooks.`);
    }
    return !prod;
  }
  if (!header) return false;
  const idx = header.indexOf("hmac-sha256-hex=");
  if (idx === -1) return false;
  const hex = header.slice(idx + "hmac-sha256-hex=".length).trim().toLowerCase();
  const expected = createHmac("sha256", secret.normalize("NFKD")).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(hex, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
