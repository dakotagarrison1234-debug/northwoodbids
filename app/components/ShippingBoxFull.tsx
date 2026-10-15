"use client";
import { useState } from "react";
import Link from "next/link";
import { IcoBox, IcoCoin, IcoPlus, IcoTruck } from "./BidIcons";
import FillBar from "./FillBar";
import FreeBlocks from "./FreeBlocks";
import SizeBadge from "./SizeBadge";
import { type Box, closesIn, money, trackingLabel } from "./YourBoxCard";
import { sizeKeyOf } from "@/lib/shipping/sizes";
import { TIERS, headroom, headroomState } from "@/lib/shipping/tiers";

/**
 * The box, the way the buyer sees it — shared by /shipping and the dashboard's
 * Shipping tab:
 *
 *   BoxCard       — one OPEN box: paid / everything else free, the fill bar,
 *                   the free blocks, the lot tiles, Fill it + Ship it now.
 *   EmptyBoxCard  — no open box: a first box's free blocks + one line + Fill it.
 *   PastBoxRow    — a closed / packing / shipped / delivered box, one line.
 *   IconTiles     — Pay once · Fill it · Ships, the whole pitch in three tiles.
 *   ClosesPill    — "Closes in 4 days", ink on gold.
 *   ShippingTab   — the dashboard tab: the box card(s) + "See all shipping".
 */

/** Where "Fill it: lots that ship" goes: the home page's live grid. */
export const FILL_IT_HREF = "/#live-auctions";
export const FILL_IT_LABEL = "Fill it: lots that ship";

const lots = (n: number) => `${n} ${n === 1 ? "lot" : "lots"}`;
const zoneOf = (b: Box) => (b.zone >= 1 && b.zone <= 3 ? b.zone : 1) as 1 | 2 | 3;

const fmtShort = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric" });

/** Shipping settled so far: the deltas of the PAID lots (chargedCents also counts unpaid rows). */
const shippingPaid = (b: Box) =>
  b.items.some((it) => typeof it.paid === "boolean")
    ? b.items.reduce((s, it) => s + (it.paid ? it.shipChargeCents : 0), 0)
    : b.chargedCents;

const btnInk = "inline-flex items-center justify-center rounded-xl bg-[#241a12] hover:bg-[#3a2a1b] text-[#f0a35a] font-bold text-sm px-3 min-h-[44px] text-center transition-colors nb-focus";
const btnOutline = "inline-flex items-center justify-center rounded-xl border border-[#6c4d39] text-[#6c4d39] hover:bg-[#6c4d39] hover:text-white font-bold text-sm px-3 min-h-[44px] transition-colors disabled:opacity-50 nb-focus";

