"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import LocationBadge from "@/app/components/LocationBadge";
import EmptyState from "@/app/components/EmptyState";
import { IcoTruck, IcoCheck, IcoLock, IcoTarget, IcoMegaphone } from "@/app/components/BidIcons";
import { PineMark } from "@/app/components/Illustrations";

// ── Types ────────────────────────────────────────────────────────────────────
interface ItemCard {
  id: string;
  title: string;
  photo: string | null;
  auctionTitle: string | null;
  locationId?: string | null;
  locationName?: string | null;
  storageLocation?: string | null;
}

// Small "Box 1" chip so the customer/staff know exactly where a staged item sits.
function SpotChip({ spot }: { spot?: string | null }) {
  if (!spot) return null;
  return (
    <span className="inline-block bg-[#6c4d39]/10 text-[#6c4d39] border border-[#6c4d39]/25 rounded-full px-2 py-0.5 text-xs font-bold font-mono">
      {spot}
    </span>
  );
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
  /** Set once staff box the order up — "your order is in Box 4". */
  stagedSpot: string | null;
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
  otherAppointments: Appointment[];
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
function fmtWeekday(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Detroit", weekday: "short" });
}
function fmtDayNum(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Detroit", day: "numeric" });
}
function fmtMonthShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Detroit", month: "short" });
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

// ── Small UI bits ─────────────────────────────────────────────────────────────
function IcoChevL() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3 5 8l5 5" /></svg>
  );
}
function IcoChevR() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3l5 5-5 5" /></svg>
  );
}
function IcoCalendar({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
  );
}
function IcoPin({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.3-7-11a7 7 0 1 1 14 0c0 4.7-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
  );
}

function ItemPhoto({ url, title }: { url: string | null; title: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={title} className="w-14 h-14 rounded-xl object-cover shrink-0 border border-[#e3d6bf]" />
  ) : (
    <div className="w-14 h-14 bg-[#efe3d0] rounded-xl border border-[#e3d6bf] shrink-0" />
  );
}

