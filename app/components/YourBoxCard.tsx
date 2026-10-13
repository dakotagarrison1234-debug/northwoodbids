"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IcoTruck, IcoCheck } from "./BidIcons";
import { PRESETS, FILL_OZ, fmtCents } from "@/lib/shipping/tiers";

// Mirrors GET /api/shipping/box (bundleSummaryFor), dates as ISO strings.
export type BoxHeadroom = {
  ozLeft: number;
  bandLabel: string;
  nextCents: number | null;
  stepCents: number;
  fits: { key: "SMALL" | "MEDIUM" | "LARGE"; label: string; count: number }[];
};

export type Box = {
  id: string;
  status: "OPEN" | "CLOSED" | "PACKING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
  openedAt: string;
  closesAt: string;
  closedAt: string | null;
  weightOz: number;
  weightLb: number;
  boxCode: string | null;
  chargedCents: number;
  tierCents: number;
  zone: number;
  carrier: string | null;
  service: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  lastTrackingStatus: string | null;
  shipCity: string;
  shipState: string;
  /** The warehouse this box ships from — one open box per warehouse. */
  location: { name: string } | null;
  /** How much more fits before the price moves up a band. */
  headroom: BoxHeadroom;
  items: { id: string; title: string; shipChargeCents: number; paid: boolean; atStation: boolean; photos: { url: string }[] }[];
};

export const money = (c: number) => fmtCents(c);
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Detroit", weekday: "short", month: "short", day: "numeric" });

/** Boxes that still count as "in flight" for the Shipping tab badge. */
export const ACTIVE_BOX_STATUSES: ReadonlySet<Box["status"]> = new Set(["OPEN", "CLOSED", "PACKING", "SHIPPED"]);

/** One fetch of the buyer's boxes, shared by the Overview card and the Shipping tab. */
export function useShippingBoxes(): { boxes: Box[] | null; reload: () => Promise<void> } {
  const [boxes, setBoxes] = useState<Box[] | null>(null);
  const reload = useCallback(() => {
    return fetch("/api/shipping/box")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && Array.isArray(d.boxes)) setBoxes(d.boxes); })
      .catch(() => {});
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { boxes, reload };
}

export function IcoBox({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" /><path d="M3 7l9 5 9-5M12 12v10" />
    </svg>
  );
}

export function Thumb({ url, title, size = "w-10 h-10" }: { url: string | null; title: string; size?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={title} className={`${size} rounded-lg object-cover shrink-0 border border-[#e3d6bf] bg-white`} />
  ) : (
    <div className={`${size} bg-[#efe3d0] rounded-lg border border-[#e3d6bf] shrink-0`} />
  );
}

export function statusPill(b: Box): { text: string; cls: string } {
  if (b.status === "OPEN") return { text: `Open until ${fmtDate(b.closesAt)}`, cls: "bg-[#4a7c59]/12 text-[#2f5d3a] border-[#4a7c59]/25" };
  if (b.status === "CLOSED") {
    // What's holding the box: an unpaid lot, or one still on its way to the warehouse.
    if (b.items.some((it) => !it.paid)) return { text: "Waiting on payment", cls: "bg-red-50 text-red-700 border-red-300" };
    if (b.items.some((it) => !it.atStation)) return { text: "Waiting on a transfer", cls: "bg-[#f0a35a]/18 text-[#8a4f1c] border-[#c47b3e]/30" };
  }
  if (b.status === "CLOSED" || b.status === "PACKING") return { text: "Closed — packing", cls: "bg-[#f0a35a]/18 text-[#8a4f1c] border-[#c47b3e]/30" };
  if (b.status === "SHIPPED") return { text: b.deliveredAt ? "Delivered" : "Shipped", cls: "bg-[#6c4d39]/10 text-[#6c4d39] border-[#6c4d39]/25" };
  if (b.status === "DELIVERED") return { text: "Delivered", cls: "bg-[#241a12] text-[#f6ecda] border-[#241a12]" };
  return { text: b.status.toLowerCase(), cls: "bg-[#f1e7d5] text-[#6f5b46] border-[#e3d6bf]" };
}

