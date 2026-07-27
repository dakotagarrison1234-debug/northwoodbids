export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";
import AutoPrint from "../AutoPrint";

const SOLD_STATUSES = ["SOLD", "PENDING_PICKUP", "PICKED_UP"] as const;

const fmtDate = (d: Date | null | undefined) =>
  d ? d.toLocaleString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric", year: "numeric" }) : "";
const fmtDateTime = (d: Date | null | undefined) =>
  d ? d.toLocaleString("en-US", { timeZone: "America/Detroit", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

interface Props {
  searchParams: Promise<{ type?: string; auction?: string; user?: string; transfer?: string }>;
}

// Shared print styles — @page pins the sheet to 4x6 so a thermal printer lays it
// out edge to edge; the wrapper hides everything on screen except the label.
function PrintStyles() {
  return (
    <style>{`
      @page { size: 4in 6in; margin: 0; }
      html, body { margin: 0; padding: 0; background: #fff; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .sheet { display: flex; justify-content: center; padding: 16px; }
      .label {
        width: 4in; height: 6in; box-sizing: border-box; padding: 0.22in 0.24in;
        background: #fff; color: #000; font-family: ui-sans-serif, system-ui, Arial, sans-serif;
        display: flex; flex-direction: column; overflow: hidden;
        border: 1px solid #000;
      }
      @media print {
        .no-print { display: none !important; }
        .sheet { padding: 0; }
        .label { border: none; }
      }
      .lbl-kind { font-size: 13px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; }
      .lbl-brand { font-size: 12px; font-weight: 700; }
      .lbl-big { font-size: 30px; font-weight: 900; line-height: 1.05; margin-top: 4px; word-break: break-word; }
      .lbl-sub { font-size: 16px; font-weight: 700; margin-top: 2px; }
      .lbl-rule { border-top: 2px solid #000; margin: 8px 0; }
      .lbl-row { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; margin-top: 2px; }
      .lbl-row b { font-weight: 800; }
      .lbl-items { margin-top: 6px; overflow: hidden; flex: 1; }
      .lbl-items li { font-size: 13px; line-height: 1.35; list-style: none; padding: 1px 0; border-bottom: 1px dotted #999; }
      .lbl-count { font-size: 15px; font-weight: 900; }
    `}</style>
  );
}

export default async function LabelPage({ searchParams }: Props) {
  const sp = await searchParams;
  const membership = await getUserOrg();
  if (!membership) {
    return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Not authorized.</div>;
  }
  const orgId = membership.organization.id;

  // ── TRANSFER LABEL ──────────────────────────────────────────────────────────
  if (sp.type === "transfer" && sp.transfer) {
    const t = await prisma.transferRequest.findUnique({
      where: { id: sp.transfer },
      include: {
        toLocation: { select: { name: true } },
        items: {
          select: {
            title: true,
            storageLocation: true,
            location: { select: { name: true } },
            auction: { select: { title: true } },
          },
        },
      },
    });
    if (!t || t.organizationId !== orgId) {
      return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Transfer not found.</div>;
    }
    const profile = await prisma.bidderProfile.findUnique({
      where: { clerkUserId: t.clerkUserId },
      select: { name: true, phone: true },
    });
    const fromLocations = [...new Set(t.items.map((i) => i.location?.name).filter(Boolean))] as string[];
    const auctions = [...new Set(t.items.map((i) => i.auction?.title).filter(Boolean))] as string[];

    return (
      <>
        <PrintStyles />
        <div className="sheet">
          <div className="label">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="lbl-brand">NORTHWOOD BIDS</span>
              <span className="lbl-kind">Transfer</span>
            </div>
            <div className="lbl-big">→ {t.toLocation?.name ?? "Destination"}</div>
            <div className="lbl-sub">For: {profile?.name ?? "Bidder"}</div>
            {profile?.phone && <div style={{ fontSize: 13 }}>{profile.phone}</div>}
            <div className="lbl-rule" />
            <div className="lbl-row"><span>From</span><b>{fromLocations.join(", ") || "—"}</b></div>
            <div className="lbl-row"><span>Requested</span><b>{fmtDate(t.createdAt)}</b></div>
            <div className="lbl-row"><span>Auction{auctions.length !== 1 ? "s" : ""}</span><b style={{ textAlign: "right" }}>{auctions.join(", ") || "—"}</b></div>
            <div className="lbl-rule" />
            <div className="lbl-count">{t.items.length} item{t.items.length !== 1 ? "s" : ""}</div>
            <ul className="lbl-items">
              {t.items.map((i, idx) => (
                <li key={idx}>• {i.title}{i.storageLocation ? ` (${i.storageLocation})` : ""}</li>
              ))}
            </ul>
          </div>
        </div>
        <AutoPrint />
      </>
    );
  }

  // ── PICKUP / ORDER LABEL ────────────────────────────────────────────────────
  if (sp.type === "pickup" && sp.auction && sp.user) {
    const auction = await prisma.auction.findFirst({
      where: { id: sp.auction, organizationId: orgId },
      select: { title: true, endAt: true },
    });
    if (!auction) {
      return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Auction not found.</div>;
    }
    // The customer's won items in this auction.
    const wonBids = await prisma.bid.findMany({
      where: { clerkUserId: sp.user, status: "WON", item: { auctionId: sp.auction, status: { in: [...SOLD_STATUSES] } } },
      select: { item: { select: { title: true, storageLocation: true, location: { select: { name: true } } } } },
    });
    const items = wonBids.map((b) => b.item).filter(Boolean);
    const profile = await prisma.bidderProfile.findUnique({
      where: { clerkUserId: sp.user },
      select: { name: true, phone: true, preferredPickupLocationId: true },
    });
    let preferredName: string | null = null;
    if (profile?.preferredPickupLocationId) {
      const loc = await prisma.pickupLocation.findUnique({
        where: { id: profile.preferredPickupLocationId },
        select: { name: true },
      });
      preferredName = loc?.name ?? null;
    }
    const appt = await prisma.pickupAppointment.findFirst({
      where: { clerkUserId: sp.user, organizationId: orgId, status: "SCHEDULED" },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true, location: { select: { name: true } }, stagedSpot: true },
    });
    const warehouses = [...new Set(items.map((i) => i.location?.name).filter(Boolean))] as string[];
    const pickupAt = appt?.location?.name ?? preferredName ?? warehouses.join(", ") ?? "—";

    return (
      <>
        <PrintStyles />
        <div className="sheet">
          <div className="label">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="lbl-brand">NORTHWOOD BIDS</span>
              <span className="lbl-kind">Pickup</span>
            </div>
            <div className="lbl-big">{profile?.name ?? "Bidder"}</div>
            {profile?.phone && <div className="lbl-sub">{profile.phone}</div>}
            <div className="lbl-rule" />
            <div className="lbl-row"><span>Pick up at</span><b style={{ textAlign: "right" }}>{pickupAt}</b></div>
            <div className="lbl-row"><span>Appointment</span><b>{appt ? fmtDateTime(appt.startsAt) : "Not booked yet"}</b></div>
            {appt?.stagedSpot && <div className="lbl-row"><span>Staged</span><b>{appt.stagedSpot}</b></div>}
            <div className="lbl-row"><span>Auction</span><b style={{ textAlign: "right" }}>{auction.title}</b></div>
            <div className="lbl-row"><span>Closed</span><b>{fmtDate(auction.endAt)}</b></div>
            <div className="lbl-rule" />
            <div className="lbl-count">{items.length} item{items.length !== 1 ? "s" : ""}</div>
            <ul className="lbl-items">
              {items.map((i, idx) => (
                <li key={idx}>• {i.title}{i.storageLocation ? ` (${i.storageLocation})` : ""}</li>
              ))}
            </ul>
          </div>
        </div>
        <AutoPrint />
      </>
    );
  }

  return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Nothing to print — missing label details.</div>;
}
