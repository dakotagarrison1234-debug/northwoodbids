"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { IcoTruck, IcoCheck } from "./BidIcons";

// Mirrors the shape of /api/pickup (only the fields this card needs).
type ItemCard = { id: string; title: string; photo: string | null; locationName?: string | null };
type PendingTransfer = {
  id: string;
  status: "REQUESTED" | "LOADED";
  toLocationName: string;
  items: { id: string; title: string; fromLocationName: string }[];
};
type Appointment = {
  id: string;
  startsAt: string;
  location: { name: string };
  items: ItemCard[];
};
type PickupData = {
  appointment: Appointment | null;
  unscheduledItems: ItemCard[];
  pendingTransfers: PendingTransfer[];
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Detroit",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function IcoCrate() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" /><path d="M3 7l9 5 9-5M12 12v10" />
    </svg>
  );
}
function IcoArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function IcoCalendar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function Thumb({ url, title }: { url: string | null; title: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={title} className="w-11 h-11 rounded-lg object-cover shrink-0 border border-[#e3d6bf]" />
  ) : (
    <div className="w-11 h-11 bg-[#efe3d0] rounded-lg border border-[#e3d6bf] shrink-0" />
  );
}

/**
 * Compact pickup summary for the bidder overview. Three honest states, each
 * with its own colour: booked (moss), ready to book (leather), moving between
 * warehouses (amber). Renders nothing when there is nothing to say.
 */
export default function PickupStatusCard() {
  const [data, setData] = useState<PickupData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/pickup")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: PickupData) => setData(d))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || !data) return null;

  const { appointment, unscheduledItems, pendingTransfers } = data;

  const inTransitIds = new Set(pendingTransfers.flatMap((t) => t.items.map((i) => i.id)));
  const ready = unscheduledItems.filter((it) => !inTransitIds.has(it.id));
  const transferItemCount = pendingTransfers.reduce((s, t) => s + t.items.length, 0);

  // Nothing pickup-related to show.
  if (!appointment && ready.length === 0 && transferItemCount === 0) return null;

  const headline = appointment
    ? "Pickup booked"
    : ready.length > 0
    ? `Ready at ${ready[0]?.locationName ?? "the warehouse"}`
    : "On the truck";

  return (
    <div className="relative bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden">
      <span className="absolute left-0 top-4 bottom-4 w-1.5 rounded-full bg-[#c47b3e]" aria-hidden />
      <div className="pl-6 pr-4 sm:pr-5 py-4 space-y-4">
        {/* Header line summarizing state */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#a85f28]">
              <IcoCrate /> Pickup
            </div>
            <h2 className="font-display text-xl font-black text-[#241a12] leading-tight mt-0.5 truncate">{headline}</h2>
          </div>
          <Link
            href="/pickup"
            className="shrink-0 inline-flex items-center gap-1.5 text-sm font-bold text-[#6c4d39] hover:text-[#563e2c] transition-colors"
          >
            Manage <IcoArrow />
          </Link>
        </div>

        {/* Scheduled appointment */}
        {appointment && (
          <div className="rounded-xl bg-[#4a7c59]/8 border border-[#4a7c59]/25 px-4 py-3">
            <div className="flex items-center gap-2 text-[#2f5d3a] font-bold text-sm">
              <IcoCalendar />
              <span>{fmtDateTime(appointment.startsAt)}</span>
            </div>
            <div className="text-xs text-[#6f5b46] mt-1">
              {appointment.location.name} · {appointment.items.length} item{appointment.items.length !== 1 ? "s" : ""}
            </div>
            {appointment.items.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {appointment.items.slice(0, 8).map((it) =>
                  it.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={it.id} src={it.photo} alt="" title={it.title} className="w-9 h-9 rounded-md object-cover bg-[#efe3d0] border border-[#e3d6bf] shrink-0" />
                  ) : (
                    <div key={it.id} className="w-9 h-9 rounded-md bg-[#efe3d0] border border-[#e3d6bf] shrink-0" title={it.title} />
                  )
                )}
                {appointment.items.length > 8 && (
                  <span className="text-xs text-[#8a7559] font-semibold">+{appointment.items.length - 8}</span>
                )}
              </div>
            )}
            <div className="text-xs text-[#6f5b46] mt-2 flex items-center gap-1.5">
              <IcoCheck className="w-3.5 h-3.5 text-[#4a7c59]" /> New wins join this pickup on their own.
            </div>
          </div>
        )}

        {/* Ready to schedule (only when no appointment yet) */}
        {!appointment && ready.length > 0 && (
          <div>
            <div className="font-semibold text-[#241a12] text-sm">
              {ready.length} item{ready.length !== 1 ? "s" : ""} paid and waiting
            </div>
            <p className="text-[#6f5b46] text-xs mt-0.5 mb-3">
              {transferItemCount > 0
                ? "Book these now, or wait for the transfer below and grab everything in one trip."
                : "Pick a day and time that suits you."}
            </p>
            <div className="space-y-2 mb-3">
              {ready.slice(0, 4).map((it) => (
                <div key={it.id} className="flex items-center gap-3">
                  <Thumb url={it.photo} title={it.title} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[#241a12] truncate">{it.title}</div>
                    {it.locationName && <div className="text-xs text-[#8a7559] truncate">at {it.locationName}</div>}
                  </div>
                </div>
              ))}
              {ready.length > 4 && (
                <div className="text-xs text-[#8a7559]">and {ready.length - 4} more</div>
              )}
            </div>
            <Link
              href="/pickup"
              className="inline-flex items-center gap-2 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
            >
              Book a pickup <IcoArrow />
            </Link>
          </div>
        )}

        {/* In-transit transfers — informational, NO schedule button */}
        {transferItemCount > 0 && (
          <div className="rounded-xl bg-[#f0a35a]/12 border border-[#c47b3e]/30 px-4 py-3">
            <div className="flex items-center gap-2 text-[#8a4f1c] font-bold text-sm">
              <IcoTruck className="w-4 h-4" />
              <span>
                {transferItemCount} item{transferItemCount !== 1 ? "s" : ""} moving to {pendingTransfers[0]?.toLocationName ?? "your warehouse"}
              </span>
            </div>
            <p className="text-xs text-[#6f5b46] mt-1">
              {appointment
                ? "They'll be added to your booked pickup when they land. Transfers take about 5 to 6 days; we text you on arrival."
                : "About 5 to 6 days on the road. We text you when they arrive, then you book one trip for everything."}
            </p>
            <ul className="mt-2 space-y-0.5">
              {pendingTransfers.flatMap((t) =>
                t.items.map((it) => (
                  <li key={it.id} className="text-xs text-[#241a12] flex items-start gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-[#c47b3e] mt-1.5 shrink-0" aria-hidden />
                    <span className="min-w-0">{it.title} <span className="text-[#8a7559]">from {it.fromLocationName}</span></span>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}

        {/* When they have an appointment AND ready items not on it yet */}
        {appointment && ready.length > 0 && (
          <Link
            href="/pickup"
            className="inline-flex items-center gap-2 text-[#6c4d39] hover:text-[#563e2c] font-semibold text-sm"
          >
            {ready.length} more ready to add <IcoArrow />
          </Link>
        )}
      </div>
    </div>
  );
}
