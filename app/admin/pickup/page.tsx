"use client";
import { useState, useEffect, useCallback, Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { IcoCheck } from "@/app/components/BidIcons";
import MessageSheet, { type MessageTarget } from "../MessageSheet";
import PrintLabelButton from "../PrintLabelButton";
import DoorCodePanel from "./DoorCodePanel";
import { PageHeader, PageBody, Pill, Eyebrow, Btn, Input, SearchBox, Segmented, Empty, Notice, Progress, Disclosure } from "../ui";

// PrintLabelButton renders an <a target="_blank">, so it can't be a Btn — give it the
// kit's outline-button look instead (same height, radius, tone).
const printBtnCls =
  "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors whitespace-nowrap min-h-[44px] px-4 text-[15px] bg-white border-2 border-[#d9c7ab] text-[#563e2c] hover:bg-[#faf5ea]";
// Select shares the kit Input look (the kit only ships a text input).
const fieldCls =
  "w-full min-h-[50px] bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-4 text-[#241a12] placeholder:text-[#b3a085] outline-none transition";
const labelCls = "text-[13px] font-black uppercase tracking-[0.14em] text-[#8a7559] mb-1 block";
const SPOT_PREFIX_KEY = "nb-pickup-spot-prefix";

/** Right-pointing arrow for "from -> to" routes. */
const ArrowRight = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[#a3927b] shrink-0"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
);
/** Chevron that flips when a row is open. */
const Chevron = ({ open, size = 18 }: { open: boolean; size?: number }) => (
  <span className={`text-[#cdbda3] shrink-0 transition-transform ${open ? "rotate-180" : ""}`}>
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
  </span>
);

// ── Types ────────────────────────────────────────────────────────────────────
interface Location {
  id: string;
  name: string;
  isActive: boolean;
}
interface ApptItem {
  id: string;
  title: string;
  itemCode: string | null;
  storageLocation: string | null;
  /** Ticked off the gather list. Persisted, so it survives refresh. */
  grabbed: boolean;
  /** Just landed via transfer — auto-joined this appointment, but nobody has shelved it yet. */
  needsPlacement?: boolean;
  photo: string | null;
}
interface Bidder {
  name: string | null;
  email: string | null;
  phone: string | null;
}

// Lots of bidders never set a name, so the email is often the only way to tell
// two "Unknown Bidder" rows apart. Primary line = name or, failing that, email;
// secondary = email (when a name exists) or phone.
function bidderPrimary(b: Bidder) {
  return b.name || b.email || b.phone || "Unknown bidder";
}
function bidderSecondary(b: Bidder) {
  if (b.name) return b.email || b.phone || null; // name shown above, add contact
  if (b.email) return b.phone || null;           // email is the primary, add phone
  return null;
}
interface WaitingItem {
  id: string;
  title: string;
  itemCode: string | null;
  grabbed: boolean;
  gatherSpot: string | null;
  storageLocation: string | null;
  warehouse: string | null;
  transferring: boolean;
  needsPlacement: boolean;
}
interface WaitingRow {
  clerkUserId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  items: number;
  itemList: WaitingItem[];
  gatherSpot: string | null;
  gatheredCount: number;
  gatherableCount: number;
  locationName: string | null;
  hasLocation: boolean;
  waitingDays: number;
}
interface WaitingData {
  rows: WaitingRow[];
  totals: { people: number; items: number; noLocation: number };
}
interface Appointment {
  id: string;
  startsAt: string;
  status: "SCHEDULED" | "COLLECTED" | "CANCELLED";
  notes: string | null;
  stagedSpot: string | null;
  // Present only at locations with smart locks. code is null until one is made.
  door: { code: string | null; status: string | null; sentAt: string | null; locks: { id: string; name: string }[] } | null;
  clerkUserId: string;
  locationId: string;
  location: { id: string; name: string };
  items: ApptItem[];
  bidder: Bidder;
}
interface TransferItem {
  id: string;
  title: string;
  itemCode: string | null;
  grabbed: boolean;
  gatherSpot: string | null;
  fromLocationName: string | null;
  storageLocation: string | null;
}
interface Transfer {
  id: string;
  status: "REQUESTED" | "LOADED" | "COMPLETED" | "CANCELLED";
  gatherSpot: string | null;
  createdAt: string;
  completedAt: string | null;
  clerkUserId: string;
  toLocation: { id: string; name: string };
  bidder: Bidder;
  items: TransferItem[];
}
type Tab = "today" | "upcoming" | "waiting" | "transfers";
const TABS: Tab[] = ["today", "upcoming", "waiting", "transfers"];
const TAB_LABEL: Record<Tab, string> = { today: "Today", upcoming: "Coming up", waiting: "Waiting", transfers: "Transfers" };

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
/** Just the clock time — the day is already implied by the section it's in. */
function fmtTimeOnly(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Detroit",
    hour: "numeric",
    minute: "2-digit",
  });
}
/** "Wed Oct 15" for the Coming up list. */
function fmtDayShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Detroit", weekday: "short", month: "short", day: "numeric" });
}
/** Michigan-local YYYY-MM-DD, so "today" means today in the warehouse, not UTC. */
function detroitDayKey(d: Date | string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Detroit",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(d));
}
// ISO -> value usable by <input type="datetime-local"> in Michigan time
function isoToLocalInput(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Detroit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const hour = m.hour === "24" ? "00" : m.hour;
  return `${m.year}-${m.month}-${m.day}T${hour}:${m.minute}`;
}
// datetime-local value (Michigan wall time) -> UTC ISO string
function localInputToIso(local: string) {
  // local is "YYYY-MM-DDTHH:mm" interpreted as Michigan time.
  const [datePart, timePart] = local.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const naive = Date.UTC(y, mo - 1, d, hh, mm);
  // figure out Michigan offset at that instant
  const probe = new Date(naive);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Detroit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(probe);
  const p: Record<string, string> = {};
  for (const x of fmt) p[x.type] = x.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour === 24 ? 0 : +p.hour, +p.minute, +p.second);
  const offset = asUtc - probe.getTime();
  return new Date(naive - offset).toISOString();
}
/** One lowercase haystack out of whatever's worth searching on a card. */
function hay(parts: (string | null | undefined)[]) {
  return parts.filter(Boolean).join(" ").toLowerCase();
}
/** "Box 4" -> "Box", "Shelf B" -> "Shelf", "B4" -> null. Remembered as a chip. */
function spotPrefixOf(spot: string): string | null {
  const m = spot.trim().match(/^([A-Za-z]+)\s+\S/);
  return m ? m[1] : null;
}
const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? "s" : ""}`;

// ── Small shared pieces ──────────────────────────────────────────────────────

/** One gather row: tick box, photo (when we have one), tag, title. Tap anywhere to tick. */
function TickRow({
  checked, onToggle, photo, code, title, meta,
}: { checked: boolean; onToggle?: () => void; photo?: string | null; code: string | null; title: string; meta?: ReactNode }) {
  const inner = (
    <>
      <span className={`w-7 h-7 shrink-0 rounded-lg border-2 grid place-items-center ${
        checked ? "bg-[#4a7c59] border-[#4a7c59] text-white" : "bg-white border-[#d9c7ab] text-transparent"
      }`}>
        <IcoCheck className="w-4 h-4" />
      </span>
      {photo !== undefined && (
        <span className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-[#efe3d0] grid place-items-center">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className={`w-full h-full object-cover ${checked ? "opacity-60" : ""}`} />
          ) : null}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 flex-wrap">
          {code && (
            <span className="font-mono font-extrabold text-[#563e2c] bg-[#f1e7d5] border border-[#d9c7ab] rounded px-1.5 py-0.5 text-[15px]">{code}</span>
          )}
          {meta}
        </span>
        <span className={`block mt-0.5 leading-snug line-clamp-2 ${checked ? "text-[#8a7559] line-through" : "text-[#241a12]"}`}>{title}</span>
      </span>
    </>
  );
  const cls = `w-full min-w-0 min-h-[56px] flex items-center gap-3 rounded-xl px-3 py-2.5 border-2 text-left transition-colors ${
    checked ? "bg-[#e6f1e8] border-[#bfd9c5]" : "bg-white border-[#e6dac6]"
  }`;
  if (!onToggle) return <div className={cls}>{inner}</div>;
  return <button type="button" onClick={onToggle} className={`${cls} active:bg-[#faf5ea]`}>{inner}</button>;
}

