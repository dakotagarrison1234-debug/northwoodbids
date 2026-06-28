"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import LocationBadge from "@/app/components/LocationBadge";

// ── Types ────────────────────────────────────────────────────────────────────
interface ItemCard {
  id: string;
  title: string;
  photo: string | null;
  auctionTitle: string | null;
  locationId?: string | null;
  locationName?: string | null;
}
interface PendingTransfer {
  id: string;
  status: "REQUESTED" | "LOADED";
  toLocationId: string;
  toLocationName: string;
  createdAt: string;
  items: { id: string; title: string; fromLocationName: string }[];
}
interface ApptLocation {
  id: string;
  name: string;
  address: string | null;
  instructions: string | null;
}
interface Appointment {
  id: string;
  startsAt: string;
  location: ApptLocation;
  items: ItemCard[];
}
interface Slot {
  startsAt: string;
  remaining: number;
}
interface SchedLocation {
  id: string;
  name: string;
  address: string | null;
  instructions: string | null;
  slots: Slot[];
}
interface PickupData {
  appointment: Appointment | null;
  unscheduledItems: ItemCard[];
  locations: SchedLocation[];
  pendingTransfers: PendingTransfer[];
  preferredLocationId: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
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
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Detroit",
    hour: "numeric",
    minute: "2-digit",
  });
}
function fmtDayShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/Detroit",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
function fmtMonthDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/Detroit",
    month: "short",
    day: "numeric",
  });
}
function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/Detroit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// Format a Date as an ICS UTC timestamp: YYYYMMDDTHHMMSSZ
function icsStamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// Build + download an .ics file for a confirmed pickup appointment.
// Times are stored as ISO instants; America/Detroit context is reflected in the
// human-readable summary/description, while DTSTART/DTEND use UTC stamps.
function downloadAppointmentIcs(appt: Appointment) {
  const start = new Date(appt.startsAt);
  const end = new Date(start.getTime() + 30 * 60 * 1000); // 30-min window
  const locParts = [appt.location.name, appt.location.address].filter(Boolean);
  const location = locParts.join(", ");
  const itemList = appt.items.map((i) => i.title).join(", ");
  const descParts = [
    `Pickup at ${appt.location.name}`,
    `Local time (Michigan): ${fmtDateTime(appt.startsAt)}`,
    appt.location.instructions ? `Instructions: ${appt.location.instructions}` : "",
    appt.items.length ? `Items: ${itemList}` : "",
  ].filter(Boolean);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Northwood Bids//Pickup//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:pickup-${appt.id}@northwoodbids`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    "SUMMARY:Northwood Bids — Item Pickup",
    `LOCATION:${icsEscape(location)}`,
    `DESCRIPTION:${icsEscape(descParts.join("\n"))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "northwood-pickup.ics";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ItemPhoto({ url, title }: { url: string | null; title: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={title} className="w-16 h-16 rounded-xl object-cover shrink-0" />
  ) : (
    <div className="w-16 h-16 bg-[#efe3d0] rounded-xl flex items-center justify-center text-[#8a7559] shrink-0">—</div>
  );
}

function groupByAuction(items: ItemCard[]) {
  const groups: Record<string, ItemCard[]> = {};
  for (const it of items) {
    const key = it.auctionTitle ?? "Other items";
    (groups[key] ??= []).push(it);
  }
  return Object.entries(groups);
}

// ── Slot picker — one week at a time: pick a day, then its times appear ─────────
const DAYS_PER_PAGE = 7;

function SlotPicker({
  location,
  onBook,
  busy,
  submitLabel,
}: {
  location: SchedLocation;
  onBook: (locationId: string, startsAt: string) => void;
  busy: boolean;
  submitLabel: string;
}) {
  const slots = location.slots ?? [];

  // Group slots into days with availability (already sorted ascending by the API).
  const days = useMemo(() => {
    const arr: { key: string; iso: string; slots: Slot[] }[] = [];
    for (const s of slots) {
      const k = dayKey(s.startsAt);
      let d = arr.find((x) => x.key === k);
      if (!d) {
        d = { key: k, iso: s.startsAt, slots: [] };
        arr.push(d);
      }
      d.slots.push(s);
    }
    return arr;
  }, [slots]);

  const [pageStart, setPageStart] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  if (days.length === 0) {
    return (
      <div className="rounded-xl border border-[#e3d6bf] bg-white px-4 py-6 text-base text-[#8a7559]">
        No times are available at this location right now. Please check back soon.
      </div>
    );
  }

  const pageDays = days.slice(pageStart, pageStart + DAYS_PER_PAGE);
  const activeDay = days.find((d) => d.key === selectedDay) ?? null;
  const hasPrev = pageStart > 0;
  const hasNext = pageStart + DAYS_PER_PAGE < days.length;
  const rangeLabel = pageDays.length
    ? `${fmtMonthDay(pageDays[0].iso)} – ${fmtMonthDay(pageDays[pageDays.length - 1].iso)}`
    : "";

  const goPrev = () => {
    setPageStart(Math.max(0, pageStart - DAYS_PER_PAGE));
    setSelectedDay(null);
    setSelected(null);
  };
  const goNext = () => {
    setPageStart(pageStart + DAYS_PER_PAGE);
    setSelectedDay(null);
    setSelected(null);
  };

  const navBtn =
    "flex items-center gap-1 rounded-xl border-2 border-[#e3d6bf] bg-white px-3 py-2 text-sm font-semibold text-[#241a12] hover:bg-[#efe3d0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors";

  return (
    <div className="space-y-5">
      {/* Week navigation */}
      <div>
        <label className="block text-base font-semibold text-[#241a12] mb-2">Pick a day (Michigan time)</label>
        <div className="flex items-center justify-between gap-2 mb-3">
          <button type="button" onClick={goPrev} disabled={!hasPrev} className={navBtn} aria-label="Previous week">
            <span aria-hidden>‹</span> Earlier
          </button>
          <span className="text-base font-semibold text-[#6f5b46]">{rangeLabel}</span>
          <button type="button" onClick={goNext} disabled={!hasNext} className={navBtn} aria-label="Next week">
            Later <span aria-hidden>›</span>
          </button>
        </div>

        {/* Day buttons for this week */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {pageDays.map((d) => {
            const isSel = selectedDay === d.key;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => {
                  setSelectedDay(d.key);
                  setSelected(null);
                }}
                className={`rounded-xl border-2 px-3 py-3 text-left transition-colors ${
                  isSel ? "border-[#6c4d39] bg-[#6c4d39] text-white" : "border-[#e3d6bf] bg-white hover:bg-[#efe3d0]"
                }`}
              >
                <div className="text-base font-semibold leading-tight">{fmtDayShort(d.iso)}</div>
                <div className={`text-xs mt-0.5 ${isSel ? "text-[#e7dcc6]" : "text-[#8a7559]"}`}>
                  {d.slots.length} time{d.slots.length !== 1 ? "s" : ""}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Times for the chosen day */}
      {activeDay ? (
        <div>
          <label className="block text-base font-semibold text-[#241a12] mb-2">
            Pick a time — {fmtDayShort(activeDay.iso)}
          </label>
          <div className="flex flex-wrap gap-2">
            {activeDay.slots.map((s) => {
              const isSelected = selected === s.startsAt;
              const low = s.remaining > 0 && s.remaining <= 2;
              return (
                <button
                  key={s.startsAt}
                  type="button"
                  onClick={() => setSelected(s.startsAt)}
                  className={`flex flex-col items-center rounded-xl border-2 px-4 py-3 text-base font-semibold transition-colors ${
                    isSelected
                      ? "border-[#6c4d39] bg-[#6c4d39] text-white"
                      : "border-[#e3d6bf] bg-white text-[#241a12] hover:bg-[#efe3d0]"
                  }`}
                >
                  <span>{fmtTime(s.startsAt)}</span>
                  {low && (
                    <span
                      className={`mt-0.5 text-xs font-bold ${
                        isSelected ? "text-[#f1e7d5]" : s.remaining === 1 ? "text-red-600" : "text-amber-600"
                      }`}
                    >
                      {s.remaining === 1 ? "Last one!" : `${s.remaining} left`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-base text-[#8a7559]">Pick a day above to see available times.</p>
      )}

      <button
        type="button"
        disabled={!selected || busy}
        onClick={() => selected && onBook(location.id, selected)}
        className="w-full bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-base py-3.5 rounded-xl transition-colors"
      >
        {busy ? "Saving…" : selected ? `${submitLabel} — ${fmtDateTime(selected)}` : submitLabel}
      </button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function PickupPage() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();
  const [data, setData] = useState<PickupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [choosing, setChoosing] = useState(false); // setting/switching preferred location
  const [switching, setSwitching] = useState(false); // showing the switch-location chooser

  const load = useCallback(() => {
    fetch("/api/pickup")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load pickup");
        return r.json();
      })
      .then((d: PickupData) => setData(d))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  // User-triggered retry: reset state, then re-run the fetch.
  const retryLoad = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    setData(null);
    load();
  }, [load]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.push("/sign-in?redirect_url=/pickup");
      return;
    }
    load();
  }, [isLoaded, isSignedIn, router, load]);

  const book = async (locationId: string, startsAt: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/pickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, startsAt }),
      });
      const d = await res.json();
      if (d.success) {
        setMsg({ text: "Your pickup is scheduled!", ok: true });
        load();
      } else {
        setMsg({ text: d.error || "Could not schedule. Please try again.", ok: false });
        load();
      }
    } catch {
      setMsg({ text: "Something went wrong. Please try again.", ok: false });
    } finally {
      setBusy(false);
    }
  };

  const reschedule = async (locationId: string, startsAt: string) => {
    if (!data?.appointment) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/pickup/${data.appointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, startsAt }),
      });
      const d = await res.json();
      if (d.success) {
        setMsg({ text: "Your pickup has been updated.", ok: true });
        setRescheduling(false);
        load();
      } else {
        setMsg({ text: d.error || "Could not reschedule. Please try again.", ok: false });
        load();
      }
    } catch {
      setMsg({ text: "Something went wrong. Please try again.", ok: false });
    } finally {
      setBusy(false);
    }
  };

  // Set or switch the preferred pickup location. Everything not there is moved there.
  const choosePreferred = async (locationId: string) => {
    setChoosing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/pickup/preferred", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setSwitching(false);
        setRescheduling(false);
        setMsg({
          text: d.transferred > 0
            ? `Set! ${d.transferred} item${d.transferred !== 1 ? "s" : ""} elsewhere will be transferred here (usually 5–6 days).`
            : "Pickup location set.",
          ok: true,
        });
        load();
      } else {
        setMsg({ text: d.error || "Could not set your pickup location. Please try again.", ok: false });
      }
    } catch {
      setMsg({ text: "Something went wrong. Please try again.", ok: false });
    } finally {
      setChoosing(false);
    }
  };

  const cancel = async () => {
    if (!data?.appointment) return;
    if (!confirm("Cancel this pickup appointment? Your items will go back to the waiting list.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/pickup/${data.appointment.id}`, { method: "DELETE" });
      const d = await res.json();
      if (d.success) {
        setMsg({ text: "Your pickup was cancelled.", ok: true });
        setRescheduling(false);
        load();
      } else {
        setMsg({ text: d.error || "Could not cancel. Please try again.", ok: false });
      }
    } catch {
      setMsg({ text: "Something went wrong. Please try again.", ok: false });
    } finally {
      setBusy(false);
    }
  };

  if (!isLoaded || loading) {
    return (
      <main className="min-h-screen bg-[#f1e7d5] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#6c4d39]/30 border-t-[#6c4d39] animate-spin" />
          <p className="text-[#8a7559] text-base">Loading your pickup…</p>
        </div>
      </main>
    );
  }
  if (loadError || !data) {
    return (
      <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
        <div className="max-w-2xl mx-auto px-6 sm:px-8 py-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-semibold">Pickup</h1>
            <Link href="/dashboard" className="text-base text-[#6c4d39] hover:text-[#563e2c] font-semibold">
              ← My Bids
            </Link>
          </div>
          <div className="bg-white border border-[#e3d6bf] rounded-2xl px-6 py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 border border-red-500/20 flex items-center justify-center mx-auto mb-4 text-red-600">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-[#241a12]">We couldn&apos;t load your pickup details</p>
            <p className="text-base text-[#8a7559] mt-2">Please check your connection and try again.</p>
            <button
              onClick={retryLoad}
              className="inline-block mt-6 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-semibold text-base px-6 py-3.5 rounded-xl transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  const { appointment, unscheduledItems, locations, pendingTransfers, preferredLocationId } = data;

  const apptPassed = !!appointment && new Date(appointment.startsAt).getTime() < Date.now();
  const inTransitIds = new Set(pendingTransfers.flatMap((t) => t.items.map((it) => it.id)));

  // Effective preferred location: explicit choice, else inferred from an existing
  // appointment (so bidders who scheduled before this feature don't get re-asked).
  const preferredId = preferredLocationId ?? appointment?.location.id ?? null;
  const preferredSched = locations.find((l) => l.id === preferredId);
  const preferredName = preferredSched?.name ?? appointment?.location.name ?? "your location";

  // Ready = unscheduled, not in transit, sitting at the preferred location (or no home).
  const ready = unscheduledItems.filter(
    (it) => !inTransitIds.has(it.id) && (it.locationId === preferredId || it.locationId == null)
  );
  const transferCount = pendingTransfers.reduce((s, t) => s + t.items.length, 0);
  const hasAnything = unscheduledItems.length > 0 || pendingTransfers.length > 0 || !!appointment;

  const banner = msg && (
    <div
      className={`mb-6 rounded-xl px-4 py-3.5 text-base font-medium border ${
        msg.ok ? "bg-[#5f7a45]/10 text-[#5f7a45] border-[#5f7a45]/30" : "bg-red-50 text-red-600 border-red-500/20"
      }`}
    >
      {msg.text}
    </div>
  );

  const header = (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-3xl font-semibold">Pickup</h1>
      <Link href="/dashboard" className="text-base text-[#6c4d39] hover:text-[#563e2c] font-semibold">← My Bids</Link>
    </div>
  );

  // ── Location chooser (first-run + switch) ──────────────────────────────────
  const LocationChooser = (
    <div className="space-y-5">
      <div className="bg-white border-2 border-[#6c4d39]/25 rounded-2xl px-6 py-5">
        <h2 className="text-xl font-semibold text-[#241a12]">
          {switching ? "Switch pickup location" : "Where would you like to pick up?"}
        </h2>
        <p className="text-base text-[#6f5b46] mt-2">
          {switching
            ? "This moves all of your items to the new location and clears any scheduled time, so you'll pick a new one. Items already loaded on a truck keep heading to their current destination."
            : "Choose where you'll collect your items. Anything you win at another location is automatically transferred here — usually 5–6 days, and we'll text you the moment it arrives. You can switch later."}
        </p>
      </div>
      {locations.length === 0 ? (
        <div className="rounded-xl border border-[#e3d6bf] bg-white px-4 py-6 text-base text-[#8a7559]">
          Pickup isn&apos;t available yet. Please check back soon.
        </div>
      ) : (
        <div className="space-y-2">
          {locations.map((l) => (
            <button
              key={l.id}
              type="button"
              disabled={choosing}
              onClick={() => choosePreferred(l.id)}
              className={`w-full text-left rounded-xl border-2 px-4 py-3.5 transition-colors disabled:opacity-50 ${
                preferredId === l.id ? "border-[#6c4d39] bg-[#efe3d0]" : "border-[#e3d6bf] bg-white hover:bg-[#efe3d0]"
              }`}
            >
              <div className="font-semibold text-base text-[#241a12] flex items-center justify-between gap-2">
                <span>{l.name}</span>
                {preferredId === l.id && <span className="text-xs text-[#6c4d39] font-bold">Current</span>}
              </div>
              {l.address && <div className="text-base text-[#6f5b46] mt-0.5">{l.address}</div>}
              {l.instructions && <div className="text-sm text-[#8a7559] mt-1">{l.instructions}</div>}
            </button>
          ))}
        </div>
      )}
      {switching && (
        <button onClick={() => setSwitching(false)} className="text-base text-[#6c4d39] hover:text-[#563e2c] font-semibold">
          ← Keep {preferredName}
        </button>
      )}
    </div>
  );

  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      <div className="max-w-2xl mx-auto px-6 sm:px-8 py-8">
        {header}
        {banner}

        {/* ── Empty ── */}
        {!hasAnything && (
          <div className="bg-white border border-[#e3d6bf] rounded-2xl px-6 py-16 text-center">
            <p className="text-lg text-[#6f5b46]">No items waiting for pickup yet.</p>
            <p className="text-base text-[#8a7559] mt-2">When you win and pay for an item, you&apos;ll schedule a pickup here.</p>
            <Link href="/auctions" className="inline-block mt-6 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-semibold text-base px-6 py-3.5 rounded-xl transition-colors">
              Browse auctions
            </Link>
          </div>
        )}

        {/* ── First-run / switching: choose location ── */}
        {hasAnything && (switching || !preferredId) && LocationChooser}

        {/* ── Main view: have a preferred location ── */}
        {hasAnything && preferredId && !switching && (
          <div className="space-y-6">
            {/* Preferred location banner */}
            <div className="flex items-center justify-between gap-3 bg-white border border-[#e3d6bf] rounded-2xl px-5 py-4">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-[#8a7559] font-semibold">Picking up at</div>
                <div className="mt-1"><LocationBadge name={preferredName} /></div>
              </div>
              <button onClick={() => { setSwitching(true); setRescheduling(false); }} className="text-sm text-[#6c4d39] hover:text-[#563e2c] font-semibold shrink-0">
                Switch location
              </button>
            </div>

            {/* Scheduled appointment */}
            {appointment && !rescheduling && (
              <>
                <div className={`bg-white border-2 rounded-2xl overflow-hidden ${apptPassed ? "border-amber-300" : "border-green-200"}`}>
                  <div className={`border-b px-6 py-5 ${apptPassed ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
                    <div className={`text-base font-semibold ${apptPassed ? "text-amber-700" : "text-green-700"}`}>
                      {apptPassed ? "Your pickup time has passed" : "Your pickup is scheduled for"}
                    </div>
                    <div className={`text-2xl font-extrabold mt-1 ${apptPassed ? "text-amber-700" : "text-green-700"}`}>{fmtDateTime(appointment.startsAt)}</div>
                    {apptPassed && <div className="text-sm text-[#6f5b46] mt-2">Please reschedule below, or contact us if you already picked up.</div>}
                  </div>
                  <div className="px-6 py-5">
                    <LocationBadge name={appointment.location.name} />
                    {appointment.location.address && <div className="text-base text-[#6f5b46] mt-0.5">{appointment.location.address}</div>}
                    {appointment.location.instructions && (
                      <div className="text-base text-[#8a7559] mt-2 bg-[#f1e7d5] rounded-xl px-4 py-3">{appointment.location.instructions}</div>
                    )}
                    <button type="button" onClick={() => downloadAppointmentIcs(appointment)}
                      className="mt-4 inline-flex items-center gap-2 bg-[#efe3d0] hover:bg-[#e3d6bf] border border-[#cdbda3] text-[#6c4d39] font-semibold text-base px-4 py-2.5 rounded-xl transition-colors">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                      Add to calendar
                    </button>
                  </div>
                </div>

                {/* Items on this pickup */}
                <div>
                  <h2 className="text-xl font-semibold mb-3">{appointment.items.length} item{appointment.items.length !== 1 ? "s" : ""} ready for this pickup</h2>
                  <div className="space-y-5">
                    {groupByAuction(appointment.items).map(([auctionTitle, items]) => (
                      <div key={auctionTitle}>
                        <div className="text-base font-semibold text-[#6f5b46] mb-2">{auctionTitle}</div>
                        <div className="space-y-2">
                          {items.map((it) => (
                            <div key={it.id} className="flex items-center gap-3 bg-white border border-[#e3d6bf] rounded-xl px-4 py-3">
                              <ItemPhoto url={it.photo} title={it.title} />
                              <div className="font-medium text-base text-[#241a12]">{it.title}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-base text-[#8a7559] bg-[#efe3d0] rounded-xl px-4 py-3">
                  {transferCount > 0
                    ? `${transferCount} more item${transferCount !== 1 ? "s are" : " is"} being transferred here (see below) — they'll be added automatically when they arrive. `
                    : ""}
                  New items you win at {preferredName} are added to this pickup automatically.
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={() => setRescheduling(true)} className="flex-1 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-semibold text-base py-3.5 rounded-xl transition-colors">
                    {apptPassed ? "Pick a new time" : "Reschedule"}
                  </button>
                  <button onClick={cancel} disabled={busy} className="flex-1 bg-white border-2 border-red-500/30 text-red-600 hover:bg-red-50 disabled:opacity-50 font-semibold text-base py-3.5 rounded-xl transition-colors">
                    Cancel pickup
                  </button>
                </div>
              </>
            )}

            {/* Rescheduling (time only — location stays the preferred one) */}
            {appointment && rescheduling && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Pick a new time</h2>
                  <button onClick={() => setRescheduling(false)} className="text-base text-[#6c4d39] hover:text-[#563e2c] font-semibold">Cancel</button>
                </div>
                {preferredSched ? (
                  <SlotPicker location={preferredSched} onBook={(_loc, startsAt) => reschedule(appointment.location.id, startsAt)} busy={busy} submitLabel="Update pickup" />
                ) : (
                  <div className="rounded-xl border border-[#e3d6bf] bg-white px-4 py-6 text-base text-[#8a7559]">No times are available right now.</div>
                )}
              </div>
            )}

            {/* No appointment yet: schedule the ready items */}
            {!appointment && (
              ready.length > 0 ? (
                <div className="bg-white border-2 border-[#6c4d39]/25 rounded-2xl px-6 py-6 space-y-5">
                  <div>
                    <div className="text-lg font-semibold text-[#241a12]">
                      {ready.length} item{ready.length !== 1 ? "s" : ""} ready to pick up
                    </div>
                    <p className="text-sm text-[#8a7559] mt-0.5">Pick a day & time below to collect{transferCount > 0 ? " what's ready — your transferring items can be added once they arrive" : ""}.</p>
                    <ul className="mt-3 space-y-1 text-base text-[#241a12]">
                      {ready.map((it) => (<li key={it.id}>• {it.title}</li>))}
                    </ul>
                  </div>
                  {preferredSched ? (
                    <SlotPicker location={preferredSched} onBook={book} busy={busy} submitLabel="Schedule pickup" />
                  ) : (
                    <div className="rounded-xl border border-[#e3d6bf] bg-white px-4 py-6 text-base text-[#8a7559]">No times are available right now.</div>
                  )}
                </div>
              ) : transferCount > 0 ? (
                <div className="rounded-2xl border border-[#e3d6bf] bg-white px-5 py-5 text-base text-[#6f5b46]">
                  Nothing&apos;s ready to collect yet — your items are being transferred to {preferredName} (see below). We&apos;ll text you the moment they arrive, then you can schedule a time.
                </div>
              ) : null
            )}

            {/* Being transferred */}
            {transferCount > 0 && (
              <div>
                <h2 className="text-base font-bold text-[#8a5a2b] uppercase tracking-wider mb-3">
                  {transferCount} item{transferCount !== 1 ? "s" : ""} being transferred to {preferredName}
                </h2>
                <div className="space-y-4">
                  {pendingTransfers.map((t) => (
                    <div key={t.id} className="rounded-2xl border-2 border-amber-200 bg-amber-50 px-5 py-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-base font-semibold text-[#241a12]">{t.items.length} item{t.items.length !== 1 ? "s" : ""} on the way</div>
                        <span className="text-sm px-3 py-1 rounded-full font-bold shrink-0 bg-amber-50 text-amber-700 border border-amber-200">
                          {t.status === "LOADED" ? "Loaded / in transit" : "Being gathered"}
                        </span>
                      </div>
                      <p className="text-base text-[#6f5b46] mt-2">Usually 5–6 days. We&apos;ll text you the moment they&apos;re dropped off — then they join your pickup automatically.</p>
                      <ul className="mt-3 space-y-1 text-base text-[#241a12]">
                        {t.items.map((it) => (<li key={it.id}>• {it.title} <span className="text-[#8a7559] text-sm">— from {it.fromLocationName}</span></li>))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
