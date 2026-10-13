export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getShipProfile } from "@/lib/shipping/bundle";
import { zoneForState, ZONE_LABEL, NOT_SHIPPABLE } from "@/lib/shipping/tiers";

const LOWER_48_ONLY = "We ship to the lower 48 states only.";

type AddressIn = { name: string; street1: string; street2: string | null; city: string; state: string; zip: string; phone: string | null };

/** GET /api/shipping/address — the signed-in bidder's saved address + zone (null if none). */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const profile = await getShipProfile(userId);
  if (!profile) return NextResponse.json({ address: null });
  const { zone, verifiedAt, ...address } = profile;
  return NextResponse.json({ address, zone, zoneLabel: ZONE_LABEL[zone], verifiedAt });
}

/**
 * POST /api/shipping/address { name, street1, street2?, city, state, zip, phone? }
 * Lower 48 only. Verified through EasyPost when EASYPOST_API_KEY is set (the
 * normalized address is what we store); otherwise stored as typed, unverified.
 *
 * The ship-to address is frozen on a box when it opens, so a change never
 * touches an OPEN box: the response carries `appliesToNextBox: true` when the
 * buyer has one, and the modal tells them so.
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  // Trim + cap: these go on a label and to EasyPost — nothing needs more than 120 chars.
  const s = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 120) : "");
  const input: AddressIn = {
    name: s(body.name),
    street1: s(body.street1),
    street2: s(body.street2) || null,
    city: s(body.city),
    state: s(body.state).toUpperCase(),
    zip: s(body.zip),
    phone: s(body.phone).replace(/[^\d+]/g, "") || null,
  };

  if (!input.name) return NextResponse.json({ error: "Who's it going to? Add a name." }, { status: 400 });
  if (!input.street1) return NextResponse.json({ error: "Add a street address." }, { status: 400 });
  if (!input.city) return NextResponse.json({ error: "Add a city." }, { status: 400 });
  if (!/^[A-Z]{2}$/.test(input.state)) return NextResponse.json({ error: "State should be two letters, like MI." }, { status: 400 });
  if (!/^\d{5}(-\d{4})?$/.test(input.zip)) return NextResponse.json({ error: "ZIP should be 5 digits." }, { status: 400 });
  if (NOT_SHIPPABLE.has(input.state) || !zoneForState(input.state)) {
    return NextResponse.json({ error: LOWER_48_ONLY, lower48: false }, { status: 422 });
  }

  let stored: AddressIn = input;
  let verifiedAt: Date | null = null;
  const key = process.env.EASYPOST_API_KEY;
  if (key) {
    const v = await verifyWithEasyPost(key, input);
    if (v.status === "rejected") return NextResponse.json({ error: v.message }, { status: 422 });
    if (v.status === "ok") {
      stored = v.address;
      verifiedAt = new Date();
      // EasyPost can rewrite the state; re-check we're still in the lower 48.
      if (!zoneForState(stored.state)) return NextResponse.json({ error: LOWER_48_ONLY, lower48: false }, { status: 422 });
    }
    // "unavailable" (EasyPost down / bad key): keep the typed address, unverified.
  }

  await prisma.bidderProfile.upsert({
    where: { clerkUserId: userId },
    update: {
      shipName: stored.name, shipStreet1: stored.street1, shipStreet2: stored.street2, shipCity: stored.city,
      shipState: stored.state, shipZip: stored.zip, shipPhone: stored.phone, shipVerifiedAt: verifiedAt,
    },
    create: {
      clerkUserId: userId,
      shipName: stored.name, shipStreet1: stored.street1, shipStreet2: stored.street2, shipCity: stored.city,
      shipState: stored.state, shipZip: stored.zip, shipPhone: stored.phone, shipVerifiedAt: verifiedAt,
    },
  });

  const zone = zoneForState(stored.state)!;
  const openBoxes = await prisma.shippingBundle.count({ where: { clerkUserId: userId, status: "OPEN", closesAt: { gt: new Date() } } });
  return NextResponse.json({ success: true, address: stored, zone, zoneLabel: ZONE_LABEL[zone], verifiedAt, appliesToNextBox: openBoxes > 0 });
}

/**
 * EasyPost standalone address verification (POST /v2/addresses with verify: ["delivery"]).
 * Basic auth: the key as the username, empty password. Returns the normalized
 * address on success, "rejected" when the carrier says it's undeliverable, and
 * "unavailable" when EasyPost itself can't be reached (we don't block the buyer on that).
 */
async function verifyWithEasyPost(key: string, a: AddressIn): Promise<
  { status: "ok"; address: AddressIn } | { status: "rejected"; message: string } | { status: "unavailable" }
> {
  try {
    const res = await fetch("https://api.easypost.com/v2/addresses", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        address: {
          name: a.name, street1: a.street1, street2: a.street2 ?? undefined, city: a.city, state: a.state, zip: a.zip,
          country: "US", phone: a.phone ?? undefined,
        },
        verify: ["delivery"],
      }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !json) return { status: "unavailable" };

    const verifications = json.verifications as { delivery?: { success?: boolean; errors?: { message?: string }[] } } | undefined;
    const delivery = verifications?.delivery;
    if (delivery && delivery.success === false) {
      const detail = delivery.errors?.map((e) => e.message).filter(Boolean)[0];
      return { status: "rejected", message: detail ? `We couldn't verify that address: ${detail}.` : "We couldn't verify that address. Check the street and ZIP." };
    }
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    return {
      status: "ok",
      address: {
        name: str(json.name) || a.name,
        street1: str(json.street1) || a.street1,
        street2: str(json.street2) || null,
        city: str(json.city) || a.city,
        state: (str(json.state) || a.state).toUpperCase(),
        zip: str(json.zip) || a.zip,
        phone: str(json.phone) || a.phone,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}