/** The Spot box: free text, Enter saves, and a chip offers the last prefix used ("Box"). */
function SpotEditor({
  value, onChange, onSave, onCancel, onClear, prefix, saveLabel, placeholder,
}: {
  value: string; onChange: (v: string) => void; onSave: () => void; onCancel: () => void; onClear?: () => void;
  prefix: string | null; saveLabel: string; placeholder: string;
}) {
  const showChip = !!prefix && !value.trim().toLowerCase().startsWith(prefix.toLowerCase());
  return (
    <div className="mt-4 bg-[#f4ede1] border border-[#e6dac6] rounded-xl p-4">
      <label className={labelCls}>Spot</label>
      <div className="flex gap-2">
        <Input
          type="text"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) onSave(); }}
          placeholder={placeholder}
          className="font-display text-2xl font-black"
        />
        {showChip && (
          <Btn type="button" tone="slate" variant="outline" onClick={() => onChange(`${prefix} `)} className="shrink-0">
            {prefix}
          </Btn>
        )}
      </div>
      <div className="flex gap-2 mt-3">
        <Btn onClick={onSave} disabled={!value.trim()} tone="amber" className="flex-1">{saveLabel}</Btn>
        <Btn onClick={onCancel} tone="slate" variant="outline" className="flex-1">Cancel</Btn>
      </div>
      {onClear && (
        <Btn onClick={onClear} tone="red" variant="ghost" full className="mt-2">Clear spot</Btn>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AdminPickupPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Pickup" />
          <PageBody wide><div className="text-center py-20 text-[#8a7559]">Loading…</div></PageBody>
        </>
      }
    >
      <PickupBoard />
    </Suspense>
  );
}

