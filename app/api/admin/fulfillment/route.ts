export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

// Read-only fulfillment overview: every customer with outstanding (paid, not yet
// picked up) items across ALL auctions, each item's WHERE / PLACED? / PLAN, and
// per-customer issue flags. Pure read — no mutations.

const DAY = 86_400_000;
const fmtDate = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric" }) : "";

type FItem = {
  id: string;
  code: string | null;
  title: string;
  where: string;
  inTransit: boolean;
  placed: "placed" | "needs" | "nospot";
  plan: string;
  planKind: "waiting" | "gathered" | "appt" | "staged" | "transit";
  detail: string; // shelf / gather spot / staged spot
};

export async function GET() {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const orgId = membership.organizationId;

  const items = await prisma.item.findMany({
    where: { organizationId: orgId, status: "PENDING_PICKUP" },
    take: 6000,
    select: {
      id: true, title: true, itemCode: true,
      grabbedAt: true, gatherSpot: true, storageLocation: true, needsPlacement: true,
      updatedAt: true, auctionId: true,
      location: { select: { id: true, name: true } },
      transferRequest: { select: { status: true, toLocation: { select: { name: true } } } },
      pickupAppointment: { select: { id: true, startsAt: true, stagedSpot: true, status: true, location: { select: { name: true } } } },
    },
  });

  const ids = items.map((i) => i.id);
  const wins = ids.length
    ? await prisma.bid.findMany({ where: { itemId: { in: ids }, status: "WON" }, select: { itemId: true, clerkUserId: true } })
    : [];
  const buyerOf = new Map(wins.map((w) => [w.itemId, w.clerkUserId]));

  type Agg = {
    items: FItem[];
    oldest: Date;
    auctions: Set<string>;
    warehouses: Set<string>;
    anyNeedsPlacing: boolean;
    anyTransit: boolean;
    hasAppt: boolean;
    apptDate: Date | null;
    looseOutsideAppt: boolean; // paid item not on the appointment
  };
  const byUser = new Map<string, Agg>();

  for (const it of items) {
    const uid = buyerOf.get(it.id);
    if (!uid) continue;
    const tr = it.transferRequest;
    const inTransit = !!tr && (tr.status === "REQUESTED" || tr.status === "LOADED");
    const appt = it.pickupAppointment && it.pickupAppointment.status === "SCHEDULED" ? it.pickupAppointment : null;

    const where = inTransit
      ? `In transit → ${tr?.toLocation?.name ?? "?"}`
      : it.location?.name ?? "No warehouse";

    const placed: FItem["placed"] = it.needsPlacement
      ? "needs"
      : it.gatherSpot || it.storageLocation
      ? "placed"
      : "nospot";

    let plan = "Waiting";
    let planKind: FItem["planKind"] = "waiting";
    let detail = "";
    if (appt) {
      if (appt.stagedSpot) { plan = `Staged · ${fmtDate(appt.startsAt)}`; planKind = "staged"; detail = appt.stagedSpot; }
      else { plan = `Appt · ${fmtDate(appt.startsAt)}`; planKind = "appt"; }
    } else if (inTransit) {
      plan = "In transit"; planKind = "transit";
    } else if (it.grabbedAt) {
      plan = "Gathered"; planKind = "gathered"; detail = it.gatherSpot ?? "";
    } else {
      detail = it.gatherSpot || it.storageLocation || "";
    }

    const a = byUser.get(uid) ?? {
      items: [], oldest: it.updatedAt, auctions: new Set(), warehouses: new Set(),
      anyNeedsPlacing: false, anyTransit: false, hasAppt: false, apptDate: null, looseOutsideAppt: false,
    };
    a.items.push({ id: it.id, code: it.itemCode, title: it.title, where, inTransit, placed, plan, planKind, detail });
    if (it.updatedAt < a.oldest) a.oldest = it.updatedAt;
    if (it.auctionId) a.auctions.add(it.auctionId);
    if (!inTransit && it.location?.name) a.warehouses.add(it.location.name);
    if (it.needsPlacement) a.anyNeedsPlacing = true;
    if (inTransit) a.anyTransit = true;
    if (appt) { a.hasAppt = true; a.apptDate = appt.startsAt; }
    else a.looseOutsideAppt = true;
    byUser.set(uid, a);
  }

  const uids = [...byUser.keys()];
  const [profiles, locations] = await Promise.all([
    uids.length
      ? prisma.bidderProfile.findMany({
          where: { clerkUserId: { in: uids } },
          select: { clerkUserId: true, name: true, email: true, phone: true, preferredPickupLocationId: true },
        })
      : Promise.resolve([]),
    prisma.pickupLocation.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } }),
  ]);
  const pmap = new Map(profiles.map((p) => [p.clerkUserId, p]));
  const locName = new Map(locations.map((l) => [l.id, l.name]));

  const now = Date.now();
  const customers = uids.map((uid) => {
    const a = byUser.get(uid)!;
    const p = pmap.get(uid);
    const prefName = p?.preferredPickupLocationId ? locName.get(p.preferredPickupLocationId) ?? null : null;
    const waitingDays = Math.floor((now - a.oldest.getTime()) / DAY);

    const flags: { label: string; kind: "warn" | "info" | "bad" }[] = [];
    if (a.anyNeedsPlacing) flags.push({ label: "Needs placing", kind: "bad" });
    if (a.warehouses.size > 1) flags.push({ label: `${a.warehouses.size} warehouses`, kind: "warn" });
    if (a.anyTransit) flags.push({ label: "In transit", kind: "info" });
    if (a.hasAppt && a.looseOutsideAppt) flags.push({ label: "Appt + loose items", kind: "warn" });
    if (!p?.preferredPickupLocationId) flags.push({ label: "No pickup location", kind: "warn" });
    if (a.auctions.size > 1) flags.push({ label: `${a.auctions.size} auctions`, kind: "info" });
    if (waitingDays >= 21) flags.push({ label: `Waiting ${waitingDays}d`, kind: "warn" });

    return {
      clerkUserId: uid,
      name: p?.name ?? null,
      email: p?.email ?? null,
      phone: p?.phone ?? null,
      preferredLocation: prefName,
      itemCount: a.items.length,
      waitingDays,
      flags,
      attention: flags.filter((f) => f.kind !== "info").length,
      items: a.items,
    };
  });

  // Most-needs-attention first, then longest waiting.
  customers.sort((x, y) => y.attention - x.attention || y.waitingDays - x.waitingDays);

  return NextResponse.json({
    customers,
    totals: {
      customers: customers.length,
      items: customers.reduce((s, c) => s + c.itemCount, 0),
      flagged: customers.filter((c) => c.attention > 0).length,
      needsPlacing: customers.filter((c) => c.flags.some((f) => f.label === "Needs placing")).length,
    },
  });
}
