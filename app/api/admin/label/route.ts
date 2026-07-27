export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

const SOLD_STATUSES = ["SOLD", "PENDING_PICKUP", "PICKED_UP"] as const;

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const shortTitle = (t: string, n = 26) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);
const fmtDate = (d: Date | null | undefined) =>
  d ? d.toLocaleString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric", year: "numeric" }) : "";
const fmtDateTime = (d: Date | null | undefined) =>
  d ? d.toLocaleString("en-US", { timeZone: "America/Detroit", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

type LItem = { code?: string | null; title: string; shelf?: string | null; warehouse?: string | null };

// Item list grouped by warehouse: work one location at a time; each line is
// code → clipped title → shelf.
function groupsHtml(items: LItem[]): string {
  const groups = new Map<string, LItem[]>();
  for (const it of items) {
    const key = it.warehouse || "Unassigned";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(it);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([wh, its]) => {
      const lis = its
        .slice()
        .sort((a, b) => (a.shelf || "").localeCompare(b.shelf || ""))
        .map(
          (i) =>
            `<li>${i.code ? `<span class="code">${esc(i.code)}</span>` : ""}<span class="ttl">${esc(shortTitle(i.title))}</span>${i.shelf ? `<span class="shelf">${esc(i.shelf)}</span>` : ""}</li>`
        )
        .join("");
      return `<div class="grp-h">${esc(wh)} · ${its.length}</div><ul>${lis}</ul>`;
    })
    .join("");
}

function doc(kind: string, headerRows: string, count: number, countSuffix: string, items: LItem[], nameBig: string, sub?: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: 4in 6in; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; }
body { width: 4in; font-family: Arial, Helvetica, sans-serif; color: #000; }
.wrap { padding: 0.14in 0.16in; }
.top { display: flex; justify-content: space-between; align-items: baseline; font-size: 8.5pt; font-weight: 700; }
.kind { letter-spacing: .12em; text-transform: uppercase; }
.name { font-size: 17pt; font-weight: 800; line-height: 1.04; margin-top: 3pt; word-break: break-word; }
.sub { font-size: 11pt; font-weight: 700; margin-top: 1pt; }
.rule { border-top: 1.5pt solid #000; margin: 5pt 0; }
.row { display: flex; justify-content: space-between; gap: 8pt; font-size: 9pt; margin: 1.5pt 0; }
.row span:first-child { color: #333; }
.row b { font-weight: 800; text-align: right; }
.cnt { font-size: 10pt; font-weight: 800; margin-top: 3pt; }
.grp-h { font-size: 8.5pt; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; background: #000; color: #fff; padding: 1.5pt 4pt; margin-top: 4pt; }
ul { margin: 0; padding: 0; }
li { list-style: none; display: flex; gap: 5pt; align-items: baseline; font-size: 9pt; line-height: 1.25; padding: 1.5pt 0; border-bottom: .5pt dotted #999; }
.code { font-weight: 800; font-family: "Courier New", monospace; white-space: nowrap; }
.ttl { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.shelf { font-weight: 800; white-space: nowrap; font-size: 8.5pt; }
</style></head><body><div class="wrap">
<div class="top"><span>NORTHWOOD BIDS</span><span class="kind">${esc(kind)}</span></div>
<div class="name">${esc(nameBig)}</div>
${sub ? `<div class="sub">${esc(sub)}</div>` : ""}
<div class="rule"></div>
${headerRows}
<div class="rule"></div>
<div class="cnt">${count} item${count !== 1 ? "s" : ""}${countSuffix}</div>
${groupsHtml(items)}
</div></body></html>`;
}

export async function GET(req: NextRequest) {
  const membership = await getUserOrg();
  if (!membership) return new Response("Not authorized", { status: 401 });
  const orgId = membership.organizationId;
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type");
  const htmlHeaders = { "content-type": "text/html; charset=utf-8" };

  if (type === "transfer") {
    const id = sp.get("transfer") ?? "";
    const t = await prisma.transferRequest.findUnique({
      where: { id },
      include: {
        toLocation: { select: { name: true } },
        items: { select: { title: true, itemCode: true, storageLocation: true, location: { select: { name: true } }, auction: { select: { title: true } } } },
      },
    });
    if (!t || t.organizationId !== orgId) return new Response("Transfer not found", { status: 404 });
    const profile = await prisma.bidderProfile.findUnique({ where: { clerkUserId: t.clerkUserId }, select: { name: true, phone: true } });
    const auctions = [...new Set(t.items.map((i) => i.auction?.title).filter(Boolean))] as string[];
    const rows =
      `<div class="row"><span>Requested</span><b>${esc(fmtDate(t.createdAt))}</b></div>` +
      `<div class="row"><span>Auction${auctions.length !== 1 ? "s" : ""}</span><b>${esc(auctions.join(", ") || "—")}</b></div>` +
      (profile?.phone ? `<div class="row"><span>Phone</span><b>${esc(profile.phone)}</b></div>` : "");
    const items: LItem[] = t.items.map((i) => ({ code: i.itemCode, title: i.title, shelf: i.storageLocation, warehouse: i.location?.name }));
    return new Response(
      doc("Transfer", rows, t.items.length, " · grab from", items, `→ ${t.toLocation?.name ?? "Destination"}`, `For: ${profile?.name ?? "Bidder"}`),
      { headers: htmlHeaders }
    );
  }

  if (type === "appointment") {
    const id = sp.get("appt") ?? "";
    const appt = await prisma.pickupAppointment.findUnique({
      where: { id },
      select: {
        organizationId: true, startsAt: true, stagedSpot: true, clerkUserId: true,
        location: { select: { name: true } },
        items: { select: { title: true, itemCode: true, storageLocation: true, location: { select: { name: true } }, auction: { select: { title: true } } } },
      },
    });
    if (!appt || appt.organizationId !== orgId) return new Response("Appointment not found", { status: 404 });
    const profile = await prisma.bidderProfile.findUnique({ where: { clerkUserId: appt.clerkUserId }, select: { name: true, phone: true } });
    const auctions = [...new Set(appt.items.map((i) => i.auction?.title).filter(Boolean))] as string[];
    const rows =
      `<div class="row"><span>Pick up at</span><b>${esc(appt.location?.name ?? "—")}</b></div>` +
      `<div class="row"><span>Appointment</span><b>${esc(fmtDateTime(appt.startsAt))}</b></div>` +
      (appt.stagedSpot ? `<div class="row"><span>Staged in</span><b>${esc(appt.stagedSpot)}</b></div>` : "") +
      `<div class="row"><span>Auction${auctions.length !== 1 ? "s" : ""}</span><b>${esc(auctions.join(", ") || "—")}</b></div>`;
    const items: LItem[] = appt.items.map((i) => ({ code: i.itemCode, title: i.title, shelf: i.storageLocation, warehouse: i.location?.name }));
    return new Response(doc("Pickup", rows, appt.items.length, "", items, profile?.name ?? "Bidder", profile?.phone ?? undefined), { headers: htmlHeaders });
  }

  if (type === "pickup") {
    const auctionId = sp.get("auction") ?? "";
    const user = sp.get("user") ?? "";
    const auction = await prisma.auction.findFirst({ where: { id: auctionId, organizationId: orgId }, select: { title: true, endAt: true } });
    if (!auction) return new Response("Auction not found", { status: 404 });
    const wonBids = await prisma.bid.findMany({
      where: { clerkUserId: user, status: "WON", item: { auctionId, status: { in: [...SOLD_STATUSES] } } },
      select: { item: { select: { title: true, itemCode: true, storageLocation: true, location: { select: { name: true } } } } },
    });
    const its = wonBids.map((b) => b.item).filter(Boolean);
    const profile = await prisma.bidderProfile.findUnique({ where: { clerkUserId: user }, select: { name: true, phone: true, preferredPickupLocationId: true } });
    let preferredName: string | null = null;
    if (profile?.preferredPickupLocationId) {
      const loc = await prisma.pickupLocation.findUnique({ where: { id: profile.preferredPickupLocationId }, select: { name: true } });
      preferredName = loc?.name ?? null;
    }
    const warehouses = [...new Set(its.map((i) => i.location?.name).filter(Boolean))] as string[];
    const pickupAt = preferredName ?? warehouses.join(", ") ?? "—";
    const rows =
      `<div class="row"><span>Pick up at</span><b>${esc(pickupAt)}</b></div>` +
      `<div class="row"><span>Auction</span><b>${esc(auction.title)}</b></div>` +
      `<div class="row"><span>Closed</span><b>${esc(fmtDate(auction.endAt))}</b></div>`;
    const items: LItem[] = its.map((i) => ({ code: i.itemCode, title: i.title, shelf: i.storageLocation, warehouse: i.location?.name }));
    return new Response(doc("Pickup", rows, its.length, "", items, profile?.name ?? "Bidder", profile?.phone ?? undefined), { headers: htmlHeaders });
  }

  return new Response("Unknown label type", { status: 400 });
}