/** Compact item line used in lists (no photo): dot, title, optional spot/from. */
function ItemLine({ title, extra }: { title: string; extra?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-[#241a12]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#c47b3e] mt-2 shrink-0" aria-hidden />
      <span className="min-w-0 leading-snug">{title} {extra}</span>
    </li>
  );
}

/** Section label used throughout the page. */
function Eyebrow({ children, tone = "leather" }: { children: React.ReactNode; tone?: "leather" | "amber" | "moss" }) {
  const c = tone === "amber" ? "text-[#a85f28]" : tone === "moss" ? "text-[#2f5d3a]" : "text-[#6c4d39]";
  return <div className={`text-[11px] font-black uppercase tracking-[0.18em] ${c}`}>{children}</div>;
}

/** "What happens next" strip — the three beats of a pickup, in order. */
function NextSteps({ hasAppointment, transferring }: { hasAppointment: boolean; transferring: boolean }) {
  const steps = [
    { Icon: IcoTruck, title: transferring ? "It rides over" : "We pull your order", text: transferring ? "Wins from the other warehouse move to yours, free, in about 5 to 6 days." : "Once you book, staff gather your items and box them up." },
    { Icon: IcoMegaphone, title: "We text you", text: hasAppointment ? "You'll get a text with your box number when it's staged." : "A quick text lets you know it's ready and where to find it." },
    { Icon: IcoCheck, title: "Grab it and go", text: "Show up in your window, find your box, tap \"I picked up\". Done." },
  ];
  return (
    <div className="bg-white border border-[#e3d6bf] rounded-2xl px-5 py-4">
      <Eyebrow>What happens next</Eyebrow>
      <ol className="mt-3 grid gap-3 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3 sm:flex-col sm:gap-2">
            <span className="w-9 h-9 rounded-xl bg-[#faf5ea] border border-[#e3d6bf] text-[#6c4d39] flex items-center justify-center shrink-0 relative">
              <s.Icon className="w-4 h-4" />
              <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-[#6c4d39] text-white text-[9px] font-black flex items-center justify-center">{i + 1}</span>
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold text-[#241a12]">{s.title}</div>
              <div className="text-xs text-[#6f5b46] mt-0.5 leading-snug">{s.text}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
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
      <div className="rounded-xl border border-dashed border-[#cdbda3] bg-[#faf5ea] px-4 py-6 text-sm text-[#6f5b46] text-center">
        No open windows at {location.name} right now. New times post regularly; check back shortly.
      </div>
    );
  }

  const pageDays = days.slice(pageStart, pageStart + DAYS_PER_PAGE);
  const activeDay = days.find((d) => d.key === selectedDay) ?? null;
  const hasPrev = pageStart > 0;
  const hasNext = pageStart + DAYS_PER_PAGE < days.length;
  const rangeLabel = pageDays.length
    ? `${fmtMonthDay(pageDays[0].iso)} to ${fmtMonthDay(pageDays[pageDays.length - 1].iso)}`
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
    "inline-flex items-center gap-1 rounded-lg border border-[#e3d6bf] bg-white px-2.5 py-1.5 text-xs font-bold text-[#6c4d39] hover:bg-[#faf5ea] disabled:opacity-40 disabled:cursor-not-allowed transition-colors";

  // Today never appears in the slot list once the 8am cutoff has passed. Say why,
  // or it just looks like the schedule is broken.
  const todayKey = dayKey(new Date().toISOString());
  const todayMissing = !days.some((d) => d.key === todayKey);

  return (
    <div className="space-y-5">
      {todayMissing && (
        <p className="text-sm text-[#6f5b46] bg-[#faf5ea] border border-[#e3d6bf] rounded-xl px-4 py-2.5 flex items-start gap-2">
          <IcoLock className="w-4 h-4 text-[#8a7559] shrink-0 mt-0.5" />
          <span>Same-day windows close at <strong className="text-[#241a12]">8:00 AM</strong> so we have time to pull your order. The soonest open day is below.</span>
        </p>
      )}

      {/* Week navigation */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div>
            <Eyebrow>1. Pick a day</Eyebrow>
            <div className="text-xs text-[#8a7559] mt-0.5">{rangeLabel} · Michigan time</div>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={goPrev} disabled={!hasPrev} className={navBtn} aria-label="Previous week">
              <IcoChevL /> Earlier
            </button>
            <button type="button" onClick={goNext} disabled={!hasNext} className={navBtn} aria-label="Next week">
              Later <IcoChevR />
            </button>
          </div>
        </div>

        {/* Day buttons for this week */}
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
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
                aria-pressed={isSel}
                className={`rounded-xl border-2 px-1 py-2.5 text-center transition-colors nb-focus ${
                  isSel ? "border-[#6c4d39] bg-[#6c4d39] text-white" : "border-[#e3d6bf] bg-white hover:bg-[#faf5ea] hover:border-[#cdbda3]"
                }`}
              >
                <div className={`text-[10px] font-bold uppercase tracking-wider ${isSel ? "text-[#e7dcc6]" : "text-[#8a7559]"}`}>{fmtWeekday(d.iso)}</div>
                <div className="font-display text-xl font-black leading-none mt-0.5">{fmtDayNum(d.iso)}</div>
                <div className={`text-[10px] mt-0.5 ${isSel ? "text-[#e7dcc6]" : "text-[#8a7559]"}`}>{fmtMonthShort(d.iso)}</div>
                <div className={`text-[10px] font-semibold mt-1 ${isSel ? "text-white" : "text-[#4a7c59]"}`}>
                  {d.slots.length} open
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Times for the chosen day */}
      <div>
        <Eyebrow>2. Pick a time</Eyebrow>
        {activeDay ? (
          <>
            <div className="text-xs text-[#8a7559] mt-0.5 mb-2.5">{fmtDayShort(activeDay.iso)} · 30-minute windows</div>
            <div className="flex flex-wrap gap-2">
              {activeDay.slots.map((s) => {
                const isSelected = selected === s.startsAt;
                const low = s.remaining > 0 && s.remaining <= 2;
                return (
                  <button
                    key={s.startsAt}
                    type="button"
                    onClick={() => setSelected(s.startsAt)}
                    aria-pressed={isSelected}
                    className={`flex flex-col items-center rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-colors nb-focus ${
                      isSelected
                        ? "border-[#6c4d39] bg-[#6c4d39] text-white"
                        : "border-[#e3d6bf] bg-white text-[#241a12] hover:bg-[#faf5ea] hover:border-[#cdbda3]"
                    }`}
                  >
                    <span>{fmtTime(s.startsAt)}</span>
                    {low && (
                      <span
                        className={`mt-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          isSelected ? "text-[#f1e7d5]" : s.remaining === 1 ? "text-red-600" : "text-[#a85f28]"
                        }`}
                      >
                        {s.remaining === 1 ? "Last spot" : `${s.remaining} left`}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <p className="text-sm text-[#8a7559] mt-1">Choose a day above and the open windows show up here.</p>
        )}
      </div>

      <button
        type="button"
        disabled={!selected || busy}
        onClick={() => selected && onBook(location.id, selected)}
        className="w-full bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base py-3.5 rounded-xl transition-colors"
      >
        {busy ? "Saving" : selected ? `${submitLabel}: ${fmtDateTime(selected)}` : submitLabel}
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
        const n = Number(d.transferred ?? 0);
        setMsg({
          text: n > 0
            ? `Booked. ${n} item${n !== 1 ? "s" : ""} from the other warehouse will ride over and join this pickup (usually 5 to 6 days). We'll text you when your order is staged.`
            : "Booked. We'll text you when your order is staged.",
          ok: true,
        });
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
        setMsg({ text: "New time locked in.", ok: true });
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
            ? `Done. ${d.transferred} item${d.transferred !== 1 ? "s" : ""} from the other warehouse will ride over (usually 5 to 6 days).`
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

  // Confirm modal state — native confirm() is silently blocked in the installed app,
  // which made "Cancel pickup" look like a dead button.
  const [confirmDialog, setConfirmDialog] = useState<
    { text: string; confirmLabel: string; danger?: boolean; onConfirm: () => void } | null
  >(null);

  const doCancelById = async (id: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/pickup/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (d.success) {
        setMsg({ text: "Pickup cancelled. Your items are waiting whenever you're ready to rebook.", ok: true });
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
  const cancelById = (id: string) =>
    setConfirmDialog({
      text: "Cancel this pickup? Your items go back to the waiting list and you can book a new time whenever you're ready.",
      confirmLabel: "Cancel pickup",
      danger: true,
      onConfirm: () => doCancelById(id),
    });
  const cancel = () => { if (data?.appointment) cancelById(data.appointment.id); };

  // Customer confirming they've collected their order. Same effect as staff pressing
  // "Order picked up": items are marked collected and the staged spot frees up.
  const doCollect = async (id: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/pickup/${id}/collect`, { method: "POST" });
      const d = await res.json();
      if (d.success) {
        setMsg({ text: "All squared away. Enjoy the haul.", ok: true });
        load();
      } else {
        setMsg({ text: d.error || "Could not update. Please try again.", ok: false });
      }
    } catch {
      setMsg({ text: "Something went wrong. Please try again.", ok: false });
    } finally {
      setBusy(false);
    }
  };
  const collectById = (id: string) =>
    setConfirmDialog({
      text: "Mark this order as picked up? Only do this once you actually have your items.",
      confirmLabel: "Yes, I have it",
      onConfirm: () => doCollect(id),
    });

  const backLink = (
    <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-[#6c4d39] hover:text-[#563e2c] font-semibold shrink-0">
      <IcoChevL /> Your bids
    </Link>
  );

  const pageHeader = (
    <div className="flex items-end justify-between gap-3 mb-6">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#a85f28]">
          <PineMark className="w-3.5 h-3.5" /> Owosso &amp; Gladwin
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-black leading-[0.95] tracking-tight mt-1">Pickup</h1>
      </div>
      {backLink}
    </div>
  );

  if (!isLoaded || loading) {
    return (
      <main className="min-h-screen bg-[#f1e7d5] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#6c4d39]/30 border-t-[#6c4d39] animate-spin" />
          <p className="text-[#8a7559] text-sm">Checking the warehouse</p>
        </div>
      </main>
    );
  }
  if (loadError || !data) {
    return (
      <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
        <div className="max-w-2xl mx-auto px-5 sm:px-8 py-6 sm:py-8">
          {pageHeader}
          <div className="bg-white border border-[#e3d6bf] rounded-2xl px-6 py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 border border-red-500/20 flex items-center justify-center mx-auto mb-4 text-red-600">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
            <p className="font-display text-lg font-bold text-[#241a12]">Couldn&apos;t reach the pickup desk</p>
            <p className="text-sm text-[#8a7559] mt-2">Check your connection and give it another go.</p>
            <button
              onClick={retryLoad}
              className="inline-block mt-6 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  const { appointment, otherAppointments, unscheduledItems, locations, pendingTransfers, preferredLocationId } = data;

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

  // Non-transferable items won at OTHER warehouses — must be collected there, grouped
  // by warehouse so the bidder can schedule each. (Transferable items elsewhere are
  // in transit; these are the ones that can't be moved.)
  const otherLocationGroups = Object.entries(
    unscheduledItems
      .filter((it) => !inTransitIds.has(it.id) && it.locationId != null && it.locationId !== preferredId)
      .reduce<Record<string, ItemCard[]>>((acc, it) => {
        (acc[it.locationId as string] ??= []).push(it);
        return acc;
      }, {})
  );

  const banner = msg && (
    <div
      role="status"
      className={`mb-6 rounded-xl px-4 py-3.5 text-sm font-semibold border flex items-start gap-2 ${
        msg.ok ? "bg-[#4a7c59]/10 text-[#2f5d3a] border-[#4a7c59]/30" : "bg-red-50 text-red-700 border-red-500/20"
      }`}
    >
      {msg.ok && <IcoCheck className="w-4 h-4 shrink-0 mt-0.5" />}
      <span>{msg.text}</span>
    </div>
  );

  // ── Location chooser (first-run + switch) ──────────────────────────────────
  const LocationChooser = (
    <div className="space-y-5">
      <div className="bg-white border border-[#e3d6bf] rounded-2xl px-5 sm:px-6 py-5">
        <Eyebrow>{switching ? "Switch warehouse" : "First things first"}</Eyebrow>
        <h2 className="font-display text-2xl font-black text-[#241a12] mt-1">
          {switching ? "Move everything to a new home" : "Where do you want to pick up?"}
        </h2>
        <p className="text-sm text-[#6f5b46] mt-2 leading-relaxed">
          {switching
            ? "Every item you have waiting moves to the new warehouse and any booked time is cleared, so you'll pick a fresh one. Anything already loaded on a truck keeps heading where it was going."
            : "Pick your home warehouse. Every win ends up there: anything from the other location rides over free (usually 5 to 6 days) and we text you when it lands. Switch anytime."}
        </p>
      </div>
      {locations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#cdbda3] bg-[#faf5ea] px-4 py-6 text-sm text-[#6f5b46] text-center">
          Pickup isn&apos;t open for booking yet. Check back soon.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {locations.map((l) => {
            const current = preferredId === l.id;
            return (
              <button
                key={l.id}
                type="button"
                disabled={choosing}
                onClick={() => choosePreferred(l.id)}
                className={`text-left rounded-2xl border-2 px-4 py-4 transition-all disabled:opacity-50 nb-lift nb-focus ${
                  current ? "border-[#6c4d39] bg-[#faf5ea]" : "border-[#e3d6bf] bg-white hover:border-[#cdbda3]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${current ? "bg-[#6c4d39] text-white" : "bg-[#c47b3e]/12 text-[#a85f28]"}`}>
                    <IcoPin className="w-5 h-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-black text-lg text-[#241a12] leading-tight">{l.name}</span>
                      {current && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[#2f5d3a] bg-[#4a7c59]/12 border border-[#4a7c59]/30 rounded-full px-2 py-0.5 shrink-0">
                          <IcoCheck className="w-3 h-3" /> Current
                        </span>
                      )}
                    </div>
                    {l.address && <div className="text-sm text-[#6f5b46] mt-0.5">{l.address}</div>}
                    {l.instructions && <div className="text-xs text-[#8a7559] mt-1.5 leading-snug">{l.instructions}</div>}
                    <div className="text-xs text-[#4a7c59] font-semibold mt-2">
                      {l.slots?.length ? `${l.slots.length} open windows this stretch` : "Windows post soon"}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {switching && (
        <button onClick={() => setSwitching(false)} className="inline-flex items-center gap-1 text-sm text-[#6c4d39] hover:text-[#563e2c] font-semibold">
          <IcoChevL /> Keep {preferredName}
        </button>
      )}
    </div>
  );

  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-6 sm:py-8">
        {pageHeader}
        {banner}

        {/* No pickup locations configured by the business yet */}
        {locations.length === 0 && (
          <EmptyState
            framed
            title="Pickup isn't open for booking yet"
            message="We're setting up the pickup calendar. Anything you win is safe with us until it is."
            cta={
              <Link href="/auctions" className="inline-block bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors">
                Browse live auctions
              </Link>
            }
          />
        )}

        {/* ── Choose / switch location — available ANYTIME, even with no items yet ── */}
        {locations.length > 0 && (switching || !preferredId) && LocationChooser}

        {/* ── Have a preferred location → minimized pill + items ── */}
        {locations.length > 0 && preferredId && !switching && (
          <div className="space-y-6">
            {/* Minimized pickup-location pill — small but clearly tappable to switch */}
            <div className="flex items-center justify-between gap-3 bg-white border border-[#e3d6bf] rounded-xl pl-3 pr-2 py-2">
              <div className="flex items-center gap-2.5 min-w-0 text-sm">
                <span className="w-8 h-8 rounded-lg bg-[#c47b3e]/12 text-[#a85f28] flex items-center justify-center shrink-0">
                  <IcoPin className="w-4 h-4" />
                </span>
                <div className="min-w-0 leading-tight">
                  <div className="text-[10px] font-black uppercase tracking-wider text-[#8a7559]">Home warehouse</div>
                  <div className="font-bold text-[#241a12] truncate">{preferredName}</div>
                </div>
              </div>
              <button
                onClick={() => { setSwitching(true); setRescheduling(false); }}
                className="text-xs font-bold text-[#6c4d39] hover:bg-[#faf5ea] border border-[#e3d6bf] rounded-lg px-3 py-1.5 shrink-0 transition-colors"
              >
                Switch
              </button>
            </div>

            {/* Chosen location is no longer open for scheduling — guide them to switch */}
            {!preferredSched && (
              <div className="rounded-xl border border-[#c47b3e]/40 bg-[#f0a35a]/12 px-4 py-3.5 text-sm text-[#8a4f1c]">
                {preferredName} isn&apos;t taking bookings right now.{" "}
                <button onClick={() => { setSwitching(true); setRescheduling(false); }} className="font-bold underline underline-offset-2">
                  Pick another warehouse
                </button>{" "}
                to book a time.
              </div>
            )}

            {/* Nothing waiting yet — but the location is set for future wins */}
            {!appointment && ready.length === 0 && transferCount === 0 && (
              <EmptyState
                art="critter"
                framed
                title="Nothing waiting at the dock"
                message={`Win something and it lands at ${preferredName} automatically. You'll book a time here once it's ready.`}
                cta={
                  <Link href="/auctions" className="inline-block bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors">
                    Browse live auctions
                  </Link>
                }
              />
            )}

            {/* Scheduled appointment */}
            {appointment && !rescheduling && (
              <>
                <div className={`bg-white border-2 rounded-2xl overflow-hidden ${apptPassed ? "border-[#c47b3e]/50" : "border-[#4a7c59]/40"}`}>
                  <div className={`px-5 sm:px-6 py-5 ${apptPassed ? "bg-[#f0a35a]/15" : "bg-[#4a7c59]/10"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <Eyebrow tone={apptPassed ? "amber" : "moss"}>
                        {apptPassed ? "Window passed" : "You're booked"}
                      </Eyebrow>
                      <span className="inline-flex items-center gap-1.5 text-[#6f5b46] text-xs font-semibold">
                        <IcoCalendar className="w-3.5 h-3.5" /> 30-min window
                      </span>
                    </div>
                    <div className={`font-display text-2xl sm:text-3xl font-black leading-tight mt-1 ${apptPassed ? "text-[#8a4f1c]" : "text-[#2f5d3a]"}`}>
                      {fmtDateTime(appointment.startsAt)}
                    </div>
                    {apptPassed && <div className="text-sm text-[#6f5b46] mt-2">Pick a new time below, or reach out if you already collected.</div>}
                  </div>
                  {/* Order is boxed and waiting — the single most useful thing we can
                      tell them, so it sits above everything else. */}
                  {appointment.stagedSpot && (
                    <div className="bg-[#4a7c59] text-white px-6 py-7 text-center">
                      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#d8e6c8]">
                        Staged and waiting
                      </div>
                      <div className="font-display text-5xl sm:text-6xl font-black leading-none mt-2 mb-1 break-words">
                        {appointment.stagedSpot}
                      </div>
                      <p className="text-base text-white/90 font-semibold mt-3">
                        Look for it when you arrive at {appointment.location.name}.
                      </p>
                    </div>
                  )}
                  <div className="px-5 sm:px-6 py-5">
                    <LocationBadge name={appointment.location.name} />
                    {appointment.location.address && <div className="text-sm text-[#6f5b46] mt-1.5">{appointment.location.address}</div>}
                    {appointment.location.instructions && (
                      <div className="text-sm text-[#6f5b46] mt-3 bg-[#faf5ea] border border-[#e3d6bf] rounded-xl px-4 py-3 leading-relaxed">{appointment.location.instructions}</div>
                    )}
                    <button type="button" onClick={() => downloadAppointmentIcs(appointment)}
                      className="mt-4 inline-flex items-center gap-2 bg-white hover:bg-[#faf5ea] border border-[#cdbda3] text-[#6c4d39] font-bold text-sm px-4 py-2.5 rounded-xl transition-colors">
                      <IcoCalendar className="w-4 h-4" />
                      Add to calendar
                    </button>

                    {/* Let them close it out themselves — saves staff chasing it. */}
                    <button
                      type="button"
                      onClick={() => collectById(appointment.id)}
                      disabled={busy}
                      className="mt-3 w-full inline-flex items-center justify-center gap-2 bg-[#4a7c59] hover:bg-[#3d6749] disabled:opacity-50 text-white font-bold text-base py-3.5 rounded-xl transition-colors"
                    >
                      <IcoCheck className="w-5 h-5" /> I picked up my order
                    </button>
                  </div>
                </div>

                {/* Items on this pickup */}
                <div>
                  <div className="flex items-baseline justify-between gap-3 mb-3">
                    <h2 className="font-display text-xl font-black text-[#241a12]">On this pickup</h2>
                    <span className="text-xs font-bold text-[#8a7559]">{appointment.items.length} item{appointment.items.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="space-y-4">
                    {groupByAuction(appointment.items).map(([auctionTitle, items]) => (
                      <div key={auctionTitle}>
                        <div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#8a7559] mb-2">{auctionTitle}</div>
                        <div className="space-y-2">
                          {items.map((it) => (
                            <div key={it.id} className="flex items-center gap-3 bg-white border border-[#e3d6bf] rounded-xl px-3.5 py-3">
                              <ItemPhoto url={it.photo} title={it.title} />
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-sm text-[#241a12] leading-snug">{it.title}</div>
                                {/* Once the order is staged, every item is in the staged
                                    box — the shelf it used to sit on is stale, and showing
                                    both would send the customer to two different places. */}
                                {!appointment.stagedSpot && it.storageLocation && (
                                  <div className="mt-1 text-xs text-[#6f5b46]">Find it at <SpotChip spot={it.storageLocation} /></div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-sm text-[#6f5b46] bg-[#faf5ea] border border-[#e3d6bf] rounded-xl px-4 py-3 flex items-start gap-2">
                  <IcoTarget className="w-4 h-4 text-[#6c4d39] shrink-0 mt-0.5" />
                  <span>
                    {transferCount > 0
                      ? `${transferCount} more item${transferCount !== 1 ? "s are" : " is"} riding over (see below) and will join this pickup on arrival. `
                      : ""}
                    Anything new you win joins this pickup automatically — wins at the other warehouse ride over to {preferredName} first.
                  </span>
                </p>

                <NextSteps hasAppointment transferring={transferCount > 0} />

                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={() => setRescheduling(true)} className="flex-1 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold text-sm py-3.5 rounded-xl transition-colors">
                    {apptPassed ? "Pick a new time" : "Reschedule"}
                  </button>
                  <button onClick={cancel} disabled={busy} className="flex-1 bg-white border border-red-500/30 text-red-600 hover:bg-red-50 disabled:opacity-50 font-bold text-sm py-3.5 rounded-xl transition-colors">
                    Cancel pickup
                  </button>
                </div>
              </>
            )}

            {/* Rescheduling (time only — at the appointment's own location). Use that
                location's live slots so what's shown is exactly what gets booked. */}
            {appointment && rescheduling && (() => {
              const apptSched = locations.find((l) => l.id === appointment.location.id);
              return (
                <div className="bg-white border-2 border-[#6c4d39]/25 rounded-2xl px-5 sm:px-6 py-5 space-y-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Eyebrow>Reschedule</Eyebrow>
                      <h2 className="font-display text-2xl font-black text-[#241a12] mt-0.5">Pick a new window</h2>
                    </div>
                    <button onClick={() => setRescheduling(false)} className="text-sm text-[#6c4d39] hover:text-[#563e2c] font-bold">Keep current</button>
                  </div>
                  {apptSched ? (
                    <SlotPicker location={apptSched} onBook={(_loc, startsAt) => reschedule(appointment.location.id, startsAt)} busy={busy} submitLabel="Update pickup" />
                  ) : (
                    <div className="rounded-xl border border-dashed border-[#cdbda3] bg-[#faf5ea] px-4 py-6 text-sm text-[#6f5b46] text-center">
                      This warehouse isn&apos;t taking bookings right now. You can cancel this pickup, or reach out and we&apos;ll sort it.
                    </div>
                  )}
                </div>
              );
            })()}

            {/* No appointment yet: schedule the ready items */}
            {!appointment && (
              ready.length > 0 ? (
                <>
                  <div className="bg-white border-2 border-[#6c4d39]/25 rounded-2xl px-5 sm:px-6 py-5 space-y-5">
                    <div>
                      <Eyebrow tone="moss">Ready at {preferredName}</Eyebrow>
                      <h2 className="font-display text-2xl font-black text-[#241a12] mt-0.5">
                        {ready.length} item{ready.length !== 1 ? "s" : ""} paid and waiting
                      </h2>
                      <p className="text-sm text-[#6f5b46] mt-1">
                        Pick a window below{transferCount > 0 ? ". Your transferring items can be added once they arrive" : ""}.
                      </p>
                      <ul className="mt-3 space-y-1.5">
                        {ready.map((it) => (<ItemLine key={it.id} title={it.title} extra={<SpotChip spot={it.storageLocation} />} />))}
                      </ul>
                    </div>
                    {preferredSched ? (
                      <SlotPicker location={preferredSched} onBook={book} busy={busy} submitLabel="Book pickup" />
                    ) : (
                      <div className="rounded-xl border border-dashed border-[#cdbda3] bg-[#faf5ea] px-4 py-6 text-sm text-[#6f5b46] text-center">No open windows right now.</div>
                    )}
                  </div>
                  <NextSteps hasAppointment={false} transferring={transferCount > 0} />
                </>
              ) : transferCount > 0 ? (
                <div className="rounded-2xl border border-[#e3d6bf] bg-white px-5 py-5 flex items-start gap-3">
                  <span className="w-10 h-10 rounded-xl bg-[#f0a35a]/15 text-[#a85f28] flex items-center justify-center shrink-0">
                    <IcoTruck className="w-5 h-5" />
                  </span>
                  <div className="text-sm text-[#6f5b46]">
                    <p className="font-display font-bold text-[#241a12] text-base">Nothing to grab just yet</p>
                    <p className="mt-0.5 leading-relaxed">Your items are on their way to {preferredName}. We text you the moment they land, then you book a time.</p>
                  </div>
                </div>
              ) : null
            )}

            {/* Being transferred */}
            {transferCount > 0 && (
              <div>
                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <h2 className="font-display text-xl font-black text-[#241a12]">Moving to {preferredName}</h2>
                  <span className="text-xs font-bold text-[#8a7559]">{transferCount} item{transferCount !== 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-3">
                  {pendingTransfers.map((t) => (
                    <div key={t.id} className="relative rounded-2xl border border-[#c47b3e]/35 bg-white overflow-hidden">
                      <span className="absolute left-0 top-4 bottom-4 w-1.5 rounded-full bg-[#c47b3e]" aria-hidden />
                      <div className="pl-6 pr-5 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-sm font-bold text-[#241a12]">
                            <IcoTruck className="w-4 h-4 text-[#a85f28]" />
                            {t.items.length} item{t.items.length !== 1 ? "s" : ""} on the way
                          </div>
                          <span className="text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-black shrink-0 bg-[#f0a35a]/15 text-[#8a4f1c] border border-[#c47b3e]/30">
                            {t.status === "LOADED" ? "On the truck" : "Being gathered"}
                          </span>
                        </div>
                        <p className="text-xs text-[#6f5b46] mt-1.5">Usually 5 to 6 days. We text you at drop-off and they join your pickup on their own.</p>
                        <ul className="mt-3 space-y-1.5">
                          {t.items.map((it) => (
                            <ItemLine key={it.id} title={it.title} extra={<span className="text-[#8a7559] text-xs">from {it.fromLocationName}</span>} />
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pick up at other locations — non-transferable items at their own warehouse */}
            {(otherAppointments.length > 0 || otherLocationGroups.length > 0) && (
              <div className="pt-2">
                <h2 className="font-display text-xl font-black text-[#241a12]">Collect at the other warehouse</h2>
                <p className="text-xs text-[#8a7559] mt-1 mb-3">A few things can&apos;t ride the truck. These stay where you won them.</p>
                <div className="space-y-4">
                  {otherAppointments.map((a) => (
                    <div key={a.id} className="bg-white border-2 border-[#4a7c59]/40 rounded-2xl overflow-hidden">
                      <div className="bg-[#4a7c59]/10 px-5 py-4">
                        <Eyebrow tone="moss">Booked</Eyebrow>
                        <div className="font-display text-xl font-black text-[#2f5d3a] mt-0.5">{fmtDateTime(a.startsAt)}</div>
                      </div>
                      <div className="px-5 py-4">
                        <LocationBadge name={a.location.name} />
                        {a.location.address && <div className="text-sm text-[#6f5b46] mt-1.5">{a.location.address}</div>}
                        <ul className="mt-3 space-y-1.5">
                          {a.items.map((it) => (<ItemLine key={it.id} title={it.title} extra={<SpotChip spot={it.storageLocation} />} />))}
                        </ul>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => downloadAppointmentIcs(a)} className="inline-flex items-center gap-2 bg-white hover:bg-[#faf5ea] border border-[#cdbda3] text-[#6c4d39] font-bold text-sm px-4 py-2 rounded-xl transition-colors">
                            <IcoCalendar className="w-4 h-4" /> Add to calendar
                          </button>
                          <button type="button" onClick={() => cancelById(a.id)} disabled={busy} className="bg-white border border-red-500/30 text-red-600 hover:bg-red-50 disabled:opacity-50 font-bold text-sm px-4 py-2 rounded-xl transition-colors">Cancel</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {otherLocationGroups.map(([locId, items]) => {
                    const sched = locations.find((l) => l.id === locId);
                    const name = items[0]?.locationName ?? sched?.name ?? "this location";
                    return (
                      <div key={locId} className="bg-white border-2 border-[#c47b3e]/35 rounded-2xl px-5 sm:px-6 py-5 space-y-5">
                        <div>
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <LocationBadge name={name} />
                            <span className="text-[10px] uppercase tracking-wider font-black text-[#8a4f1c]">Stays put</span>
                          </div>
                          <p className="text-sm text-[#6f5b46]">Collect {items.length === 1 ? "this item" : "these items"} at {name}. Pick a window below.</p>
                          <ul className="mt-2.5 space-y-1.5">
                            {items.map((it) => (<ItemLine key={it.id} title={it.title} extra={<SpotChip spot={it.storageLocation} />} />))}
                          </ul>
                        </div>
                        {sched ? (
                          <SlotPicker location={sched} onBook={book} busy={busy} submitLabel={`Book at ${name}`} />
                        ) : (
                          <div className="rounded-xl border border-dashed border-[#cdbda3] bg-[#faf5ea] px-4 py-6 text-sm text-[#6f5b46] text-center">No open windows at {name} right now.</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* In-app confirmation — native confirm() is blocked in the installed app. */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#241a12]/50 px-4" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white rounded-2xl border border-[#cdbda3] max-w-sm w-full p-6 shadow-xl text-left" onClick={(e) => e.stopPropagation()}>
            <p className="text-base text-[#241a12] leading-relaxed">{confirmDialog.text}</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-white border border-[#cdbda3] text-[#6f5b46] hover:bg-[#faf5ea] font-bold text-sm py-3 rounded-xl">
                Back
              </button>
              <button
                onClick={() => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); fn(); }}
                className={`flex-1 text-white font-bold text-sm py-3 rounded-xl ${
                  confirmDialog.danger ? "bg-red-600 hover:bg-red-700" : "bg-[#4a7c59] hover:bg-[#3d6749]"
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
