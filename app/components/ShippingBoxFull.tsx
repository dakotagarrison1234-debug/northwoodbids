"use client";
import Link from "next/link";
import { IcoTruck, IcoCheck, IcoBox } from "./BidIcons";
import BandMeter from "./BandMeter";
import {
  type Box, ACTIVE_BOX_STATUSES, ShipNowControls, Thumb, TrackingLine,
  closesIn, fmtDate, money, statusPill, trackingLabel,
} from "./YourBoxCard";
import { TIERS, bandIndex, headroomState, plural } from "@/lib/shipping/tiers";

/**
 * The full box cards, shared by /shipping and the dashboard's Shipping tab:
 *
 *   OpenBoxCard    — OPEN / CLOSED / PACKING: warehouse, countdown, lots, the
 *                    band meter with room-left lines, Ship it now.
 *   ShippedBoxCard — SHIPPED / DELIVERED: tracking, status, weight, box, paid.
 *   ShippingTab    — the dashboard's short version: open-box cards + a link.
 */

const lots = (n: number) => `${n} ${n === 1 ? "lot" : "lots"}`;

/** Shipping collected so far: the deltas of the PAID lots (chargedCents also counts unpaid rows). */
const shippingPaid = (b: Box) =>
  b.items.some((it) => typeof it.paid === "boolean")
    ? b.items.reduce((s, it) => s + (it.paid ? it.shipChargeCents : 0), 0)
    : b.chargedCents;

/** "about 3 Smalls or 1 Medium" — Small and Medium only; the presets are alternatives, not a sum. */
function fitsSentence(fits: { key: string; label: string; count: number }[]): string {
  const parts = fits.filter((f) => f.key !== "LARGE").map((f) => plural(f.label, f.count));
  if (parts.length === 0) parts.push(...fits.map((f) => plural(f.label, f.count)));
  if (parts.length === 1) return `about ${parts[0]}`;
  return `about ${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`;
}

/** The two short lines under the meter. */
function RoomLines({ b }: { b: Box }) {
  const st = headroomState(b.headroom);
  const i = bandIndex(Math.max(1, b.weightOz));
  const nextTop = TIERS[i + 1] ? `${TIERS[i + 1].maxOz / 16} lb` : null;
  if (st.kind === "room") {
    return (
      <>
        <p className="text-sm font-semibold text-[#2f5d3a]">Room: {fitsSentence(st.fits)} ride free</p>
        <p className="text-[13px] text-[#6f5b46]">Over that: <span className="font-bold text-[#241a12] tabular-nums">+{money(st.stepCents)}</span>{nextTop ? ` (up to ${nextTop})` : ""}</p>
      </>
    );
  }
  if (st.kind === "full") {
    return (
      <>
        <p className="text-sm font-semibold text-[#8a4f1c]">Full for this price</p>
        <p className="text-[13px] text-[#6f5b46]">Next lot: <span className="font-bold text-[#241a12] tabular-nums">+{money(st.stepCents)}</span>{nextTop ? ` (up to ${nextTop})` : ""}</p>
      </>
    );
  }
  if (st.kind === "top-room") {
    return (
      <>
        <p className="text-sm font-semibold text-[#2f5d3a]">Room: {fitsSentence(st.fits)} ride free</p>
        <p className="text-[13px] text-[#6f5b46]">Nothing more to pay up to 20 lb.</p>
      </>
    );
  }
  return <p className="text-sm font-semibold text-[#8a4f1c]">Full — the next lot starts a new box</p>;
}

