export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { easypostConfigured, EASYPOST_UNSET_MESSAGE, fromAddressFor } from "@/lib/easypost";
import { shippingStation, advanceClosedBundles } from "@/lib/shipping/bundle";
import { BOXES } from "@/lib/shipping/tiers";
import { requireShipAdmin, forbidden, bundleInclude, serializeBundle, buyersFor } from "./_lib";

/**
 * GET /api/admin/shipping — the Ship board.
 *
 * {
 *   configured: boolean,            // EASYPOST_API_KEY present
 *   configMessage: string | null,   // what's missing (key / return address)
 *   station: { id, name } | null,   // the org's DEFAULT station (fallback for boxes with no location)
 *   stations: [{ id, name }],       // every warehouse that ships its own boxes — the scope chips
 *   boxes: [{ code, dims }],        // the standard box list for the pack select
 *   packing: Bundle[],  // PACKING — the queue, oldest closed first
 *   closed:  Bundle[],  // CLOSED  — waiting on transfers / payment
 *   open:    Bundle[],  // OPEN    — still collecting wins
 *   shipped: Bundle[],  // SHIPPED / DELIVERED in the last 14 days, newest first
 * }
 * Bundle shape: see serializeBundle in ./_lib.ts. Every box carries
 * `location { id, name }` — the warehouse it ships from.
 */
export async function GET() {
  const membership = await requireShipAdmin();
  if (!membership) return forbidden();
  const orgId = membership.organizationId;

  // Self-healing queue: a CLOSED box whose last lot just landed moves to PACKING
  // here too, so the board never waits on the cron.
  try { await advanceClosedBundles(orgId); } catch (e) { console.error("[admin/shipping] advance failed:", e); }

  const since = new Date(Date.now() - 14 * 86_400_000);
  const [station, stationRows, active, shipped] = await Promise.all([
    shippingStation(orgId),
    prisma.pickupLocation.findMany({ where: { organizationId: orgId, isActive: true, isShippingStation: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    prisma.shippingBundle.findMany({
      where: { organizationId: orgId, status: { in: ["OPEN", "CLOSED", "PACKING"] } },
      include: bundleInclude,
      orderBy: [{ closedAt: "asc" }, { closesAt: "asc" }],
    }),
    prisma.shippingBundle.findMany({
      where: { organizationId: orgId, status: { in: ["SHIPPED", "DELIVERED"] }, OR: [{ shippedAt: { gte: since } }, { shippedAt: null, updatedAt: { gte: since } }] },
      include: bundleInclude,
      orderBy: [{ shippedAt: "desc" }],
      take: 200,
    }),
  ]);

  const buyers = await buyersFor([...active, ...shipped].map((b) => b.clerkUserId));
  const ser = (b: (typeof active)[number]) => serializeBundle(b, buyers.get(b.clerkUserId) ?? null, station);

  // Nothing flagged: the default station (oldest active warehouse) is the only chip.
  const stations = stationRows.length > 0 ? stationRows : station ? [station] : [];

  // Every station needs a parseable return address (or the SHIP_FROM_* env).
  const configured = easypostConfigured();
  let configMessage: string | null = configured ? null : EASYPOST_UNSET_MESSAGE;
  if (configured) {
    for (const st of stations.length > 0 ? stations : [null]) {
      const from = await fromAddressFor(orgId, st?.id ?? null);
      if (!from.address) { configMessage = from.error; break; }
    }
  }

  return NextResponse.json({
    configured,
    configMessage,
    station,
    stations,
    boxes: BOXES.map((b) => ({ code: b.code, dims: b.dims })),
    packing: active.filter((b) => b.status === "PACKING").map(ser),
    closed: active.filter((b) => b.status === "CLOSED").map(ser),
    open: active.filter((b) => b.status === "OPEN").map(ser),
    shipped: shipped.map(ser),
  });
}
