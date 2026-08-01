export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";
import { buildLabel, type LItem, type LabelState, type Row } from "@/lib/labelPdf";

const SOLD_STATUSES = ["SOLD", "PENDING_PICKUP", "PICKED_UP"] as const;

const fmtDate = (d: Date | null | undefined) =>
  d ? d.toLocaleString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric", year: "numeric" }) : "";
const fmtDateTime = (d: Date | null | undefined) =>
  d ? d.toLocaleString("en-US", { timeZone: "America/Detroit", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

const pdfHeaders = {
  "content-type": "application/pdf",
  "content-disposition": "inline; filename=label.pdf",
  "cache-control": "no-store",
};
const pdfResponse = (bytes: Uint8Array) => new Response(Buffer.from(bytes), { headers: pdfHeaders });

export async function GET(req: NextRequest) {
  const membership = await getUserOrg();
  if (!membership) return new Response("Not authorized", { status: 401 });
  const orgId = membership.organizationId;
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type");

  if (type === "transfer") {
    const id = sp.get("transfer") ?? "";
    const t = await prisma.transferRequest.findUnique({
      where: { id },
      include: {
        toLocation: { select: { name: true } },
        items: { select: { title: true, itemCode: true, grabbedAt: true, gatherSpot: true, storageLocation: true, location: { select: { name: true } }, auction: { select: { title: true } } } },
      },
    });
    if (!t || t.organizationId !== orgId) return new Response("Transfer not found", { status: 404 });
    const profile = await prisma.bidderProfile.findUnique({ where: { clerkUserId: t.clerkUserId }, select: { name: true, phone: true, email: true } });
    const spots = [...new Set(t.items.map((i) => i.gatherSpot).filter(Boolean))] as string[];
    const gatherSpot = spots.length === 1 ? spots[0] : spots.length > 1 ? "Multiple" : null;
    const allGathered = t.items.length > 0 && t.items.every((i) => i.grabbedAt != null);
    const state: LabelState = gatherSpot || allGathered ? "GATHERED" : "TO GATHER";
    const rows: Row[] = [
      ...(gatherSpot ? [{ label: "Gathered in", value: gatherSpot }] : []),
      { label: "Requested", value: fmtDate(t.createdAt) },
    ];
    const items: LItem[] = t.items.map((i) => ({ code: i.itemCode, title: i.title, shelf: i.storageLocation, warehouse: i.location?.name }));
    return pdfResponse(await buildLabel({
      type: "TRANSFER", state, name: profile?.name ?? "Bidder", email: profile?.email,
      destination: `To ${t.toLocation?.name ?? "Destination"}`, rows, count: t.items.length,
      // "grab from" only matters while it still needs pulling off shelves.
      countSuffix: state === "TO GATHER" ? " · grab from" : "", items,
    }));
  }

  if (type === "appointment") {
    const id = sp.get("appt") ?? "";
    const appt = await prisma.pickupAppointment.findUnique({
      where: { id },
      select: {
        organizationId: true, startsAt: true, stagedSpot: true, clerkUserId: true,
        location: { select: { name: true } },
        items: { select: { title: true, itemCode: true, grabbedAt: true, storageLocation: true, location: { select: { name: true } }, auction: { select: { title: true } } } },
      },
    });
    if (!appt || appt.organizationId !== orgId) return new Response("Appointment not found", { status: 404 });
    const profile = await prisma.bidderProfile.findUnique({ where: { clerkUserId: appt.clerkUserId }, select: { name: true, phone: true, email: true } });
    const allGathered = appt.items.length > 0 && appt.items.every((i) => i.grabbedAt != null);
    const state: LabelState = appt.stagedSpot ? "STAGED" : allGathered ? "GATHERED" : "TO GATHER";
    const rows: Row[] = [
      { label: "Pick up at", value: appt.location?.name ?? "-" },
      // Once staged, the staged spot IS the location that matters — it's off the shelf.
      ...(appt.stagedSpot ? [{ label: "Staged in", value: appt.stagedSpot }] : []),
      { label: "Appointment", value: fmtDateTime(appt.startsAt) },
    ];
    const items: LItem[] = appt.items.map((i) => ({ code: i.itemCode, title: i.title, shelf: i.storageLocation, warehouse: i.location?.name }));
    return pdfResponse(await buildLabel({
      type: "PICKUP", state, name: profile?.name ?? "Bidder", email: profile?.email, rows, count: appt.items.length, items,
    }));
  }

  if (type === "waiting") {
    const user = sp.get("user") ?? "";
    const its = await prisma.item.findMany({
      where: {
        organizationId: orgId,
        status: "PENDING_PICKUP",
        pickupAppointmentId: null,
        transferRequestId: null,
        bids: { some: { clerkUserId: user, status: "WON" } },
      },
      select: {
        title: true, itemCode: true, grabbedAt: true, gatherSpot: true, storageLocation: true,
        location: { select: { name: true } },
        auction: { select: { title: true } },
      },
    });
    if (its.length === 0) return new Response("Nothing outstanding for this bidder", { status: 404 });
    const profile = await prisma.bidderProfile.findUnique({ where: { clerkUserId: user }, select: { name: true, phone: true, email: true, preferredPickupLocationId: true } });
    let preferredName: string | null = null;
    if (profile?.preferredPickupLocationId) {
      const loc = await prisma.pickupLocation.findUnique({ where: { id: profile.preferredPickupLocationId }, select: { name: true } });
      preferredName = loc?.name ?? null;
    }
    const wSpots = [...new Set(its.map((i) => i.gatherSpot).filter(Boolean))] as string[];
    const wGatherSpot = wSpots.length === 1 ? wSpots[0] : wSpots.length > 1 ? "Multiple" : null;
    const allGathered = wGatherSpot != null || its.every((i) => i.grabbedAt != null);
    const state: LabelState = allGathered ? "GATHERED" : "TO GATHER";
    const rows: Row[] = [
      { label: "Pick up at", value: preferredName ?? "Not chosen" },
      ...(wGatherSpot ? [{ label: "Gathered in", value: wGatherSpot }] : []),
    ];
    const items: LItem[] = its.map((i) => ({ code: i.itemCode, title: i.title, shelf: i.storageLocation, warehouse: i.location?.name }));
    return pdfResponse(await buildLabel({
      type: "PICKUP", state, name: profile?.name ?? "Bidder", email: profile?.email, rows, count: its.length, countSuffix: " · all auctions", items,
    }));
  }

  if (type === "pickup") {
    const auctionId = sp.get("auction") ?? "";
    const user = sp.get("user") ?? "";
    const auction = await prisma.auction.findFirst({ where: { id: auctionId, organizationId: orgId }, select: { title: true, endAt: true } });
    if (!auction) return new Response("Auction not found", { status: 404 });
    const wonBids = await prisma.bid.findMany({
      where: { clerkUserId: user, status: "WON", item: { auctionId, status: { in: [...SOLD_STATUSES] } } },
      select: { item: { select: { title: true, itemCode: true, grabbedAt: true, storageLocation: true, location: { select: { name: true } } } } },
    });
    const its = wonBids.map((b) => b.item).filter(Boolean);
    const profile = await prisma.bidderProfile.findUnique({ where: { clerkUserId: user }, select: { name: true, phone: true, email: true, preferredPickupLocationId: true } });
    let preferredName: string | null = null;
    if (profile?.preferredPickupLocationId) {
      const loc = await prisma.pickupLocation.findUnique({ where: { id: profile.preferredPickupLocationId }, select: { name: true } });
      preferredName = loc?.name ?? null;
    }
    const warehouses = [...new Set(its.map((i) => i.location?.name).filter(Boolean))] as string[];
    const pickupAt = preferredName ?? (warehouses.length ? warehouses.join(", ") : "-");
    const allGathered = its.length > 0 && its.every((i) => i.grabbedAt != null);
    const state: LabelState = allGathered ? "GATHERED" : "TO GATHER";
    const rows: Row[] = [
      { label: "Pick up at", value: pickupAt },
      { label: "Closed", value: fmtDate(auction.endAt) },
    ];
    const items: LItem[] = its.map((i) => ({ code: i.itemCode, title: i.title, shelf: i.storageLocation, warehouse: i.location?.name }));
    return pdfResponse(await buildLabel({
      type: "PICKUP", state, name: profile?.name ?? "Bidder", email: profile?.email, rows, count: its.length, items,
    }));
  }

  return new Response("Unknown label type", { status: 400 });
}