export function OpenBoxCard({ box: b, reload }: { box: Box; reload: () => Promise<void> }) {
  const open = b.status === "OPEN";
  // The countdown is the card's title while open, so the pill just says Open.
  const pill = open ? { text: "Open", cls: "bg-[#4a7c59]/12 text-[#2f5d3a] border-[#4a7c59]/25" } : statusPill(b);
  const holding = b.status === "CLOSED";
  const from = b.location?.name ?? null;
  const zone = (b.zone >= 1 && b.zone <= 3 ? b.zone : 1) as 1 | 2 | 3;
  return (
    <section className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#6c4d39]">
            <IcoBox className="w-4 h-4" /> {from ?? "Your box"}
          </div>
          <div className="font-display text-lg font-black text-[#241a12] mt-0.5 tabular-nums">
            {open ? closesIn(b.closesAt) : `${lots(b.items.length)} · ${b.weightLb} lb`}
          </div>
          <div className="text-[13px] text-[#6f5b46] mt-0.5 tabular-nums">
            {open ? `${lots(b.items.length)} · ${b.weightLb} lb · ` : ""}to {b.shipCity}, {b.shipState}
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap shrink-0 ${pill.cls}`}>
          <IcoTruck className="w-3.5 h-3.5" /> {pill.text}
        </span>
      </div>

      {/* Lots */}
      <ul className="px-4 sm:px-5 pb-3 flex flex-wrap gap-2">
        {b.items.map((it) => {
          const hold = holding && (!it.paid || !it.atStation);
          return (
            <li key={it.id} className="flex items-center gap-2 bg-[#faf5ea] border border-[#e3d6bf] rounded-xl pl-1 pr-2.5 py-1 max-w-full">
              <Thumb url={it.photos[0]?.url ?? null} title={it.title} />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#241a12] truncate max-w-[200px]">{it.title}</div>
                <div className={`text-[11px] tabular-nums ${hold ? "text-[#8a4f1c]" : it.shipChargeCents > 0 ? "text-[#8a7559]" : "text-[#4a7c59] font-semibold"}`}>
                  {hold ? (!it.paid ? "Waiting on payment" : `On its way to ${from ?? "the warehouse"}`) : it.shipChargeCents > 0 ? `+${money(it.shipChargeCents)}` : "Free"}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Band meter — only while the box is still taking wins */}
      {open && (
        <div className="mx-4 sm:mx-5 mb-3 rounded-xl bg-[#f4ede1] border border-[#e3d6bf] px-4 pt-3 pb-3">
          <BandMeter weightOz={b.weightOz} zone={zone} />
          <div className="mt-2 space-y-0.5">
            <RoomLines b={b} />
          </div>
        </div>
      )}

      {/* Money */}
      <div className="px-4 sm:px-5 pb-3 text-sm text-[#241a12]">
        Shipping <span className="font-extrabold tabular-nums">{money(shippingPaid(b))}</span>
      </div>

      {/* Footer */}
      <div className="border-t border-[#efe3d0] px-4 sm:px-5 py-3 space-y-2">
        {open && <ShipNowControls box={b} reload={reload} />}
        {!open && (
          <p className="text-[13px] text-[#8a7559]">
            Closed {b.closedAt ? fmtDate(b.closedAt) : fmtDate(b.closesAt)}. Ships 3 to 5 business days after your box closes and every lot is paid.
          </p>
        )}
      </div>
    </section>
  );
}

export function ShippedBoxCard({ box: b }: { box: Box }) {
  const label = trackingLabel(b);
  const done = label === "Delivered";
  const dims = b.boxCode ? b.boxCode.replace(/x/g, "×") : null;
  const from = b.location?.name ?? null;
  const pill = statusPill(b);
  return (
    <section className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden">
      <div className="px-4 sm:px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#6c4d39]">
            <IcoBox className="w-4 h-4" /> {from ? `From ${from}` : "Your box"}
          </div>
          <div className="font-display text-lg font-black text-[#241a12] mt-0.5 tabular-nums">
            {done && b.deliveredAt ? `Delivered ${fmtDate(b.deliveredAt)}` : b.shippedAt ? `Shipped ${fmtDate(b.shippedAt)}` : "Shipped"}
          </div>
          <div className="text-[13px] text-[#6f5b46] mt-0.5 tabular-nums">
            {lots(b.items.length)} · {b.weightLb} lb{dims ? ` · ${dims} box` : ""} · to {b.shipCity}, {b.shipState}
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap shrink-0 ${pill.cls}`}>
          {done ? <IcoCheck className="w-3.5 h-3.5" /> : <IcoTruck className="w-3.5 h-3.5" />} {label}
        </span>
      </div>
      <ul className="px-4 sm:px-5 pb-3 flex flex-wrap gap-1.5">
        {b.items.map((it) => (
          <li key={it.id} className="flex items-center gap-1.5 bg-[#faf5ea] border border-[#e3d6bf] rounded-lg pl-0.5 pr-2 py-0.5 max-w-full">
            <Thumb url={it.photos[0]?.url ?? null} title={it.title} size="w-7 h-7" />
            <span className="text-[11px] font-semibold text-[#241a12] truncate max-w-[160px]">{it.title}</span>
          </li>
        ))}
      </ul>
      <div className="border-t border-[#efe3d0] px-4 sm:px-5 py-3 space-y-1.5">
        <div className="text-sm text-[#241a12]">Shipping <span className="font-extrabold tabular-nums">{money(shippingPaid(b))}</span></div>
        <TrackingLine box={b} />
      </div>
    </section>
  );
}

/**
 * The dashboard's Shipping tab: the open-box cards and a link to /shipping,
 * where the shipped boxes, every charge and the price table live.
 */
export function ShippingTab({ boxes, reload }: { boxes: Box[] | null; reload: () => Promise<void> }) {
  if (boxes === null) {
    return <div className="max-w-3xl h-24 rounded-2xl bg-white border border-[#e3d6bf] animate-pulse" aria-hidden="true" />;
  }
  const open = boxes.filter((b) => b.status === "OPEN" || b.status === "CLOSED" || b.status === "PACKING");
  const onTheWay = boxes.filter((b) => b.status === "SHIPPED").length;
  const link = (
    <Link href="/shipping" className="inline-flex items-center gap-1.5 rounded-xl border border-[#6c4d39] text-[#6c4d39] hover:bg-[#6c4d39] hover:text-white font-bold text-sm px-4 py-2.5 min-h-[44px] transition-colors nb-focus">
      <IcoTruck className="w-4 h-4" /> See all shipping
    </Link>
  );
  if (open.length === 0) {
    const any = boxes.some((b) => ACTIVE_BOX_STATUSES.has(b.status) || b.status === "DELIVERED");
    return (
      <div className="max-w-3xl bg-white border border-[#e3d6bf] rounded-2xl px-5 py-5 space-y-3">
        <p className="text-sm text-[#6f5b46]">
          {onTheWay > 0
            ? `${onTheWay} ${onTheWay === 1 ? "box is" : "boxes are"} on the way. No box is open right now.`
            : any
            ? "No box is open right now. Your next shipped win opens one."
            : "No boxes yet. Pick Ship on a lot that can ship and your first win opens a box."}
        </p>
        {link}
      </div>
    );
  }
  return (
    <div className="max-w-3xl space-y-4">
      {open.map((b) => <OpenBoxCard key={b.id} box={b} reload={reload} />)}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[13px] text-[#8a7559]">{onTheWay > 0 ? `${onTheWay} ${onTheWay === 1 ? "box" : "boxes"} on the way. ` : ""}Charges, tracking and the price table are on the Shipping page.</p>
        {link}
      </div>
    </div>
  );
}