/** "4 Smalls", "1 Medium", "2 Larges". */
export const plural = (label: string, n: number) => `${n} ${label}${n === 1 ? "" : "s"}`;

/** The smallest thing that can still join a box: a Small plus its fill. */
const SMALLEST_ADD_OZ = PRESETS.SMALL.weightOz + FILL_OZ;

/**
 * What an OPEN box can still take before the price moves. Three shapes:
 * room (with a list of what fits), full (next lot bumps the band), top band
 * (the next lot that doesn't fit starts a new box).
 */
export function headroomState(h: BoxHeadroom): { kind: "room"; fits: { label: string; count: number }[]; stepCents: number } | { kind: "full"; stepCents: number } | { kind: "top" } {
  if (h.nextCents === null) return { kind: "top" };
  if (h.ozLeft < SMALLEST_ADD_OZ || !h.fits.some((f) => f.count > 0)) return { kind: "full", stepCents: h.stepCents };
  return { kind: "room", fits: h.fits.filter((f) => f.count > 0), stepCents: h.stepCents };
}

/**
 * Ship-it-now with its inline confirm, shared by the compact card and the full
 * Shipping-tab card. Only rendered for OPEN boxes.
 */
export function ShipNowControls({ box, reload, compact = false }: { box: Box; reload: () => Promise<void>; compact?: boolean }) {
  const [confirming, setConfirming] = useState(false);
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

  if (!confirming) {
    return (
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className={`${compact ? "text-xs" : "text-[13px]"} text-[#8a7559] leading-snug min-w-0`}>
          Keep winning until {fmtDate(box.closesAt)} and new lots ride in this box. Or send it today.
        </p>
        <button
          onClick={() => { setConfirming(true); setError(null); }}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-[#6c4d39] text-[#6c4d39] hover:bg-[#6c4d39] hover:text-white font-bold text-sm px-4 py-2 transition-colors"
        >
          <IcoTruck className="w-4 h-4" /> Ship it now
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-[#f6ecda] border border-[#6c4d39]/30 px-3.5 py-3">
      <p className="text-sm text-[#241a12] font-semibold">Close this box today?</p>
      <p className={`${compact ? "text-xs" : "text-[13px]"} text-[#6f5b46] mt-0.5`}>New wins after this start a new box. Ships in 3 to 5 business days.</p>
      {error && <p className={`${compact ? "text-xs" : "text-[13px]"} text-red-700 font-semibold mt-1.5`}>{error}</p>}
      <div className="flex gap-2 mt-2.5">
        <button
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="flex-1 rounded-xl border border-[#cdbda3] text-[#4a3a2b] font-bold text-sm py-2 hover:bg-white transition-colors disabled:opacity-50"
        >
          Keep it open
        </button>
        <button
          onClick={shipNow}
          disabled={busy}
          className="flex-1 rounded-xl bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold text-sm py-2 transition-colors disabled:opacity-50"
        >
          {busy ? "Closing…" : "Yes, ship it"}
        </button>
      </div>
    </div>
  );
}

/** Carrier + tracking number + last scan, with a Track link when we have one. */
export function TrackingLine({ box }: { box: Box }) {
  if (!box.trackingCode) return null;
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
      <span className="text-[#6f5b46] min-w-0 truncate">
        {box.carrier ? `${box.carrier} ` : ""}<span className="tabular-nums text-[#241a12] font-semibold">{box.trackingCode}</span>
        {box.lastTrackingStatus ? <span className="text-[#8a7559]"> · {box.lastTrackingStatus.replace(/_/g, " ").toLowerCase()}</span> : null}
      </span>
      {box.trackingUrl && (
        <a href={box.trackingUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 font-bold text-[#6c4d39] hover:text-[#c47b3e] underline underline-offset-2">
          Track package
        </a>
      )}
    </div>
  );
}

/**
 * "Your box" — one compact card per shipping bundle on the bidder overview.
 * Shows what's in it, what it weighs, what's been paid, where it ships from,
 * and (while OPEN) a Ship-it-now button with an inline confirm. A buyer with
 * lots at both warehouses has two open boxes (one per warehouse) — both show.
 * Renders nothing when there's no box. The page owns the fetch
 * (useShippingBoxes) so the Overview card and the Shipping tab share one copy.
 */
export default function YourBoxCard({ boxes, reload }: { boxes: Box[] | null; reload: () => Promise<void> }) {
  if (!boxes || boxes.length === 0) return null;

  return (
    <div className="space-y-3">
      {boxes.map((b) => {
        const pill = statusPill(b);
        const open = b.status === "OPEN";
        const dims = b.boxCode ? b.boxCode.replace(/x/g, "×") : null;
        const from = b.location?.name ?? null;
        const room = open ? headroomState(b.headroom) : null;
        return (
          <section key={b.id} className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-4 sm:px-5 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#6c4d39]">
                  <IcoBox className="w-3.5 h-3.5" /> Your box{from ? ` · ${from}` : ""}
                </div>
                <div className="text-sm text-[#6f5b46] mt-1 tabular-nums">
                  {b.items.length} lot{b.items.length !== 1 ? "s" : ""} · {b.weightLb} lb{dims ? ` · box ${dims}` : ""}
                </div>
                <div className="text-sm text-[#241a12] mt-0.5">
                  Shipping <span className="font-extrabold tabular-nums">{money(b.chargedCents)}</span>
                  <span className="text-[#8a7559]"> · to {b.shipCity}, {b.shipState}</span>
                  {from && <span className="text-[#8a7559]"> · ships from {from}</span>}
                </div>
                {room && (
                  <div className="text-[13px] text-[#2f5d3a] font-semibold mt-0.5">
                    {room.kind === "room"
                      ? `Room for about ${room.fits[0].count} more ${room.fits[0].label}${room.fits[0].count === 1 ? "" : "s"} before the price goes up`
                      : room.kind === "full"
                      ? `Full — the next lot opens the next band (+${money(room.stepCents)})`
                      : "Top band — the next lot starts a new box"}
                  </div>
                )}
                {open && (
                  <div className="text-[11px] text-[#8a7559] mt-0.5">
                    Address locked for this box — change it for your next box in{" "}
                    <Link href="/account" className="underline underline-offset-2 hover:text-[#6c4d39]">Account</Link>.
                  </div>
                )}
              </div>
              <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${pill.cls}`}>
                {b.status === "DELIVERED" || b.deliveredAt ? <IcoCheck className="w-3 h-3" /> : <IcoTruck className="w-3 h-3" />}
                {pill.text}
              </span>
            </div>

            {/* Lots */}
            <ul className="px-4 sm:px-5 pb-3 flex flex-wrap gap-2">
              {b.items.map((it) => (
                <li key={it.id} className="flex items-center gap-2 bg-[#faf5ea] border border-[#e3d6bf] rounded-xl pl-1 pr-2.5 py-1 max-w-full">
                  <Thumb url={it.photos[0]?.url ?? null} title={it.title} />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#241a12] truncate max-w-[180px]">{it.title}</div>
                    <div className="text-[11px] text-[#8a7559] tabular-nums">{it.shipChargeCents > 0 ? `+${money(it.shipChargeCents)}` : "rode free"}</div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Footer: ship-now (OPEN) / tracking (SHIPPED) */}
            {(open || b.trackingCode) && (
              <div className="border-t border-[#efe3d0] px-4 sm:px-5 py-3">
                {open && <ShipNowControls box={b} reload={reload} compact />}
                {!open && <TrackingLine box={b} />}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
