"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IcoTruck, IcoCheck, IcoBox } from "./BidIcons";
import FreeBlocks from "./FreeBlocks";
import { fmtCents, headroomState, roomLine, type Headroom, type ShipPresetKey } from "@/lib/shipping/tiers";

// Mirrors GET /api/shipping/box (bundleSummaryFor), dates as ISO strings.
export type BoxHeadroom = Headroom;

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
  items: { id: string; title: string; shipChargeCents: number; shipPreset: ShipPresetKey | null; paid: boolean; atStation: boolean; photos: { url: string }[] }[];
};

export const money = (c: number) => fmtCents(c);
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Detroit", weekday: "short", month: "short", day: "numeric" });

/** Calendar days from today to `iso`, both read in Detroit time. */
function daysUntil(iso: string): number {
  const key = (d: Date) => {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
    return Date.UTC(g("year"), g("month") - 1, g("day"));
  };
  return Math.round((key(new Date(iso)) - key(new Date())) / 86_400_000);
}

/** "Closes today" / "Closes tomorrow" / "Closes in 3 days" / "Closing now". */
export function closesIn(iso: string): string {
  if (new Date(iso).getTime() <= Date.now()) return "Closing now";
  const d = daysUntil(iso);
  if (d <= 0) return "Closes today";
  if (d === 1) return "Closes tomorrow";
  return `Closes in ${d} days`;
}

/** Boxes that still count as "in flight" for the Shipping tab badge. */
export const ACTIVE_BOX_STATUSES: ReadonlySet<Box["status"]> = new Set(["OPEN", "CLOSED", "PACKING", "SHIPPED"]);

/**
 * One fetch of the buyer's boxes, shared by the Overview card, the Shipping tab
 * and /shipping. `enabled: false` (signed out / Clerk not loaded yet) skips the
 * fetch so a public visit never fires a 401.
 */
export function useShippingBoxes(all = false, enabled = true): { boxes: Box[] | null; reload: () => Promise<void> } {
  const [boxes, setBoxes] = useState<Box[] | null>(null);
  const reload = useCallback(() => {
    if (!enabled) return Promise.resolve();
    return fetch(all ? "/api/shipping/box?all=1" : "/api/shipping/box")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && Array.isArray(d.boxes)) setBoxes(d.boxes); })
      .catch(() => {});
  }, [all, enabled]);
  useEffect(() => { reload(); }, [reload]);
  return { boxes, reload };
}

export function Thumb({ url, title, size = "w-10 h-10" }: { url: string | null; title: string; size?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={title} className={`${size} rounded-lg object-cover shrink-0 border border-[#e3d6bf] bg-white`} />
  ) : (
    <div className={`${size} bg-[#efe3d0] rounded-lg border border-[#e3d6bf] shrink-0`} />
  );
}

/** Shipped / Out for delivery / Delivered, from the carrier's last scan. */
export function trackingLabel(b: Box): "Shipped" | "Out for delivery" | "Delivered" {
  if (b.status === "DELIVERED" || b.deliveredAt || b.lastTrackingStatus === "delivered") return "Delivered";
  if (b.lastTrackingStatus === "out_for_delivery") return "Out for delivery";
  return "Shipped";
}

export function statusPill(b: Box): { text: string; cls: string } {
  const moss = "bg-[#4a7c59]/12 text-[#2f5d3a] border-[#4a7c59]/25";
  const amber = "bg-[#f0a35a]/18 text-[#8a4f1c] border-[#c47b3e]/30";
  if (b.status === "OPEN") return { text: closesIn(b.closesAt), cls: moss };
  if (b.status === "CLOSED") {
    // What's holding the box: an unpaid lot, or one still on its way to the warehouse.
    if (b.items.some((it) => !it.paid)) return { text: "Waiting on payment", cls: "bg-red-50 text-red-700 border-red-300" };
    if (b.items.some((it) => !it.atStation)) return { text: "Waiting on a transfer", cls: amber };
  }
  if (b.status === "CLOSED" || b.status === "PACKING") return { text: "Packing", cls: amber };
  if (b.status === "SHIPPED" || b.status === "DELIVERED") {
    const t = trackingLabel(b);
    return { text: t, cls: t === "Delivered" ? "bg-[#241a12] text-[#f6ecda] border-[#241a12]" : "bg-[#6c4d39]/10 text-[#6c4d39] border-[#6c4d39]/25" };
  }
  return { text: b.status.toLowerCase(), cls: "bg-[#f1e7d5] text-[#6f5b46] border-[#e3d6bf]" };
}