function PickupBoard() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const t = params.get("tab");
    return (TABS as string[]).includes(t ?? "") ? (t as Tab) : "today";
  });
  const [search, setSearch] = useState(() => params.get("q") ?? "");
  // Deep links (Today cards, auction results) can change the URL without
  // remounting this page — follow them.
  const paramTab = params.get("tab");
  const paramQ = params.get("q");
  useEffect(() => {
    if (paramTab !== null) {
      const t = setTimeout(() => {
        if ((TABS as string[]).includes(paramTab)) setTab(paramTab as Tab);
        setSearch(paramQ ?? "");
      }, 0);
      return () => clearTimeout(t);
    }
  }, [paramTab, paramQ]);
  const [selectedApptId, setSelectedApptId] = useState<string | null>(null);
  const [showCollected, setShowCollected] = useState(false);
  const [showCompletedTransfers, setShowCompletedTransfers] = useState(false);
  const [expandedTransferId, setExpandedTransferId] = useState<string | null>(null);
  // Waiting list: expand a person to gather their items even before they book.
  const [expandedWaitingId, setExpandedWaitingId] = useState<string | null>(null);
  // One Spot box open at a time: "appt:<id>" (stage), "waiting:<id>" or "transfer:<id>" (gather spot).
  const [spotEdit, setSpotEdit] = useState<{ key: string; value: string } | null>(null);
  // The prefix chip ("Box", "Shelf") — only rendered after a tap, so reading
  // localStorage in the initializer can't cause a hydration mismatch.
  const [spotPrefix, setSpotPrefix] = useState<string | null>(() => {
    try { return typeof window === "undefined" ? null : localStorage.getItem(SPOT_PREFIX_KEY); } catch { return null; }
  });
  const rememberPrefix = (spot: string) => {
    const p = spotPrefixOf(spot);
    if (!p) return;
    setSpotPrefix(p);
    try { localStorage.setItem(SPOT_PREFIX_KEY, p); } catch {}
  };
  // Which warehouse's pickups to show ("all" = both). You work one building at a time.
  // Remembered per device — an owner sets the warehouse once per shift. Lazy
  // init reads it on the client's first render; the server render says "all".
  const [apptLocationId, setApptLocationIdRaw] = useState<string>("all");
  const [scopeHydrated, setScopeHydrated] = useState(false);
  const setApptLocationId = useCallback((v: string) => {
    setApptLocationIdRaw(v);
    try { localStorage.setItem("nb-pickup-warehouse", v); } catch {}
  }, []);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [waiting, setWaiting] = useState<WaitingData | null>(null);
  const [msgTarget, setMsgTarget] = useState<MessageTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  // In-app confirmation (native confirm() is blocked in some installed/PWA webviews).
  const [confirmDialog, setConfirmDialog] = useState<
    { text: string; confirmLabel: string; danger?: boolean; onConfirm: () => void } | null
  >(null);
  const askConfirm = (
    text: string,
    onConfirm: () => void,
    opts?: { confirmLabel?: string; danger?: boolean }
  ) => setConfirmDialog({ text, onConfirm, confirmLabel: opts?.confirmLabel ?? "Confirm", danger: opts?.danger });

  const loadAppointments = useCallback(() => {
    return fetch("/api/admin/pickup/appointments")
      .then((r) => r.json())
      .then((d) => setAppointments(d.appointments ?? []))
      .catch(() => {});
  }, []);
  const loadLocations = useCallback(() => {
    return fetch("/api/admin/pickup/locations")
      .then((r) => r.json())
      .then((d) => setLocations(d.locations ?? []))
      .catch(() => {});
  }, []);
  const loadTransfers = useCallback(() => {
    return fetch("/api/admin/pickup/transfers")
      .then((r) => r.json())
      .then((d) => setTransfers(d.transfers ?? []))
      .catch(() => {});
  }, []);
  const loadWaiting = useCallback(() => {
    return fetch("/api/admin/pickup/waiting")
      .then((r) => r.json())
      .then((d) => setWaiting(d.rows ? d : null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([loadAppointments(), loadLocations(), loadTransfers(), loadWaiting()]).finally(() => setLoading(false));
  }, [loadAppointments, loadLocations, loadTransfers, loadWaiting]);

  // Restore the remembered warehouse once, off the render path.
  useEffect(() => {
    if (scopeHydrated) return;
    const t = setTimeout(() => {
      try { const s = localStorage.getItem("nb-pickup-warehouse"); if (s) setApptLocationIdRaw(s); } catch {}
      setScopeHydrated(true);
    }, 0);
    return () => clearTimeout(t);
  }, [scopeHydrated]);

  // "Now", refreshed every minute, so a pickup turns Late while the board sits open.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  };

  // ── "Where did it go?" fallback ──
  // The search box filters every tab locally. When NOTHING on the board matches,
  // ask the server for the item's one honest location (it also heals dangling links).
  type Located = {
    id: string; title: string; itemCode: string | null; status: string;
    warehouse: { id: string; name: string } | null; storageLocation: string | null; gatherSpot: string | null;
    owner: { clerkUserId: string; name: string | null; phone: string | null } | null;
    place:
      | { kind: "collected"; pickedUpAt: string | null; appointmentId: string | null }
      | { kind: "appointment"; appointmentId: string; startsAt: string; status: string; locationId: string; locationName: string; stagedSpot: string | null }
      | { kind: "transfer"; transferId: string; status: string; toLocationId: string; toLocationName: string; stagedSpot: string | null }
      | { kind: "loose" }
      | { kind: "not_won" };
  };
  const [located, setLocated] = useState<Located[] | null>(null);

  const scrollTo = (id: string) =>
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);

  // Jump straight to wherever the item is, switching tab + warehouse as needed.
  const jumpTo = (r: Located) => {
    const p = r.place;
    setSearch("");
    if (p.kind === "appointment") {
      setTab(detroitDayKey(p.startsAt) <= detroitDayKey(new Date()) ? "today" : "upcoming");
      setApptLocationId(p.locationId);
      setSelectedApptId(p.appointmentId);
      scrollTo(`appt-${p.appointmentId}`);
    } else if (p.kind === "transfer") {
      setTab("transfers");
      setExpandedTransferId(p.transferId);
      scrollTo(`transfer-${p.transferId}`);
    } else if (p.kind === "loose") {
      setTab("waiting");
      if (r.warehouse) setApptLocationId(r.warehouse.id);
      if (r.owner) { setExpandedWaitingId(r.owner.clerkUserId); scrollTo(`waiting-${r.owner.clerkUserId}`); }
    } else if (p.kind === "collected") {
      setTab("today");
      setShowCollected(true);
      if (p.appointmentId) { setSelectedApptId(p.appointmentId); scrollTo(`appt-${p.appointmentId}`); }
    }
  };

  const [addingApptId, setAddingApptId] = useState<string | null>(null);
  // Add loose / just-arrived items to a customer's existing appointment. Reloads
  // the waiting list + appointments so the item moves onto the order.
  const addToAppointment = async (appt: Appointment, itemIds: string[]) => {
    if (itemIds.length === 0) return;
    setAddingApptId(appt.id);
    try {
      const res = await fetch(`/api/admin/pickup/appointments/${appt.id}/add-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds }),
      });
      const data = await res.json();
      if (data.success) {
        const when = new Date(appt.startsAt).toLocaleString("en-US", { timeZone: "America/Detroit", weekday: "short", hour: "numeric", minute: "2-digit" });
        flash(
          `Added ${plural(data.added, "item")} to ${bidderPrimary(appt.bidder)}'s ${when} pickup at ${appt.location.name}${data.unstaged ? " — re-gather and re-stage it" : ""}.`,
          true
        );
        await Promise.all([loadWaiting(), loadAppointments()]);
        // NEVER let the item vanish from view: if that pickup is at a warehouse the
        // board is currently hiding, switch to it, then open the pickup it went onto.
        if (apptLocationId !== "all" && apptLocationId !== appt.locationId) setApptLocationId(appt.locationId);
        setTab(detroitDayKey(appt.startsAt) <= detroitDayKey(new Date()) ? "today" : "upcoming");
        setSelectedApptId(appt.id);
        scrollTo(`appt-${appt.id}`);
      } else {
        flash(data.error || "Couldn't add to the pickup.", false);
      }
    } catch {
      flash("Something went wrong.", false);
    } finally {
      setAddingApptId(null);
    }
  };

  // Owner override: mark item(s) picked up directly — a fast cleanup for stuck /
  // problem orders that aren't on a scheduled appointment (walk-ins, data hiccups).
  // Stamps each item PICKED_UP via the per-item endpoint, then refreshes.
  const [markingPickedId, setMarkingPickedId] = useState<string | null>(null);
  const markPickedUp = async (key: string, itemIds: string[]) => {
    if (itemIds.length === 0) return;
    setMarkingPickedId(key);
    try {
      const results = await Promise.all(
        itemIds.map((id) =>
          fetch(`/api/admin/items/${id}/pickup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pickedUp: true }),
          }).then((r) => r.ok).catch(() => false)
        )
      );
      const ok = results.filter(Boolean).length;
      if (ok > 0) {
        flash(`Marked ${plural(ok, "item")} picked up.`, true);
        await Promise.all([loadWaiting(), loadAppointments(), loadTransfers()]);
      } else {
        flash("Couldn't mark those picked up.", false);
      }
    } catch {
      flash("Something went wrong.", false);
    } finally {
      setMarkingPickedId(null);
    }
  };

  // Per-item "Picked up" list — lives under More so a single handed-off item can be
  // cleared on its own without collecting the whole order.
  const partialPickupList = (items: { id: string; title: string; itemCode: string | null }[]) => (
    <div>
      <Eyebrow className="mb-2">Picked up one at a time</Eyebrow>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 min-h-[44px]">
            {it.itemCode && <span className="font-mono font-bold text-[#6c4d39] text-[15px] shrink-0">{it.itemCode}</span>}
            <span className="truncate flex-1 min-w-0 text-[15px] text-[#4a3a2b]">{it.title}</span>
            <Btn
              type="button"
              onClick={() => askConfirm("Mark this one item as picked up?", () => markPickedUp(it.id, [it.id]), { confirmLabel: "Picked up" })}
              disabled={markingPickedId === it.id}
              tone="green"
              variant="outline"
              size="sm"
              className="shrink-0"
            >
              {markingPickedId === it.id ? "…" : "Picked up"}
            </Btn>
          </li>
        ))}
      </ul>
    </div>
  );

  // ── Appointment actions ──────────────────────────────────────────────────
  const [editingApptId, setEditingApptId] = useState<string | null>(null);
  const [editStartsAt, setEditStartsAt] = useState("");
  const [editLocationId, setEditLocationId] = useState("");

  const startEdit = (a: Appointment) => {
    setEditingApptId(a.id);
    setEditStartsAt(isoToLocalInput(a.startsAt));
    setEditLocationId(a.locationId);
  };

  const saveReschedule = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/pickup/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt: localInputToIso(editStartsAt),
          locationId: editLocationId,
        }),
      });
      const d = await res.json();
      if (d.success) {
        flash("Pickup rescheduled.", true);
        setEditingApptId(null);
        loadAppointments();
      } else flash(d.error || "Could not update.", false);
    } catch {
      flash("Something went wrong.", false);
    }
  };

  // Tick an item off the gather list. Optimistic so the checkmark lands instantly
  // while you're walking — waiting on a round trip per item would be unusable.
  const toggleGrab = async (apptId: string, itemId: string, next: boolean) => {
    setAppointments((prev) =>
      prev.map((a) =>
        a.id !== apptId
          ? a
          : { ...a, items: a.items.map((it) => (it.id === itemId ? { ...it, grabbed: next } : it)) }
      )
    );
    try {
      const res = await fetch(`/api/admin/pickup/items/${itemId}/grab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grabbed: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Put it back if the server refused, so the screen never lies.
      setAppointments((prev) =>
        prev.map((a) =>
          a.id !== apptId
            ? a
            : { ...a, items: a.items.map((it) => (it.id === itemId ? { ...it, grabbed: !next } : it)) }
        )
      );
      flash("Couldn't save that. Try again.", false);
    }
  };

  // Gather-checklist toggle for a transfer's items (optimistic), same endpoint as
  // appointment gathering.
  const toggleTransferGrab = async (transferId: string, itemId: string, next: boolean) => {
    setTransfers((prev) =>
      prev.map((t) => (t.id === transferId ? { ...t, items: t.items.map((i) => (i.id === itemId ? { ...i, grabbed: next } : i)) } : t))
    );
    try {
      const res = await fetch(`/api/admin/pickup/items/${itemId}/grab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grabbed: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTransfers((prev) =>
        prev.map((t) => (t.id === transferId ? { ...t, items: t.items.map((i) => (i.id === itemId ? { ...i, grabbed: !next } : i)) } : t))
      );
      flash("Couldn't update the gather list.", false);
    }
  };

  // Gather-checklist toggle for a WAITING person's items (optimistic).
  const toggleWaitingGrab = async (clerkUserId: string, itemId: string, next: boolean) => {
    setWaiting((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r) =>
              r.clerkUserId === clerkUserId
                ? {
                    ...r,
                    itemList: r.itemList.map((i) => (i.id === itemId ? { ...i, grabbed: next } : i)),
                    gatheredCount: r.itemList.filter((i) => (i.id === itemId ? next : i.grabbed) && !i.transferring).length,
                  }
                : r
            ),
          }
        : prev
    );
    try {
      const res = await fetch(`/api/admin/pickup/items/${itemId}/grab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grabbed: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      flash("Couldn't update the gather list.", false);
      loadWaiting();
    }
  };

  // Set the internal gather spot for a waiting customer's bundle (before they book).
  const saveWaitingGatherSpot = async (clerkUserId: string, itemIds: string[], spot: string) => {
    try {
      const res = await fetch(`/api/admin/pickup/gather-spot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spot, itemIds }),
      });
      const d = await res.json();
      if (d.success) {
        setSpotEdit(null);
        rememberPrefix(spot);
        flash(spot.trim() ? `Spot set to ${spot.trim()}.` : "Spot cleared.", true);
        loadWaiting();
      } else flash(d.error || "Could not set the spot.", false);
    } catch {
      flash("Could not set the spot.", false);
    }
  };

  // Set the internal GATHER spot for a transfer bundle (where your team set it aside
  // to move). Not customer-facing — that's staging, which only happens on booked
  // pickups at the destination. Applies to the items you gather at THIS warehouse.
  const saveTransferGatherSpot = async (id: string, itemIds: string[], spot: string) => {
    try {
      const res = await fetch(`/api/admin/pickup/gather-spot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spot, itemIds }),
      });
      const d = await res.json();
      if (d.success) {
        setSpotEdit(null);
        rememberPrefix(spot);
        flash(spot.trim() ? `Spot set to ${spot.trim()}.` : "Spot cleared.", true);
        loadTransfers();
      } else flash(d.error || "Could not set the spot.", false);
    } catch {
      flash("Could not set the spot.", false);
    }
  };

  // Undo an accidental "Loaded" — back to still-gathering (REQUESTED).
  const unloadTransfer = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/pickup/transfers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REQUESTED" }),
      });
      const d = await res.json();
      if (d.success) {
        flash("Un-loaded — back to gathering.", true);
        loadTransfers();
      } else flash(d.error || "Could not un-load that transfer.", false);
    } catch {
      flash("Could not un-load that transfer.", false);
    }
  };

  // Undo a drop-off. The server restores each item's original warehouse from the
  // snapshot taken at completion, so a transfer that gathered from two places
  // unwinds correctly rather than dumping everything at one location.
  const revertTransfer = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/pickup/transfers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "LOADED" }),
      });
      const d = await res.json();
      if (d.success) {
        flash("Drop-off undone — items are back at their original warehouse.", true);
        setExpandedTransferId(null);
        loadTransfers();
      } else flash(d.error || "Could not undo that drop-off.", false);
    } catch {
      flash("Could not undo that drop-off.", false);
    }
  };

  // Undo a collection. Puts the appointment back to SCHEDULED and its items back
  // to waiting — the fix for a mis-tap, which previously needed a DB edit.
  const reopenAppt = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/pickup/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SCHEDULED" }),
      });
      const d = await res.json();
      if (d.success) {
        flash("Pickup reopened — items are waiting again.", true);
        setSelectedApptId(null);
        loadAppointments();
      } else flash(d.error || "Could not reopen that pickup.", false);
    } catch {
      flash("Could not reopen that pickup.", false);
    }
  };

  // Stage (or re-label) a whole order in one spot. Blank spot un-stages it.
  const saveStage = async (id: string, spot: string) => {
    try {
      const res = await fetch(`/api/admin/pickup/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stagedSpot: spot }),
      });
      const d = await res.json();
      if (d.success) {
        flash(spot.trim() ? `Staged in ${spot.trim()}.` : "Un-staged.", true);
        setSpotEdit(null);
        rememberPrefix(spot);
        loadAppointments();
      } else flash(d.error || "Could not stage the order.", false);
    } catch {
      flash("Could not stage the order.", false);
    }
  };

  const markCollected = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/pickup/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COLLECTED" }),
      });
      const d = await res.json();
      if (d.success) {
        flash("Picked up.", true);
        loadAppointments();
      } else flash(d.error || "Could not update.", false);
    } catch {
      flash("Something went wrong.", false);
    }
  };

  const cancelAppt = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/pickup/appointments/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (d.success) {
        flash("Pickup cancelled.", true);
        loadAppointments();
      } else flash(d.error || "Could not cancel.", false);
    } catch {
      flash("Something went wrong.", false);
    }
  };

  // ── Transfer actions ─────────────────────────────────────────────────────
  const setTransferStatus = async (id: string, status: "LOADED" | "COMPLETED") => {
    try {
      const res = await fetch(`/api/admin/pickup/transfers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const d = await res.json();
      if (d.success) {
        flash(status === "LOADED" ? "Loaded." : "Dropped off.", true);
        loadTransfers();
      } else flash(d.error || "Could not update transfer.", false);
    } catch {
      flash("Something went wrong.", false);
    }
  };

  // ── Derived lists ────────────────────────────────────────────────────────
  // Warehouse filter — you physically work one building at a time, so picking
  // Owosso should make Gladwin's pickups disappear entirely rather than sit there
  // as noise. Scopes this whole screen: today, coming up, waiting, transfers.
  const inWarehouse = (a: Appointment) => apptLocationId === "all" || a.locationId === apptLocationId;
  const q = search.trim().toLowerCase();
  // One search for the whole board. A tag #, a title or a customer matches the
  // card that item sits on — appointment, waiting bundle or transfer.
  const apptMatches = (a: Appointment) =>
    !q || hay([a.bidder.name, a.bidder.email, a.bidder.phone, a.location.name, a.stagedSpot, ...a.items.map((i) => i.title), ...a.items.map((i) => i.itemCode)]).includes(q);
  const waitingMatches = (w: WaitingRow) =>
    !q || hay([w.name, w.email, w.phone, w.locationName, w.gatherSpot, ...w.itemList.map((i) => i.title), ...w.itemList.map((i) => i.itemCode)]).includes(q);
  const transferMatches = (t: Transfer) =>
    !q || hay([t.bidder.name, t.bidder.email, t.bidder.phone, t.toLocation.name, t.gatherSpot, ...t.items.map((i) => i.title), ...t.items.map((i) => i.itemCode), ...t.items.map((i) => i.fromLocationName)]).includes(q);

  const scheduled = appointments.filter((a) => a.status === "SCHEDULED" && inWarehouse(a));
  const collected = appointments.filter((a) => a.status === "COLLECTED" && inWarehouse(a));
  // Picked-up list: most-recent-first; show only the 5 latest unless searching, so the
  // list doesn't grow to every pickup ever.
  const collectedSorted = [...collected].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const collectedShown = q ? collectedSorted.filter(apptMatches) : collectedSorted.slice(0, 5);
  const collectedHidden = collectedSorted.length - collectedShown.length;

  // Counts per warehouse for the scope chips — from SCHEDULED only, unfiltered, so
  // each chip always shows that warehouse's real workload.
  const scheduledAll = appointments.filter((a) => a.status === "SCHEDULED");
  const countFor = (locId: string) =>
    locId === "all" ? scheduledAll.length : scheduledAll.filter((a) => a.locationId === locId).length;

  const sortedScheduled = [...scheduled].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );
  const filteredScheduled = sortedScheduled.filter(apptMatches);

  // Today's pickups are the actual job — everything else is planning. Anything
  // still uncollected from an earlier day is overdue, so it sits on Today too
  // (sorted first) rather than hiding under Coming up.
  const todayKey = detroitDayKey(new Date());
  const todayAppts = filteredScheduled.filter((a) => detroitDayKey(a.startsAt) <= todayKey);
  const laterAppts = filteredScheduled.filter((a) => detroitDayKey(a.startsAt) > todayKey);
  // An appointment is "late" once it's more than an hour past its slot and still not
  // collected — flag those red so nobody's overdue pickup slips through the cracks.
  const LATE_AFTER_MS = 60 * 60 * 1000;
  const isLate = (a: Appointment) =>
    nowMs > 0 && a.status === "SCHEDULED" && nowMs - new Date(a.startsAt).getTime() > LATE_AFTER_MS;

  const allActiveTransfers = transfers.filter((t) => t.status === "REQUESTED" || t.status === "LOADED");
  const completedTransfersAll = transfers
    .filter((t) => t.status === "COMPLETED")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  // Newest 5 only, unless searching — a busy warehouse racks up hundreds of these.
  const completedTransfers = q ? completedTransfersAll.filter(transferMatches) : completedTransfersAll.slice(0, 5);
  const completedTransfersHidden = completedTransfersAll.length - completedTransfers.length;

  // A transfer's "from" comes off its items (they're the things being moved). Almost
  // always one warehouse; if a run somehow spans two, say so rather than pick one.
  const transferFrom = (t: Transfer): string => {
    const names = [...new Set(t.items.map((i) => i.fromLocationName).filter(Boolean))] as string[];
    if (names.length === 0) return "Unassigned";
    if (names.length === 1) return names[0];
    return "Multiple";
  };
  // The one warehouse you're working right now. Applied across appointments,
  // transfers and waiting so an owner at Owosso never sees Gladwin's items.
  const scopedLocName = apptLocationId === "all" ? null : locations.find((l) => l.id === apptLocationId)?.name ?? null;
  // A transfer is gathered at the SOURCE, so scope it by where its items sit now.
  const atScope = (fromName: string | null | undefined) => !scopedLocName || fromName === scopedLocName;

  const activeTransfersScoped = allActiveTransfers.filter((t) => !scopedLocName || t.items.some((i) => i.fromLocationName === scopedLocName));
  const activeTransfers = activeTransfersScoped.filter(transferMatches);

  // Waiting rows scoped to the working warehouse (someone with items at both shows
  // in both, but each owner only sees/gathers their building's items).
  const waitingRowsScoped = (waiting?.rows ?? []).filter((w) => !scopedLocName || w.itemList.some((i) => i.warehouse === scopedLocName));
  const waitingRows = waitingRowsScoped.filter(waitingMatches);

  // Nothing on the board matches the search -> ask the server where the item is.
  const boardMatches = todayAppts.length + laterAppts.length + waitingRows.length + activeTransfers.length + (q ? collectedShown.length + completedTransfers.length : 0);
  const needLocate = !!q && !loading && boardMatches === 0;
  useEffect(() => {
    const t = setTimeout(() => {
      if (!needLocate) { setLocated(null); return; }
      fetch(`/api/admin/pickup/locate?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setLocated(d.results ?? []))
        .catch(() => setLocated([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q, needLocate]);

  // ── Card renderers ───────────────────────────────────────────────────────
  // Plain functions (not components) so an open Spot box keeps focus across re-renders.

  const apptCard = (a: Appointment, showDate: boolean) => {
    const expanded = selectedApptId === a.id;
    const late = isLate(a);
    const grabbed = a.items.filter((it) => it.grabbed).length;
    const all = a.items.length;
    const allGrabbed = all > 0 && grabbed === all;
    const stageKey = `appt:${a.id}`;
    const openStage = () => { setSelectedApptId(a.id); setSpotEdit({ key: stageKey, value: a.stagedSpot ?? "" }); };
    const time = fmtTimeOnly(a.startsAt);
    return (
      <div
        key={a.id}
        id={`appt-${a.id}`}
        className={`border-2 rounded-2xl overflow-hidden bg-white ${
          late ? "border-[#c0392b]/60" : a.stagedSpot ? "border-[#bfd9c5]" : "border-[#e6dac6]"
        }`}
      >
        <div className="flex items-stretch">
          <button
            type="button"
            onClick={() => setSelectedApptId(expanded ? null : a.id)}
            className="flex-1 min-w-0 text-left px-4 py-3.5 flex items-center gap-4 hover:bg-[#faf5ea] transition-colors"
          >
            {/* Time leads — you work a day in time order. */}
            <div className="shrink-0 text-center min-w-[4.5rem]">
              {showDate && <div className="text-[13px] font-black uppercase tracking-wide text-[#8a7559]">{fmtDayShort(a.startsAt)}</div>}
              <div className={`font-display text-3xl font-black leading-none tabular-nums ${late ? "text-[#a1321f]" : "text-[#241a12]"}`}>
                {time.replace(/\s?(AM|PM)/, "")}
              </div>
              <div className="text-[13px] font-black text-[#8a7559] uppercase tracking-wide mt-0.5">{time.includes("PM") ? "PM" : "AM"}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-[#241a12] truncate">{bidderPrimary(a.bidder)}</div>
              {bidderSecondary(a.bidder) && <div className="text-[15px] text-[#8a7559] truncate">{bidderSecondary(a.bidder)}</div>}
              <div className="text-[15px] text-[#6f5b46] flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                <span>{plural(a.items.length, "item")}</span>
                {apptLocationId === "all" && <Pill tone="slate">{a.location.name}</Pill>}
                {late && <Pill tone="red">Late</Pill>}
                {!a.stagedSpot && allGrabbed && <Pill tone="green" dot>Gathered</Pill>}
                {a.door?.code && <Pill tone="ink"><span className="font-mono tracking-[0.15em]">{a.door.code}</span></Pill>}
              </div>
            </div>
          </button>
          <div className="shrink-0 flex items-center pr-3">
            {a.stagedSpot ? (
              <span className="inline-flex items-center gap-1.5 font-display text-2xl font-black text-[#2f5d3a] leading-none">
                <IcoCheck className="w-6 h-6" />
                {a.stagedSpot}
              </span>
            ) : (
              <Btn size="sm" tone="amber" onClick={openStage}>Stage</Btn>
            )}
          </div>
        </div>

        {expanded && (
          <div className="px-4 sm:px-5 pb-4 border-t border-[#f0e6d6]">
            {/* Door code (locations with smart locks only) */}
            {a.door && (
              <DoorCodePanel appointmentId={a.id} door={a.door} scheduled={a.status === "SCHEDULED"} onChange={loadAppointments} />
            )}

            {/* Gather list — photo + tag number are what staff actually use to find a
                thing on a shelf. Tap a row to tick it; saved server-side. Once staged
                there's nothing left to gather, so the rows go static. */}
            <div className="mt-4 flex items-center justify-between gap-3 mb-2">
              <Eyebrow>{a.stagedSpot ? `In ${a.stagedSpot}` : "Gather"}</Eyebrow>
              <div className={`font-display text-xl font-black tabular-nums ${allGrabbed || a.stagedSpot ? "text-[#2f5d3a]" : "text-[#8a4f1c]"}`}>
                {grabbed}/{all}
              </div>
            </div>
            {!a.stagedSpot && all > 0 && <Progress value={grabbed / all} tone={allGrabbed ? "green" : "amber"} className="mb-2.5" />}
            <ul className="space-y-2">
              {a.items.map((it) => (
                <li key={it.id}>
                  <TickRow
                    checked={it.grabbed || !!a.stagedSpot}
                    onToggle={a.stagedSpot ? undefined : () => toggleGrab(a.id, it.id, !it.grabbed)}
                    photo={it.photo}
                    code={it.itemCode}
                    title={it.title}
                    meta={
                      <>
                        {/* Once grabbed or staged, the shelf spot no longer applies. */}
                        {it.storageLocation && !it.grabbed && !a.stagedSpot && (
                          <span className="text-[15px] font-bold text-[#8a4f1c] bg-[#fbeed8] border border-[#eed3ab] rounded px-1.5 py-0.5">{it.storageLocation}</span>
                        )}
                        {it.needsPlacement && !it.grabbed && !a.stagedSpot && <Pill tone="amber">Just arrived · place it</Pill>}
                      </>
                    }
                  />
                </li>
              ))}
            </ul>

            {/* Actions */}
            {spotEdit?.key === stageKey ? (
              <SpotEditor
                value={spotEdit.value}
                onChange={(v) => setSpotEdit({ key: stageKey, value: v })}
                onSave={() => saveStage(a.id, spotEdit.value)}
                onCancel={() => setSpotEdit(null)}
                prefix={spotPrefix}
                saveLabel={a.stagedSpot ? "Update spot" : "Stage"}
                placeholder="Box 4"
              />
            ) : (
              <div className="mt-4 grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                <Btn onClick={openStage} tone={a.stagedSpot ? "slate" : "amber"} variant={a.stagedSpot ? "outline" : "solid"}>
                  {a.stagedSpot ? "Change spot" : "Stage"}
                </Btn>
                <PrintLabelButton href={`/api/admin/label?type=appointment&appt=${a.id}`} label="Print label" className={printBtnCls} />
                <Btn
                  onClick={() => askConfirm(
                    "Mark this whole order as picked up? Every item on it will be marked collected and the spot frees up.",
                    () => markCollected(a.id),
                    { confirmLabel: "Picked up" }
                  )}
                  tone="green"
                  className="col-span-2 sm:flex-1"
                >
                  Picked up
                </Btn>
              </div>
            )}

            <Disclosure label="More" className="mt-3">
              <div className="p-4 space-y-4">
                {editingApptId === a.id ? (
                  <div className="bg-[#f4ede1] border border-[#e6dac6] rounded-xl p-4 space-y-3">
                    <div>
                      <label className={labelCls}>Date &amp; time (Michigan)</label>
                      <Input type="datetime-local" value={editStartsAt} onChange={(e) => setEditStartsAt(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Warehouse</label>
                      <select value={editLocationId} onChange={(e) => setEditLocationId(e.target.value)} className={fieldCls}>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Btn onClick={() => saveReschedule(a.id)} className="flex-1">Save</Btn>
                      <Btn onClick={() => setEditingApptId(null)} tone="slate" variant="outline" className="flex-1">Cancel</Btn>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Btn onClick={() => startEdit(a)} tone="slate" variant="outline" size="sm">Reschedule</Btn>
                    {a.stagedSpot && (
                      <Btn onClick={() => saveStage(a.id, "")} tone="slate" variant="outline" size="sm">Un-stage</Btn>
                    )}
                    <Btn
                      onClick={() => askConfirm(
                        "Cancel this pickup? Its items go back to Waiting.",
                        () => cancelAppt(a.id),
                        { confirmLabel: "Cancel pickup", danger: true }
                      )}
                      tone="red"
                      variant="outline"
                      size="sm"
                    >
                      Cancel pickup
                    </Btn>
                  </div>
                )}
                {partialPickupList(a.items)}
              </div>
            </Disclosure>
          </div>
        )}
      </div>
    );
  };

  // A picked-up order: opens up like any other so a mis-tap can be undone.
  const collectedCard = (a: Appointment) => {
    const expanded = selectedApptId === a.id;
    return (
      <div key={a.id} id={`appt-${a.id}`} className="bg-white border border-[#e6dac6] rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setSelectedApptId(expanded ? null : a.id)}
          className="w-full min-h-[56px] text-left px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#faf5ea] transition-colors"
        >
          <div className="min-w-0 flex-1">
            <div className="font-bold text-[#241a12] truncate">{bidderPrimary(a.bidder)}</div>
            <div className="text-[15px] text-[#6f5b46] mt-0.5 truncate">
              {fmtDateTime(a.startsAt)} · {a.location.name} · {plural(a.items.length, "item")}
            </div>
          </div>
          <Pill tone="green">Picked up</Pill>
          <Chevron open={expanded} />
        </button>
        {expanded && (
          <div className="px-4 pb-4 pt-3 border-t border-[#f0e6d6]">
            <ul className="space-y-1.5">
              {a.items.map((it) => (
                <li key={it.id} className="flex items-center gap-2 text-[15px] text-[#4a3a2b]">
                  {it.itemCode && <span className="font-mono font-bold text-[#6c4d39] shrink-0">{it.itemCode}</span>}
                  <span className="truncate">{it.title}</span>
                </li>
              ))}
            </ul>
            <Btn
              onClick={() => askConfirm(
                "Reopen this pickup? Its items go back to waiting for collection and the pickup becomes active again.",
                () => reopenAppt(a.id),
                { confirmLabel: "Reopen pickup" }
              )}
              tone="slate"
              variant="outline"
              full
              className="mt-3"
            >
              Reopen — this wasn&apos;t picked up
            </Btn>
          </div>
        )}
      </div>
    );
  };

  const waitingCard = (w: WaitingRow) => {
    const scopedItems = w.itemList.filter((i) => atScope(i.warehouse));
    const gatherable = scopedItems.filter((i) => !i.transferring);
    const scopedGathered = gatherable.filter((i) => i.grabbed).length;
    const allScopedGathered = gatherable.length > 0 && scopedGathered === gatherable.length;
    const open = expandedWaitingId === w.clerkUserId;
    const spotKey = `waiting:${w.clerkUserId}`;
    const spotIds = scopedItems.map((i) => i.id);
    // Does this customer already have a booked pickup? If so, their loose items at
    // that pickup's warehouse can be added straight to it. Pick the RIGHT pickup:
    // the one at the warehouse you're working (or where their loose items are).
    const custAppts = appointments
      .filter((ap) => ap.clerkUserId === w.clerkUserId && ap.status === "SCHEDULED")
      .sort((x, y) => new Date(x.startsAt).getTime() - new Date(y.startsAt).getTime());
    const custAppt =
      (scopedLocName ? custAppts.find((ap) => ap.location.name === scopedLocName) : undefined) ??
      custAppts.find((ap) => w.itemList.some((i) => !i.transferring && i.warehouse === ap.location.name)) ??
      custAppts[0];
    const addableToAppt = custAppt ? w.itemList.filter((i) => !i.transferring && i.warehouse === custAppt.location.name) : [];
    const apptWhen = custAppt
      ? new Date(custAppt.startsAt).toLocaleString("en-US", { timeZone: "America/Detroit", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "";
    return (
      <li key={w.clerkUserId} id={`waiting-${w.clerkUserId}`} className={`border rounded-2xl p-4 ${w.hasLocation ? "bg-white border-[#e6dac6]" : "bg-[#fbeed8]/60 border-[#eed3ab]"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-[#241a12] break-words">{w.name || w.email || w.phone || "Unknown bidder"}</div>
            {/* Email always shown when there's also a name — it's how you tell nameless bidders apart. */}
            {w.name && w.email && <div className="text-[15px] text-[#8a7559] break-all">{w.email}</div>}
            {w.phone && <div className="text-[15px] text-[#8a7559]">{w.phone}</div>}
          </div>
          {w.gatherSpot && (
            <span className="shrink-0 inline-flex items-center gap-1.5 font-display text-2xl font-black text-[#2f5d3a] leading-none">
              <IcoCheck className="w-6 h-6" />
              {w.gatherSpot}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-[15px] text-[#6f5b46]">
          <span>{plural(scopedItems.length, "item")}</span>
          {w.hasLocation ? <Pill tone="slate">{w.locationName ?? "Location set"}</Pill> : <Pill tone="amber" dot>No location picked</Pill>}
          {allScopedGathered ? <Pill tone="green" dot>Gathered</Pill> : gatherable.length > 0 && <span>Gathered {scopedGathered}/{gatherable.length}</span>}
          <span>waiting {w.waitingDays === 0 ? "today" : plural(w.waitingDays, "day")}</span>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 mt-3">
          <Btn onClick={() => setExpandedWaitingId(open ? null : w.clerkUserId)} tone={open ? "slate" : "amber"} variant={open ? "outline" : "solid"} size="sm">
            {open ? "Hide" : "Gather"}
          </Btn>
          {scopedItems.length > 0 && (
            <Btn
              onClick={() => { setExpandedWaitingId(w.clerkUserId); setSpotEdit({ key: spotKey, value: w.gatherSpot ?? "" }); }}
              tone="slate"
              variant="outline"
              size="sm"
            >
              {w.gatherSpot ? "Change spot" : "Spot"}
            </Btn>
          )}
          <PrintLabelButton href={`/api/admin/label?type=waiting&user=${encodeURIComponent(w.clerkUserId)}`} label="Print label" className={printBtnCls} />
          <Btn
            onClick={() => setMsgTarget({ clerkUserId: w.clerkUserId, name: w.name, phone: w.phone })}
            tone="blue"
            variant="outline"
            size="sm"
            disabled={!w.phone}
          >
            Text
          </Btn>
        </div>

        {/* Customer already has a booked pickup at this warehouse — add these loose /
            just-arrived items straight onto it, so an arrived transfer isn't stranded. */}
        {custAppt && addableToAppt.length > 0 && (
          <Btn
            onClick={() => addToAppointment(custAppt, addableToAppt.map((i) => i.id))}
            disabled={addingApptId === custAppt.id}
            tone="blue"
            full
            className="mt-3 !whitespace-normal text-left leading-snug py-2"
          >
            {addingApptId === custAppt.id
              ? "Adding…"
              : `Add ${plural(addableToAppt.length, "item")} to their ${apptWhen} pickup at ${custAppt.location.name}`}
          </Btn>
        )}

        {/* Gather checklist — pull their items early, even with no appointment.
            Transferring items can't be gathered until they arrive. */}
        {open && (
          <div className="mt-3 border-t border-[#f0e6d6] pt-3">
            <ul className="space-y-2">
              {scopedItems.map((it) => (
                <li key={it.id}>
                  <TickRow
                    checked={it.grabbed}
                    onToggle={it.transferring ? undefined : () => toggleWaitingGrab(w.clerkUserId, it.id, !it.grabbed)}
                    code={it.itemCode}
                    title={it.title}
                    meta={
                      it.transferring ? (
                        <Pill tone="amber">On a transfer</Pill>
                      ) : (
                        <>
                          {it.needsPlacement && !it.grabbed && <Pill tone="amber">Just arrived · place it</Pill>}
                          {/* Off the shelf once THIS item is grabbed or has its own spot. */}
                          {!it.grabbed && !it.gatherSpot && (
                            <span className="text-[15px] text-[#6f5b46]">{it.warehouse || "Unassigned"} · {it.storageLocation || "no spot"}</span>
                          )}
                        </>
                      )
                    }
                  />
                </li>
              ))}
            </ul>
            {spotEdit?.key === spotKey && (
              <SpotEditor
                value={spotEdit.value}
                onChange={(v) => setSpotEdit({ key: spotKey, value: v })}
                onSave={() => saveWaitingGatherSpot(w.clerkUserId, spotIds, spotEdit.value)}
                onCancel={() => setSpotEdit(null)}
                onClear={w.gatherSpot ? () => saveWaitingGatherSpot(w.clerkUserId, spotIds, "") : undefined}
                prefix={spotPrefix}
                saveLabel={w.gatherSpot ? "Update spot" : "Set spot"}
                placeholder="Shelf B"
              />
            )}
            {gatherable.length > 0 && (
              <Disclosure label="More" className="mt-3">
                <div className="p-4">{partialPickupList(gatherable)}</div>
              </Disclosure>
            )}
          </div>
        )}
      </li>
    );
  };

  const transferCard = (t: Transfer) => {
    const expanded = expandedTransferId === t.id;
    const scopedItems = t.items.filter((it) => atScope(it.fromLocationName));
    const scopedIds = scopedItems.map((it) => it.id);
    const allGathered = t.items.length > 0 && t.items.every((i) => i.grabbed);
    const spotKey = `transfer:${t.id}`;
    return (
      <div key={t.id} id={`transfer-${t.id}`} className={`bg-white border rounded-2xl overflow-hidden ${t.status === "LOADED" ? "border-[#eed3ab]" : "border-[#e6dac6]"}`}>
        <button
          type="button"
          onClick={() => setExpandedTransferId(expanded ? null : t.id)}
          className="w-full min-h-[56px] text-left px-4 py-3.5 hover:bg-[#faf5ea] transition-colors flex items-center justify-between gap-3"
        >
          <div className="min-w-0 flex-1">
            <div className="font-bold text-[#241a12] truncate">{bidderPrimary(t.bidder)}</div>
            {bidderSecondary(t.bidder) && <div className="text-[15px] text-[#8a7559] truncate">{bidderSecondary(t.bidder)}</div>}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[15px] text-[#6f5b46]">
              <span className="inline-flex items-center gap-1.5 font-bold text-[#241a12]">{transferFrom(t)} <ArrowRight /> {t.toLocation.name}</span>
              <span>· {plural(t.items.length, "item")}</span>
              <Pill tone={t.status === "LOADED" ? "amber" : "slate"} dot>{t.status === "LOADED" ? "In transit" : "Requested"}</Pill>
              {!t.gatherSpot && allGathered && <Pill tone="green" dot>Gathered</Pill>}
            </div>
          </div>
          {t.gatherSpot ? (
            <span className="shrink-0 inline-flex items-center gap-1.5 font-display text-2xl font-black text-[#2f5d3a] leading-none">
              <IcoCheck className="w-6 h-6" />
              {t.gatherSpot}
            </span>
          ) : (
            <Chevron open={expanded} />
          )}
        </button>

        {expanded && (
          <div className="px-4 sm:px-5 pb-4 border-t border-[#f0e6d6] pt-3">
            <div className="text-[15px] text-[#8a7559]">Requested {fmtDateTime(t.createdAt)}</div>

            <div className="mt-3 flex items-center justify-between gap-3 mb-2">
              <Eyebrow>Gather{scopedLocName ? ` at ${scopedLocName}` : ""}</Eyebrow>
              <div className={`font-display text-xl font-black tabular-nums ${allGathered ? "text-[#2f5d3a]" : "text-[#8a4f1c]"}`}>
                {scopedItems.filter((i) => i.grabbed).length}/{scopedItems.length}
              </div>
            </div>
            <ul className="space-y-2">
              {scopedItems.map((it) => (
                <li key={it.id}>
                  <TickRow
                    checked={it.grabbed}
                    onToggle={() => toggleTransferGrab(t.id, it.id, !it.grabbed)}
                    code={it.itemCode}
                    title={it.title}
                    meta={
                      !it.grabbed && !it.gatherSpot ? (
                        <span className="text-[15px] text-[#6f5b46]">{it.fromLocationName || "Unassigned"} · {it.storageLocation || "no spot"}</span>
                      ) : undefined
                    }
                  />
                </li>
              ))}
            </ul>

            {spotEdit?.key === spotKey ? (
              <SpotEditor
                value={spotEdit.value}
                onChange={(v) => setSpotEdit({ key: spotKey, value: v })}
                onSave={() => saveTransferGatherSpot(t.id, scopedIds, spotEdit.value)}
                onCancel={() => setSpotEdit(null)}
                onClear={t.gatherSpot ? () => saveTransferGatherSpot(t.id, scopedIds, "") : undefined}
                prefix={spotPrefix}
                saveLabel={t.gatherSpot ? "Update spot" : "Set spot"}
                placeholder="Bay 3"
              />
            ) : (
              <div className="mt-4 grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                <Btn
                  onClick={() => setSpotEdit({ key: spotKey, value: t.gatherSpot ?? "" })}
                  tone={t.gatherSpot ? "slate" : "amber"}
                  variant={t.gatherSpot ? "outline" : "solid"}
                >
                  {t.gatherSpot ? "Change spot" : "Spot"}
                </Btn>
                <PrintLabelButton href={`/api/admin/label?type=transfer&transfer=${t.id}`} label="Print label" className={printBtnCls} />
                {t.status === "REQUESTED" && (
                  <Btn
                    onClick={() => askConfirm(
                      `Mark this transfer to ${t.toLocation.name} as loaded onto the truck?`,
                      () => setTransferStatus(t.id, "LOADED"),
                      { confirmLabel: "Loaded" }
                    )}
                    variant="outline"
                  >
                    Loaded
                  </Btn>
                )}
                <Btn
                  onClick={() => askConfirm(
                    `This moves the items to ${t.toLocation.name} and lets the bidder schedule — continue?`,
                    () => setTransferStatus(t.id, "COMPLETED"),
                    { confirmLabel: "Dropped off" }
                  )}
                  tone="green"
                  className="col-span-2 sm:flex-1"
                >
                  Dropped off
                </Btn>
              </div>
            )}

            {t.status === "LOADED" && (
              <Disclosure label="More" className="mt-3">
                <div className="p-4">
                  <Btn onClick={() => unloadTransfer(t.id)} tone="slate" variant="outline" size="sm">Undo loaded — back to gathering</Btn>
                </div>
              </Disclosure>
            )}
          </div>
        )}
      </div>
    );
  };

  // A dropped-off transfer: opens up so a mis-tap can be undone.
  const completedTransferCard = (t: Transfer) => {
    const open = expandedTransferId === t.id;
    return (
      <div key={t.id} id={`transfer-${t.id}`} className="bg-white border border-[#e6dac6] rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setExpandedTransferId(open ? null : t.id)}
          className="w-full min-h-[56px] text-left px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#faf5ea] transition-colors"
        >
          <div className="min-w-0 flex-1">
            <div className="font-bold text-[#241a12] truncate">{bidderPrimary(t.bidder)}</div>
            <div className="text-[15px] text-[#6f5b46] mt-0.5 truncate">
              To {t.toLocation.name} · {plural(t.items.length, "item")}{t.completedAt ? ` · ${fmtDateTime(t.completedAt)}` : ""}
            </div>
          </div>
          <Pill tone="green">Dropped off</Pill>
          <Chevron open={open} />
        </button>
        {open && (
          <div className="px-4 pb-4 pt-3 border-t border-[#f0e6d6]">
            <ul className="space-y-1.5">
              {t.items.map((it) => (
                <li key={it.id} className="flex items-center gap-2 text-[15px] text-[#4a3a2b]">
                  {it.itemCode && <span className="font-mono font-bold text-[#6c4d39] shrink-0">{it.itemCode}</span>}
                  <span className="truncate">{it.title}</span>
                </li>
              ))}
            </ul>
            <Btn
              onClick={() => askConfirm(
                `Undo this drop-off? The ${plural(t.items.length, "item")} go back to the warehouse they were in before, and the transfer becomes active again. The "your items arrived" text already sent won't be recalled.`,
                () => revertTransfer(t.id),
                { confirmLabel: "Undo drop-off" }
              )}
              tone="slate"
              variant="outline"
              full
              className="mt-3"
            >
              Undo — these weren&apos;t dropped off
            </Btn>
          </div>
        )}
      </div>
    );
  };

  // Warehouse scope — lives in the page header so it's the same control on every
  // tab. Switching also closes any open order / Spot box, so nothing from the
  // other warehouse stays expanded.
  const warehouseScope = locations.length > 1 ? (
    <Segmented
      value={apptLocationId}
      onChange={(id) => { setApptLocationId(id); setSelectedApptId(null); setSpotEdit(null); }}
      options={[{ id: "all", name: "All" }, ...locations].map((l) => ({ value: l.id, label: l.name, count: countFor(l.id) }))}
      className="max-w-[calc(100vw-2rem)]"
    />
  ) : undefined;

  const tabCounts: Record<Tab, number> = {
    today: todayAppts.length,
    upcoming: laterAppts.length,
    waiting: waitingRows.length,
    transfers: activeTransfers.length,
  };

  // Where an item is when the board has no card for it.
  const locatedWhere = (r: Located) => {
    const p = r.place;
    return p.kind === "appointment"
      ? `on a ${fmtDateTime(p.startsAt)} pickup at ${p.locationName}${p.stagedSpot ? ` · ${p.stagedSpot}` : ""}`
      : p.kind === "transfer"
      ? `on a transfer to ${p.toLocationName} (${p.status === "LOADED" ? "in transit" : "gathering"})`
      : p.kind === "collected"
      ? `picked up${p.pickedUpAt ? " " + new Date(p.pickedUpAt).toLocaleDateString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric" }) : ""}`
      : p.kind === "loose"
      ? `waiting at ${r.warehouse?.name ?? "no warehouse"}${r.gatherSpot ? ` · ${r.gatherSpot}` : r.storageLocation ? ` · ${r.storageLocation}` : ""}`
      : "sold, but no winner on record";
  };

  return (
    <>
      <PageHeader title="Pickup" actions={warehouseScope} />

      <PageBody wide>
        <SearchBox
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tag #, title, or customer"
        />
        <Segmented
          value={tab}
          onChange={(t) => { setTab(t); setSpotEdit(null); }}
          options={TABS.map((t) => ({ value: t, label: TAB_LABEL[t], count: tabCounts[t] > 0 || q ? tabCounts[t] : undefined }))}
        />

        {msg && <Notice tone={msg.ok ? "green" : "red"}>{msg.text}</Notice>}

        {/* Nothing on the board matched — say where the item actually is. */}
        {needLocate && located && (
          <Notice tone={located.length ? "blue" : "slate"}>
            {located.length === 0 ? (
              "No sold items match that."
            ) : (
              <ul className="space-y-2">
                {located.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      {r.itemCode && <span className="font-mono mr-1.5">{r.itemCode}</span>}
                      {r.title} — {locatedWhere(r)}{r.owner?.name ? ` · ${r.owner.name}` : ""}
                    </span>
                    {r.place.kind !== "not_won" && (
                      <Btn size="sm" tone="blue" variant="outline" onClick={() => jumpTo(r)}>Show</Btn>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Notice>
        )}

        {loading ? (
          <div className="text-center py-20 text-[#8a7559]">Loading…</div>
        ) : tab === "today" ? (
          <div className="space-y-5 max-w-3xl">
            {todayAppts.length === 0 ? (
              <div className="bg-white border border-[#e6dac6] rounded-2xl">
                <Empty text={q ? "No pickups today match." : scopedLocName ? `No pickups today at ${scopedLocName}.` : "No pickups today."} />
              </div>
            ) : (
              <div className="space-y-2">{todayAppts.map((a) => apptCard(a, false))}</div>
            )}

            {collected.length > 0 && (
              <Disclosure label={`Picked up · ${collected.length}`} open={showCollected} onToggle={setShowCollected}>
                <div className="p-3 sm:p-4 space-y-2">
                  {collectedShown.length === 0 && <p className="text-[15px] text-[#8a7559] px-1 py-2">No picked-up orders match.</p>}
                  {collectedShown.map(collectedCard)}
                  {!q && collectedHidden > 0 && (
                    <p className="text-[15px] text-[#8a7559] px-1 pt-1">5 most recent · search above for the other {collectedHidden}.</p>
                  )}
                </div>
              </Disclosure>
            )}
          </div>
        ) : tab === "upcoming" ? (
          <div className="space-y-5 max-w-3xl">
            {laterAppts.length === 0 ? (
              <div className="bg-white border border-[#e6dac6] rounded-2xl">
                <Empty text={q ? "Nothing coming up matches." : "Nothing booked beyond today."} />
              </div>
            ) : (
              <div className="space-y-2">{laterAppts.map((a) => apptCard(a, true))}</div>
            )}
          </div>
        ) : tab === "waiting" ? (
          <div className="space-y-5 max-w-3xl">
            {!waiting || waitingRows.length === 0 ? (
              <div className="bg-white border border-[#e6dac6] rounded-2xl">
                <Empty text={q ? "Nobody waiting matches." : scopedLocName ? `Nothing waiting at ${scopedLocName}.` : "Nobody's waiting."} />
              </div>
            ) : (
              <ul className="space-y-2">{waitingRows.map(waitingCard)}</ul>
            )}
          </div>
        ) : (
          <div className="space-y-5 max-w-3xl">
            {activeTransfersScoped.length > 0 && (
              /* One print job with every transfer to pull from the selected warehouse
                 (one label per transfer) — walk the aisles, grab, gather for delivery. */
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[15px] text-[#8a7559]">
                  {plural(activeTransfersScoped.length, "transfer")} to move{scopedLocName ? ` from ${scopedLocName}` : ""}
                </span>
                <PrintLabelButton
                  href={`/api/admin/label?type=transfer-batch&location=${apptLocationId}`}
                  label={scopedLocName ? `Print all to pull · ${scopedLocName}` : "Print all to pull"}
                  className={printBtnCls}
                />
              </div>
            )}
            {activeTransfers.length === 0 ? (
              <div className="bg-white border border-[#e6dac6] rounded-2xl">
                <Empty text={q ? "No transfers match." : scopedLocName ? `Nothing to gather at ${scopedLocName}.` : "No transfers waiting."} />
              </div>
            ) : (
              <div className="space-y-2">{activeTransfers.map(transferCard)}</div>
            )}

            {completedTransfersAll.length > 0 && (
              <Disclosure label={`Completed transfers · ${completedTransfersAll.length}`} open={showCompletedTransfers} onToggle={setShowCompletedTransfers}>
                <div className="p-3 sm:p-4 space-y-2">
                  {completedTransfers.length === 0 && <p className="text-[15px] text-[#8a7559] px-1 py-2">No completed transfers match.</p>}
                  {completedTransfers.map(completedTransferCard)}
                  {!q && completedTransfersHidden > 0 && (
                    <p className="text-[15px] text-[#8a7559] px-1 pt-1">5 most recent · search above for the other {completedTransfersHidden}.</p>
                  )}
                </div>
              </Disclosure>
            )}
          </div>
        )}
      </PageBody>

      <MessageSheet target={msgTarget} onClose={() => setMsgTarget(null)} />

      {/* In-app confirmation dialog (replaces native confirm, which some webviews block) */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setConfirmDialog(null)}
        >
          <div
            className="bg-white rounded-2xl border border-[#e6dac6] max-w-sm w-full p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[#241a12]">{confirmDialog.text}</p>
            <div className="mt-5 flex gap-3">
              <Btn onClick={() => setConfirmDialog(null)} tone="slate" variant="outline" className="flex-1">
                Back
              </Btn>
              <Btn
                onClick={() => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); fn(); }}
                tone={confirmDialog.danger ? "red" : "leather"}
                className="flex-1"
              >
                {confirmDialog.confirmLabel}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