export function ClosesPill({ box, className = "" }: { box: Box; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full bg-[#241a12] text-[#f0a35a] text-[12px] font-bold px-3 py-1.5 whitespace-nowrap tabular-nums ${className}`}>
      {closesIn(box.closesAt)}
    </span>
  );
}

function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[11px] font-bold uppercase tracking-[0.12em] text-[#8a7559] ${className}`}>{children}</div>;
}

/** Ship-it-now: one outline button; tap → inline confirm under the button row. */
function ShipNow({ box, reload, confirming, setConfirming }: { box: Box; reload: () => Promise<void>; confirming: boolean; setConfirming: (v: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shipNow = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shipping/box/${box.id}/ship-now`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) { setError(d.error || "Couldn't close the box."); return; }
      setConfirming(false);
      await reload();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  if (!confirming) return null;
  return (
    <div className="rounded-xl bg-[#f6ecda] border border-[#6c4d39]/30 px-3.5 py-3">
      <p className="text-sm text-[#241a12] font-semibold">Close this box today?</p>
      <p className="text-[13px] text-[#6f5b46] mt-0.5">Wins after this start a new box. Ships 3 to 5 business days after every lot is paid.</p>
      {error && <p className="text-[13px] text-red-700 font-semibold mt-1.5">{error}</p>}
      <div className="flex gap-2 mt-2.5">
        <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="flex-1 rounded-xl border border-[#cdbda3] text-[#4a3a2b] font-bold text-sm py-2.5 min-h-[44px] hover:bg-white transition-colors disabled:opacity-50 nb-focus">
          Keep it open
        </button>
        <button type="button" onClick={shipNow} disabled={busy} className="flex-1 rounded-xl bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold text-sm py-2.5 min-h-[44px] transition-colors disabled:opacity-50 nb-focus">
          {busy ? "Closing…" : "Yes, ship it"}
        </button>
      </div>
    </div>
  );
}

/** One OPEN box. `header` puts the warehouse name + closes pill inside the card (two boxes, or the dashboard). */
export function BoxCard({ box: b, reload, header = false }: { box: Box; reload: () => Promise<void>; header?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const zone = zoneOf(b);
  const st = headroomState(b.headroom);
  const paid = shippingPaid(b);
  const allPaid = b.chargedCents === 0 || paid >= b.chargedCents;
  // Right stat: what the next lot costs. Free until the band is full; then the step up.
  const right =
    st.kind === "full"
      ? { eyebrow: "Next size", value: `+${money(st.stepCents)}`, cls: "text-[#c47b3e]" }
      : st.kind === "top-full"
      ? { eyebrow: "Next box", value: money(TIERS[0].cents[zone - 1]), cls: "text-[#c47b3e]" }
      : { eyebrow: "Everything else", value: "FREE", cls: "text-[#4a7c59]" };
  return (
    <section className="bg-white border border-[#e3d6bf] rounded-[18px] p-4 space-y-3">
      {header && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] font-semibold text-[#8a7559] truncate">{b.location?.name ?? "Your box"}</div>
          <ClosesPill box={b} />
        </div>
      )}

      {/* Paid · everything else */}
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <Eyebrow>{allPaid ? "Paid" : "Due"}</Eyebrow>
          <div className="font-display text-[30px] font-black leading-none text-[#241a12] tabular-nums mt-1">{money(b.chargedCents)}</div>
        </div>
        <div className="min-w-0 text-right">
          <Eyebrow>{right.eyebrow}</Eyebrow>
          <div className={`font-display text-[30px] font-black leading-none tabular-nums mt-1 ${right.cls}`}>{right.value}</div>
        </div>
      </div>

      <FillBar weightOz={b.weightOz} zone={zone} height={14} labels />

      <FreeBlocks fits={b.headroom.fits} size="large" />

      {/* Lots in the box + the empty slot */}
      <ul className="flex flex-wrap gap-2">
        {b.items.map((it) => {
          const url = it.photos[0]?.url ?? null;
          return (
            <li key={it.id} className="relative w-[52px] h-[52px] rounded-xl overflow-hidden border border-[#e3d6bf] bg-[#efe3d0] shrink-0" title={it.title}>
              {url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={it.title} className="w-full h-full object-cover" />
              )}
              {it.shipPreset && <SizeBadge size={sizeKeyOf(it.shipPreset)} px={20} className="absolute bottom-0.5 right-0.5" />}
            </li>
          );
        })}
        <li className="shrink-0">
          <Link
            href={FILL_IT_HREF}
            aria-label={FILL_IT_LABEL}
            className="w-[52px] h-[52px] rounded-xl border-2 border-dashed border-[#cdbda3] text-[#a3927b] hover:border-[#6c4d39] hover:text-[#6c4d39] flex items-center justify-center transition-colors nb-focus"
          >
            <IcoPlus className="w-5 h-5" />
          </Link>
        </li>
      </ul>

      {/* Actions */}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Link href={FILL_IT_HREF} className={btnInk}>{FILL_IT_LABEL}</Link>
        <button type="button" onClick={() => setConfirming(true)} disabled={confirming} className={btnOutline}>Ship it now</button>
      </div>
      <ShipNow box={b} reload={reload} confirming={confirming} setConfirming={setConfirming} />
    </section>
  );
}

/** No open box: what a first box holds, one line, and the way to fill it. */
export function EmptyBoxCard({ zone }: { zone: 1 | 2 | 3 }) {
  return (
    <section className="bg-white border border-[#e3d6bf] rounded-[18px] p-4 space-y-3">
      <FreeBlocks fits={headroom(1, zone).fits} size="large" />
      <p className="text-sm text-[#6f5b46]">Pick Ship on a lot and your first win opens a box.</p>
      <Link href={FILL_IT_HREF} className={`${btnInk} w-full`}>{FILL_IT_LABEL}</Link>
    </section>
  );
}

/** A box that's past taking wins: "Oct 9 box · 2 lots · $7.49" + where it is. */
export function PastBoxRow({ box: b }: { box: Box }) {
  const shipped = b.status === "SHIPPED" || b.status === "DELIVERED";
  const label = shipped ? trackingLabel(b) : "Packing";
  const done = label === "Delivered";
  const pill = done
    ? "bg-[#241a12] text-[#f6ecda]"
    : shipped
    ? "bg-[#6c4d39]/10 text-[#6c4d39]"
    : "bg-[#f0a35a]/18 text-[#8a4f1c]";
  const when = b.closedAt ?? b.closesAt;
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 text-sm text-[#241a12] tabular-nums">
        <span className="font-semibold">{fmtShort(when)} box</span>
        <span className="text-[#8a7559]"> · {lots(b.items.length)} · {money(b.chargedCents)}</span>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className={`inline-flex items-center rounded-full text-[12px] font-bold px-2.5 py-1 whitespace-nowrap ${pill}`}>{label}</span>
        {shipped && b.trackingUrl && (
          <a href={b.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold text-[#6c4d39] hover:text-[#c47b3e] underline underline-offset-2 nb-focus rounded">
            Track
          </a>
        )}
      </div>
    </li>
  );
}

/** Pay once · Fill it · Ships — the whole model in three tiles. */
export function IconTiles() {
  const tiles = [
    { Icon: IcoCoin, title: "Pay once", sub: "per box" },
    { Icon: IcoBox, title: "Fill it", sub: "free" },
    { Icon: IcoTruck, title: "Ships", sub: "in 7 days" },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {tiles.map(({ Icon, title, sub }) => (
        <div key={title} className="bg-white border border-[#e3d6bf] rounded-[18px] px-2 py-3 text-center">
          <Icon className="w-6 h-6 text-[#6c4d39] mx-auto" />
          <div className="text-[13px] font-bold text-[#241a12] mt-1.5">{title}</div>
          <div className="text-[12px] text-[#8a7559]">{sub}</div>
        </div>
      ))}
    </div>
  );
}

/** The dashboard's Shipping tab: the open box card(s), or the empty card, plus a link to /shipping. */
export function ShippingTab({ boxes, reload }: { boxes: Box[] | null; reload: () => Promise<void> }) {
  if (boxes === null) {
    return <div className="max-w-[560px] h-40 rounded-[18px] bg-white border border-[#e3d6bf] animate-pulse" aria-hidden="true" />;
  }
  const open = boxes.filter((b) => b.status === "OPEN");
  const zone = boxes[0] ? zoneOf(boxes[0]) : 1;
  return (
    <div className="max-w-[560px] space-y-3">
      {open.length === 0 ? <EmptyBoxCard zone={zone} /> : open.map((b) => <BoxCard key={b.id} box={b} reload={reload} header />)}
      <Link href="/shipping" className="inline-flex items-center min-h-[44px] text-sm font-semibold text-[#6c4d39] hover:text-[#563e2c] underline underline-offset-2 nb-focus rounded">
        See all shipping
      </Link>
    </div>
  );
}