/**
 * Ship-it-now with its inline confirm, shared by the compact card and the full
 * box card. Only rendered for OPEN boxes.
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
          Open until {fmtDate(box.closesAt)}. Win more and it rides in this box.
        </p>
        <button
          onClick={() => { setConfirming(true); setError(null); }}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-[#6c4d39] text-[#6c4d39] hover:bg-[#6c4d39] hover:text-white font-bold text-sm px-4 py-2 min-h-[44px] transition-colors nb-focus"
        >
          <IcoTruck className="w-4 h-4" /> Ship it now
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-[#f6ecda] border border-[#6c4d39]/30 px-3.5 py-3">
      <p className="text-sm text-[#241a12] font-semibold">Close this box today?</p>
      <p className={`${compact ? "text-xs" : "text-[13px]"} text-[#6f5b46] mt-0.5`}>Wins after this start a new box. Ships 3 to 5 business days after your box closes and every lot is paid.</p>
      {error && <p className={`${compact ? "text-xs" : "text-[13px]"} text-red-700 font-semibold mt-1.5`}>{error}</p>}
      <div className="flex gap-2 mt-2.5">
        <button
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="flex-1 rounded-xl border border-[#cdbda3] text-[#4a3a2b] font-bold text-sm py-2.5 min-h-[44px] hover:bg-white transition-colors disabled:opacity-50 nb-focus"
        >
          Keep it open
        </button>
        <button
          onClick={shipNow}
          disabled={busy}
          className="flex-1 rounded-xl bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold text-sm py-2.5 min-h-[44px] transition-colors disabled:opacity-50 nb-focus"
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
      </span>
      {box.trackingUrl && (
        <a href={box.trackingUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 font-bold text-[#6c4d39] hover:text-[#c47b3e] underline underline-offset-2 nb-focus rounded">
          Track package
        </a>
      )}
    </div>
  );
}

/** The one-line room summary for an open box (Overview card + item page share the shape). */
export function roomSummary(h: BoxHeadroom): { text: string; tone: "moss" | "amber" } {
  const st = headroomState(h);
  if (st.kind === "room" || st.kind === "top-room") return { text: roomLine(st.fits) ?? "Room for more", tone: "moss" };
  if (st.kind === "full") return { text: `Next lot: +${money(st.stepCents)}`, tone: "amber" };
  return { text: "Full — the next lot starts a new box", tone: "amber" };
}

/**
 * "Your box" — one compact card per shipping bundle on the bidder overview.
 * What's in it, what it weighs, what's been paid, where it ships from, how much
 * more rides free, and (while OPEN) Ship it now. A buyer with lots at both
 * warehouses has two open boxes (one per warehouse) — both show. Renders
 * nothing when there's no box. The page owns the fetch (useShippingBoxes).
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
        const st = open ? headroomState(b.headroom) : null;
        const step = st && st.kind === "full" ? { key: "SMALL" as const, cents: st.stepCents } : null;
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
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${pill.cls}`}>
                {pill.text === "Delivered" ? <IcoCheck className="w-3 h-3" /> : <IcoTruck className="w-3 h-3" />}
                {pill.text}
              </span>
            </div>

            {/* Room left — the same three blocks as the Shipping page */}
            {open && (
              <div className="px-4 sm:px-5 pb-3">
                <FreeBlocks fits={b.headroom.fits} size="compact" step={step} />
              </div>
            )}

            {/* Lots */}
            <ul className="px-4 sm:px-5 pb-3 flex flex-wrap gap-2">
              {b.items.map((it) => (
                <li key={it.id} className="flex items-center gap-2 bg-[#faf5ea] border border-[#e3d6bf] rounded-xl pl-1 pr-2.5 py-1 max-w-full">
                  <Thumb url={it.photos[0]?.url ?? null} title={it.title} />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#241a12] truncate max-w-[180px]">{it.title}</div>
                    <div className={`text-[11px] tabular-nums ${it.shipChargeCents > 0 ? "text-[#8a7559]" : "text-[#4a7c59] font-semibold"}`}>{it.shipChargeCents > 0 ? `+${money(it.shipChargeCents)}` : "Free"}</div>
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
      <Link href="/shipping" className="inline-flex items-center min-h-[44px] text-xs font-semibold text-[#8a7559] hover:text-[#6c4d39] underline underline-offset-2 nb-focus rounded">
        See all shipping
      </Link>
    </div>
  );
}
