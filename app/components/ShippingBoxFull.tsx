"use client";
import { IcoTruck, IcoCheck } from "./BidIcons";
import {
  type Box, ACTIVE_BOX_STATUSES, IcoBox, ShipNowControls, Thumb, TrackingLine,
  fmtDate, headroomState, money, plural, statusPill,
} from "./YourBoxCard";

/**
 * The Shipping tab on the bidder dashboard: a one-line total, then one full
 * card per box. The full card is the compact "Your box" card with room to
 * breathe — the headroom line ("Room to add: about 4 Smalls or 1 Medium
 * before the price goes up"), a band progress bar, paid-so-far, the lots as
 * rows, closes-on, Ship it now and tracking.
 */

const long = (n: number) => `${n} ${n === 1 ? "lot" : "lots"}`;

/** "about 4 Smalls or 1 Medium" — the presets are alternatives, not a sum. */
function fitsSentence(fits: { label: string; count: number }[]): string {
  const parts = fits.map((f) => plural(f.label, f.count));
  if (parts.length === 1) return `about ${parts[0]}`;
  return `about ${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`;
}

function Headroom({ b }: { b: Box }) {
  const state = headroomState(b.headroom);
  const maxOz = b.weightOz + b.headroom.ozLeft;
  const pct = maxOz > 0 ? Math.min(100, Math.round((b.weightOz / maxOz) * 100)) : 0;
  const full = state.kind !== "room";
  return (
    <div className="mx-4 sm:mx-5 mb-3 rounded-xl bg-[#f4ede1] border border-[#e3d6bf] px-4 py-3">
      <div className="font-display text-lg sm:text-xl font-black leading-tight text-[#241a12]">
        {state.kind === "room"
          ? <>Room to add: {fitsSentence(state.fits)}</>
          : state.kind === "full"
          ? "Full for this price"
          : "Top band"}
      </div>
      <div className="text-[13px] text-[#6f5b46] mt-0.5">
        {state.kind === "room"
          ? <>before the price goes up <span className="font-bold text-[#241a12] tabular-nums">(+{money(state.stepCents)})</span></>
          : state.kind === "full"
          ? <>The next lot opens the next band <span className="font-bold text-[#241a12] tabular-nums">(+{money(state.stepCents)})</span>.</>
          : "The next lot that doesn't fit starts a new box."}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3 text-[13px] text-[#8a7559] tabular-nums">
        <span>{b.headroom.bandLabel} band</span>
        <span>{b.weightOz} oz of {maxOz} oz</span>
      </div>
      <div className="mt-1 h-2.5 rounded-full bg-white border border-[#e3d6bf] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={maxOz} aria-valuenow={b.weightOz} aria-label="Box weight in its price band">
        <div className={`h-full rounded-full transition-all ${full ? "bg-[#c47b3e]" : "bg-[#4a7c59]"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ShippingBoxFull({ box: b, reload }: { box: Box; reload: () => Promise<void> }) {
  const pill = statusPill(b);
  const open = b.status === "OPEN";
  const done = b.status === "DELIVERED" || !!b.deliveredAt;
  const dims = b.boxCode ? b.boxCode.replace(/x/g, "×") : null;
  const from = b.location?.name ?? null;
  const holding = b.status === "CLOSED";
  return (
    <section className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-black uppercase tracking-[0.14em] text-[#6c4d39]">
            <IcoBox className="w-4 h-4" /> {from ? `Ships from ${from}` : "Your box"}
          </div>
          <div className="font-display text-lg font-black text-[#241a12] mt-0.5 tabular-nums">
            {long(b.items.length)} · {b.weightLb} lb{dims ? ` · ${dims} box` : ""}
          </div>
          <div className="text-sm text-[#6f5b46] mt-0.5">
            to {b.shipCity}, {b.shipState}
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-[13px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${pill.cls}`}>
          {done ? <IcoCheck className="w-3.5 h-3.5" /> : <IcoTruck className="w-3.5 h-3.5" />}
          {pill.text}
        </span>
      </div>

      {/* Headroom — only while the box is still taking wins */}
      {open && <Headroom b={b} />}

      {/* Money */}
      <div className="px-4 sm:px-5 pb-3 text-sm text-[#241a12]">
        Paid so far <span className="font-extrabold tabular-nums">{money(b.chargedCents)}</span> for this box
        {b.tierCents > b.chargedCents && (
          <span className="text-[#8a7559]"> · this box&apos;s price is {money(b.tierCents)}</span>
        )}
      </div>

      {/* Lots */}
      <ul className="border-t border-[#efe3d0] divide-y divide-[#efe3d0]">
        {b.items.map((it) => (
          <li key={it.id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5">
            <Thumb url={it.photos[0]?.url ?? null} title={it.title} size="w-12 h-12" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[#241a12] truncate">{it.title}</div>
              {holding && (!it.paid || !it.atStation) && (
                <div className="text-[13px] text-[#8a4f1c]">{!it.paid ? "Waiting on payment" : `On its way to ${from ?? "the shipping station"}`}</div>
              )}
            </div>
            <div className={`shrink-0 text-sm tabular-nums ${it.shipChargeCents > 0 ? "font-bold text-[#241a12]" : "text-[#4a7c59] font-semibold"}`}>
              {it.shipChargeCents > 0 ? `+${money(it.shipChargeCents)}` : "rode free"}
            </div>
          </li>
        ))}
      </ul>

      {/* Footer */}
      <div className="border-t border-[#efe3d0] px-4 sm:px-5 py-3 space-y-2.5">
        {open && (
          <>
            <div className="text-[13px] text-[#8a7559]">
              Closes {fmtDate(b.closesAt)} · address locked for this box.
            </div>
            <ShipNowControls box={b} reload={reload} />
          </>
        )}
        {!open && b.trackingCode && <TrackingLine box={b} />}
        {!open && !b.trackingCode && (
          <div className="text-[13px] text-[#8a7559]">
            {b.status === "CLOSED" || b.status === "PACKING"
              ? `Closed ${b.closedAt ? fmtDate(b.closedAt) : fmtDate(b.closesAt)} · ships 3 to 5 business days after every lot is paid and at ${from ?? "the station"}.`
              : b.shippedAt
              ? `Shipped ${fmtDate(b.shippedAt)}`
              : `Closed ${fmtDate(b.closesAt)}`}
          </div>
        )}
      </div>
    </section>
  );
}

/** The whole tab: total strip, then one full card per box, or a one-line empty state. */
export function ShippingTab({ boxes, reload }: { boxes: Box[] | null; reload: () => Promise<void> }) {
  if (boxes === null) {
    return <div className="max-w-3xl h-24 rounded-2xl bg-white border border-[#e3d6bf] animate-pulse" aria-hidden="true" />;
  }
  if (boxes.length === 0) {
    return (
      <p className="max-w-3xl text-sm text-[#6f5b46] bg-white border border-[#e3d6bf] rounded-2xl px-5 py-4">
        No boxes yet. Lots with the Ships chip can ship — tap Ship on one before you bid.
      </p>
    );
  }
  const counted = boxes.filter((b) => b.status !== "CANCELLED");
  const total = counted.reduce((s, b) => s + b.chargedCents, 0);
  const inFlight = counted.filter((b) => ACTIVE_BOX_STATUSES.has(b.status)).length;
  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-2xl bg-[#6c4d39] text-[#f6ecda] px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[13px] font-black uppercase tracking-[0.14em] text-[#f0a35a]">
          <IcoTruck className="w-4 h-4" /> Shipping so far
        </div>
        <div className="font-display text-lg font-black tabular-nums">
          {money(total)} <span className="text-[#f6ecda]/80 font-sans text-sm font-semibold">across {counted.length} {counted.length === 1 ? "box" : "boxes"}{inFlight > 0 && inFlight !== counted.length ? ` · ${inFlight} on the go` : ""}</span>
        </div>
      </div>
      {boxes.map((b) => <ShippingBoxFull key={b.id} box={b} reload={reload} />)}
    </div>
  );
}
