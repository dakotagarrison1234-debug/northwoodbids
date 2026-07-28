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

type LabelState = "STAGED" | "GATHERED" | "TO GATHER";

function doc(opts: {
  type: "PICKUP" | "TRANSFER";
  state: LabelState;
  name: string;
  phone?: string | null;
  email?: string | null;
  destination?: string | null; // transfer: "→ Gladwin"
  headerRows: string;
  count: number;
  countSuffix?: string;
  items: LItem[];
}): string {
  const stateClass = opts.state === "STAGED" ? "b-staged" : opts.state === "GATHERED" ? "b-gathered" : "b-togather";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: 4in 6in; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
/* Fill 100% of the page box (not a fixed 4in) so the browser never shrinks the
   label and leaves empty margins inside the sheet. */
html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
body { font-family: Arial, Helvetica, sans-serif; color: #000; }
.wrap { width: 100%; height: 100%; padding: 0.08in 0.1in; display: flex; flex-direction: column; }
.banner { text-align: center; font-size: 14pt; font-weight: 900; letter-spacing: .05em; text-transform: uppercase; color: #fff; padding: 5pt; border-radius: 3pt; }
.b-staged { background: #3f6f34; }
.b-gathered { background: #8a5a2b; }
.b-togather { background: #333; }
.name { font-size: 20pt; font-weight: 900; line-height: 1.02; margin-top: 5pt; word-break: break-word; }
.dest { font-size: 14pt; font-weight: 800; margin-top: 1pt; }
.contact { font-size: 11pt; font-weight: 700; }
.rule { border-top: 2pt solid #000; margin: 4pt 0; }
.row { display: flex; justify-content: space-between; gap: 8pt; font-size: 10.5pt; margin: 2pt 0; }
.row span:first-child { color: #333; }
.row b { font-weight: 800; text-align: right; }
.cnt { font-size: 11pt; font-weight: 800; margin-top: 3pt; }
.list { flex: 1; overflow: hidden; }
.grp-h { font-size: 9.5pt; font-weight: 800; letter-spacing: .03em; text-transform: uppercase; background: #000; color: #fff; padding: 2pt 5pt; margin-top: 4pt; }
ul { margin: 0; padding: 0; }
li { list-style: none; display: flex; gap: 6pt; align-items: baseline; font-size: 10.5pt; line-height: 1.3; padding: 2pt 0; border-bottom: .5pt dotted #999; }
.code { font-weight: 800; font-family: "Courier New", monospace; white-space: nowrap; }
.ttl { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.shelf { font-weight: 800; white-space: nowrap; font-size: 9.5pt; }
</style></head><body><div class="wrap">
<div class="banner ${stateClass}">${opts.type} · ${opts.state}</div>
<div class="name">${esc(opts.name)}</div>
${opts.destination ? `<div class="dest">${esc(opts.destination)}</div>` : ""}
${opts.phone ? `<div class="contact">${esc(opts.phone)}</div>` : ""}
${opts.email ? `<div class="contact">${esc(opts.email)}</div>` : ""}
<div class="rule"></div>
${opts.headerRows}
<div class="rule"></div>
<div class="cnt">${opts.count} item${opts.count !== 1 ? "s" : ""}${opts.countSuffix ?? ""}</div>
<div class="list">${groupsHtml(opts.items)}</div>
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
        items: { select: { title: true, itemCode: true, grabbedAt: true, storageLocation: true, location: { select: { name: true } }, auction: { select: { title: true } } } },
      },
    });
    if (!t || t.organizationId !== orgId) return new Response("Transfer not found", { status: 404 });
    const profile = await prisma.bidderProfile.findUnique({ where: { clerkUserId: t.clerkUserId }, select: { name: true, phone: true, email: true } });
    const auctions = [...new Set(t.items.map((i) => i.auction?.title).filter(Boolean))] as string[];
    const allGathered = t.items.length > 0 && t.items.every((i) => i.grabbedAt != null);
    const state: LabelState = t.stagedSpot ? "STAGED" : allGathered ? "GATHERED" : "TO GATHER";
    const rows =
      (t.stagedSpot ? `<div class="row"><span>Staged in</span><b>${esc(t.stagedSpot)}</b></div>` : "") +
      `<div class="row"><span>Load status</span><b>${t.status === "LOADED" ? "Loaded — in transit" : "Not loaded yet"}</b></div>` +
      `<div class="row"><span>Requested</span><b>${esc(fmtDate(t.createdAt))}</b></div>` +
      `<div class="row"><span>Auction${auctions.length !== 1 ? "s" : ""}</span><b>${esc(auctions.join(", ") || "—")}</b></div>`;
    const items: LItem[] = t.items.map((i) => ({ code: i.itemCode, title: i.title, shelf: i.storageLocation, warehouse: i.location?.name }));
    return new Response(
      doc({
        type: "TRANSFER",
        state,
        name: profile?.name ?? "Bidder",
        phone: profile?.phone,
        email: profile?.email,
        destination: `→ ${t.toLocation?.name ?? "Destination"}`,
        headerRows: rows,
        count: t.items.length,
        countSuffix: " · grab from",
        items,
      }),
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
        items: { select: { title: true, itemCode: true, grabbedAt: true, storageLocation: true, location: { select: { name: true } }, auction: { select: { title: true } } } },
      },
    });
    if (!appt || appt.organizationId !== orgId) return new Response("Appointment not found", { status: 404 });
    const profile = await prisma.bidderProfile.findUnique({ where: { clerkUserId: appt.clerkUserId }, select: { name: true, phone: true, email: true } });
    const auctions = [...new Set(appt.items.map((i) => i.auction?.title).filter(Boolean))] as string[];
    const allGathered = appt.items.length > 0 && appt.items.every((i) => i.grabbedAt != null);
    const state: LabelState = appt.stagedSpot ? "STAGED" : allGathered ? "GATHERED" : "TO GATHER";
    const rows =
      `<div class="row"><span>Pick up at</span><b>${esc(appt.location?.name ?? "—")}</b></div>` +
      `<div class="row"><span>Appointment</span><b>${esc(fmtDateTime(appt.startsAt))}</b></div>` +
      (appt.stagedSpot ? `<div class="row"><span>Staged in</span><b>${esc(appt.stagedSpot)}</b></div>` : "") +
      `<div class="row"><span>Auction${auctions.length !== 1 ? "s" : ""}</span><b>${esc(auctions.join(", ") || "—")}</b></div>`;
    const items: LItem[] = appt.items.map((i) => ({ code: i.itemCode, title: i.title, shelf: i.storageLocation, warehouse: i.location?.name }));
    return new Response(
      doc({ type: "PICKUP", state, name: profile?.name ?? "Bidder", phone: profile?.phone, email: profile?.email, headerRows: rows, count: appt.items.length, items }),
      { headers: htmlHeaders }
    );
  }

  // A customer's WHOLE outstanding pickup — every paid item across every auction that
  // isn't on an appointment yet. One label to gather it all in one bundle.
  if (type === "waiting") {
    const user = sp.get("user") ?? "";
    const its = await prisma.item.findMany({
      // Only items physically here (not on an active transfer) — those are what you
      // can actually gather into one bundle now.
      where: {
        organizationId: orgId,
        status: "PENDING_PICKUP",
        pickupAppointmentId: null,
        transferRequestId: null,
        bids: { some: { clerkUserId: user, status: "WON" } },
      },
      select: {
        title: true, itemCode: true, grabbedAt: true, storageLocation: true,
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
    const auctions = [...new Set(its.map((i) => i.auction?.title).filter(Boolean))] as string[];
    const allGathered = its.every((i) => i.grabbedAt != null);
    const state: LabelState = allGathered ? "GATHERED" : "TO GATHER";
    const rows =
      `<div class="row"><span>Pick up at</span><b>${esc(preferredName ?? "Not chosen")}</b></div>` +
      `<div class="row"><span>Auctions</span><b>${esc(auctions.join(", ") || "—")}</b></div>` +
      `<div class="row"><span>Status</span><b>Not scheduled yet</b></div>`;
    const items: LItem[] = its.map((i) => ({ code: i.itemCode, title: i.title, shelf: i.storageLocation, warehouse: i.location?.name }));
    return new Response(
      doc({ type: "PICKUP", state, name: profile?.name ?? "Bidder", phone: profile?.phone, email: profile?.email, headerRows: rows, count: its.length, countSuffix: " · all auctions", items }),
      { headers: htmlHeaders }
    );
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
    const pickupAt = preferredName ?? warehouses.join(", ") ?? "—";
    // A closed-auction order isn't on an appointment, so it's never "staged" here —
    // only gathered or not.
    const allGathered = its.length > 0 && its.every((i) => i.grabbedAt != null);
    const state: LabelState = allGathered ? "GATHERED" : "TO GATHER";
    const rows =
      `<div class="row"><span>Pick up at</span><b>${esc(pickupAt)}</b></div>` +
      `<div class="row"><span>Auction</span><b>${esc(auction.title)}</b></div>` +
      `<div class="row"><span>Closed</span><b>${esc(fmtDate(auction.endAt))}</b></div>`;
    const items: LItem[] = its.map((i) => ({ code: i.itemCode, title: i.title, shelf: i.storageLocation, warehouse: i.location?.name }));
    return new Response(
      doc({ type: "PICKUP", state, name: profile?.name ?? "Bidder", phone: profile?.phone, email: profile?.email, headerRows: rows, count: its.length, items }),
      { headers: htmlHeaders }
    );
  }

  return new Response("Unknown label type", { status: 400 });
}
