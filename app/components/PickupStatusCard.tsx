"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

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

function IcoTruck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 17h4V5H2v12h3M15 17h6v-5l-3-3h-3M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0" />
    </svg>
  );
}
function IcoPackage() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <img src={url} alt={title} className="w-11 h-11 rounded-lg object-cover shrink-0" />
  ) : (
    <div className="w-11 h-11 bg-[#efe3d0] rounded-lg flex items-center justify-center text-[#8a7559] text-xs shrink-0">—</div>
  );
}

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

  return (
    <div className="bg-[#6c4d39]/8 border border-[#6c4d39]/25 rounded-2xl px-5 py-4 space-y-4">
      {/* Header line summarizing state */}
      <div className="flex items-center gap-2">
        <span className="text-[#c47b3e]"><IcoPackage /></span>
        <span className="font-bold text-[#c47b3e] text-sm">Pickup</span>
      </div>

      {/* Scheduled appointment */}
      {appointment && (
        <div className="rounded-xl bg-white border border-green-200 px-4 py-3">
          <div className="flex items-center gap-2 text-green-700 font-bold text-sm">
            <IcoCalendar />
            <span>Pickup scheduled · {fmtDateTime(appointment.startsAt)}</span>
          </div>
          <div className="text-xs text-[#6f5b46] mt-1">
            {appointment.location.name} · {appointment.items.length} item{appointment.items.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {/* Ready to schedule (only when no appointment yet) */}
      {!appointment && ready.length > 0 && (
        <div>
          <div className="font-semibold text-[#241a12] text-sm">
            {ready.length} item{ready.length !== 1 ? "s" : ""} ready for pickup
          </div>
          <p className="text-[#6f5b46] text-xs mt-0.5 mb-3">
            {transferItemCount > 0
              ? "You can schedule these now, or wait for your transfer below to arrive and schedule everything in one trip."
              : "Payment confirmed — pick a time to collect."}
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
              <div className="text-xs text-[#8a7559]">+ {ready.length - 4} more</div>
            )}
          </div>
          <Link
            href="/pickup"
            className="inline-flex items-center gap-2 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
          >
            Schedule pickup <IcoArrow />
          </Link>
        </div>
      )}

      {/* In-transit transfers — informational, NO schedule button */}
      {transferItemCount > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <div className="flex items-center gap-2 text-amber-700 font-bold text-sm">
            <IcoTruck />
            <span>
              {transferItemCount} item{transferItemCount !== 1 ? "s" : ""} being transferred
            </span>
          </div>
          <p className="text-xs text-[#6f5b46] mt-1">
            {appointment
              ? "These are on their way and will be added to your scheduled pickup. Transfers usually take 5–6 days — we'll text you when they arrive."
              : "Heading to your chosen location now (usually 5–6 days). We'll text you when they arrive, then you can schedule a pickup for everything together."}
          </p>
          <ul className="mt-2 space-y-0.5">
            {pendingTransfers.flatMap((t) =>
              t.items.map((it) => (
                <li key={it.id} className="text-xs text-[#241a12]">
                  • {it.title} <span className="text-[#8a7559]">→ {t.toLocationName}</span>
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
          {ready.length} more ready — manage pickup <IcoArrow />
        </Link>
      )}
    </div>
  );
}
