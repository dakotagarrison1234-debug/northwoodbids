"use client";
import { useState, useEffect, useCallback } from "react";
import LocationBadge from "@/app/components/LocationBadge";
import MessageSheet, { type MessageTarget } from "../MessageSheet";
import PrintLabelButton from "../PrintLabelButton";
import { PageHeader, PageBody, Panel, Pill, Eyebrow, Btn, Input, SearchBox, Segmented, Toolbar, Empty, Notice, Progress, tone } from "../ui";

// PrintLabelButton renders an <a target="_blank">, so it can't be a Btn — give it the
// kit's outline-button look instead (same height, radius, tone).
const printBtnCls =
  "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors whitespace-nowrap min-h-[48px] px-5 text-base bg-white border-2 border-[#d9c7ab] text-[#563e2c] hover:bg-[#faf5ea]";
const printBtnSmCls =
  "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors whitespace-nowrap min-h-[44px] px-3.5 text-sm bg-white border-2 border-[#d9c7ab] text-[#563e2c] hover:bg-[#faf5ea]";
// Select / textarea share the kit Input look (the kit only ships a text input).
const fieldCls =
  "w-full min-h-[46px] bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-4 text-[#241a12] placeholder:text-[#b3a085] outline-none transition";
const labelCls = "text-[11px] font-black uppercase tracking-[0.14em] text-[#8a7559] mb-1 block";

/** Small check mark used inside chips and tick boxes. */
const Check = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 5" /></svg>
);
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
interface Window {
  id: string;
  weekday: number;
  startMinutes: number;
  endMinutes: number;
  slotMinutes: number;
  capacityPerSlot: number;
}
interface Blackout {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}
interface Location {
  id: string;
  name: string;
  address: string | null;
  instructions: string | null;
  isActive: boolean;
  windows: Window[];
  blackouts: Blackout[];
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

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
/** Michigan-local YYYY-MM-DD, so "today" means today in the warehouse, not UTC. */
function detroitDayKey(d: Date | string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Detroit",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(d));
}
function minutesToLabel(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
function timeStrToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
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

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AdminPickupPage() {
  const [tab, setTab] = useState<"pickups" | "locations" | "transfers">("pickups");
  const [selectedApptId, setSelectedApptId] = useState<string | null>(null);
  const [showCollected, setShowCollected] = useState(false);
  const [collectedSearch, setCollectedSearch] = useState("");
  const [showCompletedTransfers, setShowCompletedTransfers] = useState(false);
  const [completedTransferSearch, setCompletedTransferSearch] = useState("");
  const [waitingSearch, setWaitingSearch] = useState("");
  // Transfers are collapsed to one line each until tapped, and filterable by
  // direction ("Gladwin → Owosso") so a run can be picked out at a glance.
  const [expandedTransferId, setExpandedTransferId] = useState<string | null>(null);
  // Order staging: box the whole order up and label it once ("Box 4").
  const [stagingApptId, setStagingApptId] = useState<string | null>(null);
  const [stageSpot, setStageSpot] = useState("");
  // Transfer staging: gather + bundle a transfer's items in a spot before load day.
  const [stagingTransferId, setStagingTransferId] = useState<string | null>(null);
  const [transferStageSpot, setTransferStageSpot] = useState("");
  // Waiting list: expand a person to gather their items even before they book.
  const [expandedWaitingId, setExpandedWaitingId] = useState<string | null>(null);
  const [gatherWaitingId, setGatherWaitingId] = useState<string | null>(null);
  const [waitingGatherSpot, setWaitingGatherSpot] = useState("");
  // Which warehouse's pickups to show ("all" = both). You work one building at a time.
  const [apptLocationId, setApptLocationId] = useState<string>("all");
  const [showAddLoc, setShowAddLoc] = useState(false);
  const [apptSearch, setApptSearch] = useState("");
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

  // Remember which warehouse you're working — an owner sets it once per shift.
  useEffect(() => {
    try { const s = localStorage.getItem("nb-pickup-warehouse"); if (s) setApptLocationId(s); } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("nb-pickup-warehouse", apptLocationId); } catch {}
  }, [apptLocationId]);

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  };

  // Add loose / just-arrived items to a customer's existing appointment ("click and
  // add"). Reloads the waiting list + appointments so the item moves onto the order.
  // ── "Find an item" — the answer to "where did it go?" ──
  // Asks the server for ONE honest location per item (appointment / transfer /
  // loose / collected). Nothing can hide from this; it also heals dangling links.
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
  const [locateQ, setLocateQ] = useState("");
  const [located, setLocated] = useState<Located[] | null>(null);
  const [locating, setLocating] = useState(false);
  useEffect(() => {
    if (!locateQ.trim()) { setLocated(null); return; }
    setLocating(true);
    const t = setTimeout(() => {
      fetch(`/api/admin/pickup/locate?q=${encodeURIComponent(locateQ.trim())}`)
        .then((r) => r.json())
        .then((d) => setLocated(d.results ?? []))
        .catch(() => setLocated([]))
        .finally(() => setLocating(false));
    }, 300);
    return () => clearTimeout(t);
  }, [locateQ]);

  // Jump straight to wherever the item is, switching tab + warehouse as needed.
  const jumpTo = (r: Located) => {
    const p = r.place;
    if (p.kind === "appointment") {
      setTab("pickups");
      setApptLocationId(p.locationId);
      setSelectedApptId(p.appointmentId);
      setTimeout(() => document.getElementById(`appt-${p.appointmentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
    } else if (p.kind === "transfer") {
      setTab("transfers");
      setTimeout(() => document.getElementById(`transfer-${p.transferId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
    } else if (p.kind === "loose") {
      setTab("pickups");
      if (r.warehouse) setApptLocationId(r.warehouse.id);
      if (r.owner) setExpandedWaitingId(r.owner.clerkUserId);
      setTimeout(() => r.owner && document.getElementById(`waiting-${r.owner.clerkUserId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
    } else if (p.kind === "collected") {
      setTab("pickups");
      setShowCollected(true);
      if (p.appointmentId) {
        setSelectedApptId(p.appointmentId);
        setTimeout(() => document.getElementById(`appt-${p.appointmentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
      }
    }
    setLocateQ("");
  };

  const [addingApptId, setAddingApptId] = useState<string | null>(null);
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
          `Added ${data.added} item${data.added !== 1 ? "s" : ""} to ${bidderPrimary(appt.bidder)}'s ${when} pickup at ${appt.location.name}${data.unstaged ? " — re-gather & re-stage the box" : ""}.`,
          true
        );
        await Promise.all([loadWaiting(), loadAppointments()]);
        // NEVER let the item vanish from view: if that pickup is at a warehouse the
        // board is currently hiding, switch to it, then open the pickup it went onto.
        if (apptLocationId !== "all" && apptLocationId !== appt.locationId) setApptLocationId(appt.locationId);
        setSelectedApptId(appt.id);
        setTimeout(() => document.getElementById(`appt-${appt.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
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
        flash(`Marked ${ok} item${ok !== 1 ? "s" : ""} picked up.`, true);
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

  // Compact per-item "mark picked up" control — reused in the gather, staged and
  // waiting lists so a single stuck/handed-off item can be cleared on its own,
  // without collecting the whole order.
  const PickedUpItemBtn = (itemId: string) => (
    <Btn
      type="button"
      onClick={() => askConfirm(
        "Mark this one item as picked up?",
        () => markPickedUp(itemId, [itemId]),
        { confirmLabel: "Picked up" }
      )}
      disabled={markingPickedId === itemId}
      title="Mark this item picked up"
      tone="green"
      variant="outline"
      size="sm"
      className="shrink-0 self-center min-h-[44px] !px-3 text-xs"
    >
      {markingPickedId === itemId ? (
        "…"
      ) : (
        <>
          <Check />
          Picked up
        </>
      )}
    </Btn>
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
        flash("Appointment updated.", true);
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
        setGatherWaitingId(null);
        flash(spot.trim() ? `Gathered into ${spot.trim()}.` : "Gather spot cleared.", true);
        loadWaiting();
      } else flash(d.error || "Could not set the gather spot.", false);
    } catch {
      flash("Could not set the gather spot.", false);
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
        setStagingTransferId(null);
        flash(spot.trim() ? `Gathered into ${spot.trim()}.` : "Gather spot cleared.", true);
        loadTransfers();
      } else flash(d.error || "Could not set the gather spot.", false);
    } catch {
      flash("Could not set the gather spot.", false);
    }
  };

  // Undo an accidental "Mark Loaded" — back to still-gathering (REQUESTED).
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
        flash(spot.trim() ? `Order staged in ${spot.trim()}.` : "Order un-staged.", true);
        setStagingApptId(null);
        setStageSpot("");
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
        flash("Marked as collected.", true);
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
        flash("Appointment cancelled.", true);
        loadAppointments();
      } else flash(d.error || "Could not cancel.", false);
    } catch {
      flash("Something went wrong.", false);
    }
  };

  // ── Transfer actions ─────────────────────────────────────────────────────
  const setTransferStatus = async (id: string, status: "LOADED" | "COMPLETED", _toLocationName: string) => {
    try {
      const res = await fetch(`/api/admin/pickup/transfers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const d = await res.json();
      if (d.success) {
        flash(status === "LOADED" ? "Marked loaded." : "Marked dropped off.", true);
        loadTransfers();
      } else flash(d.error || "Could not update transfer.", false);
    } catch {
      flash("Something went wrong.", false);
    }
  };

  // ── Location actions ─────────────────────────────────────────────────────
  const [newLoc, setNewLoc] = useState({ name: "", address: "", instructions: "" });
  const addLocation = async () => {
    if (!newLoc.name.trim()) return;
    try {
      const res = await fetch("/api/admin/pickup/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newLoc),
      });
      const d = await res.json();
      if (d.success) {
        flash("Location added.", true);
        setNewLoc({ name: "", address: "", instructions: "" });
        loadLocations();
      } else flash(d.error || "Could not add location.", false);
    } catch {
      flash("Something went wrong.", false);
    }
  };

  const toggleLocation = async (loc: Location) => {
    try {
      await fetch(`/api/admin/pickup/locations/${loc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !loc.isActive }),
      });
      loadLocations();
    } catch {
      flash("Something went wrong.", false);
    }
  };

  const deleteLocation = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/pickup/locations/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (d.success) {
        flash("Location deleted.", true);
        loadLocations();
        loadAppointments();
      } else flash(d.error || "Could not delete.", false);
    } catch {
      flash("Something went wrong.", false);
    }
  };

  const deleteWindow = async (wid: string) => {
    try {
      const res = await fetch(`/api/admin/pickup/windows/${wid}`, { method: "DELETE" });
      const d = await res.json();
      if (d.success) loadLocations();
      else flash(d.error || "Could not delete.", false);
    } catch {
      flash("Something went wrong.", false);
    }
  };

  // Warehouse filter — you physically work one building at a time, so picking
  // Owosso should make Gladwin's pickups disappear entirely rather than sit there
  // as noise. Scopes this whole screen: today, coming up, and collected.
  const inWarehouse = (a: Appointment) => apptLocationId === "all" || a.locationId === apptLocationId;
  const scheduled = appointments.filter((a) => a.status === "SCHEDULED" && inWarehouse(a));
  const collected = appointments.filter((a) => a.status === "COLLECTED" && inWarehouse(a));
  // Picked-up list: most-recent-first; show only the 5 latest unless searching, so the
  // list doesn't grow to every pickup ever.
  const collectedSorted = [...collected].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const collectedShown = collectedSearch.trim()
    ? collectedSorted.filter((a) => {
        const q = collectedSearch.trim().toLowerCase();
        return (
          (a.bidder.name ?? "").toLowerCase().includes(q) ||
          (a.bidder.email ?? "").toLowerCase().includes(q) ||
          (a.bidder.phone ?? "").includes(collectedSearch.trim())
        );
      })
    : collectedSorted.slice(0, 5);

  // Counts per warehouse for the chips — from SCHEDULED only, unfiltered, so each
  // chip always shows that warehouse's real workload.
  const scheduledAll = appointments.filter((a) => a.status === "SCHEDULED");
  const countFor = (locId: string) =>
    locId === "all" ? scheduledAll.length : scheduledAll.filter((a) => a.locationId === locId).length;

  // Master-detail: searchable, soonest-first list; selecting one shows only that
  // customer's items. Falls back to the first match so a customer is always shown.
  const apptMatches = (a: Appointment, q: string) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    const hay = [
      a.bidder.name,
      a.bidder.email,
      a.bidder.phone,
      a.location.name,
      ...a.items.map((i) => i.title),
      ...a.items.map((i) => i.itemCode),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(t);
  };
  const sortedScheduled = [...scheduled].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );
  const filteredScheduled = sortedScheduled.filter((a) => apptMatches(a, apptSearch));

  // Today's pickups are the actual job — everything else is planning. Split them out
  // so the day's work is the first thing on screen, in time order, with staging
  // progress you can see without counting.
  const todayKey = detroitDayKey(new Date());
  const todayAppts = filteredScheduled.filter((a) => detroitDayKey(a.startsAt) === todayKey);
  const laterAppts = filteredScheduled.filter((a) => detroitDayKey(a.startsAt) !== todayKey);
  const todayStaged = todayAppts.filter((a) => a.stagedSpot).length;
  const todayItems = todayAppts.reduce((s, a) => s + a.items.length, 0);
  const allTodayStaged = todayAppts.length > 0 && todayStaged === todayAppts.length;
  // An appointment is "late" once it's more than an hour past its slot and still not
  // collected — flag those red so nobody's overdue pickup slips through the cracks.
  const LATE_AFTER_MS = 60 * 60 * 1000;
  const nowMs = Date.now();
  const isLate = (a: Appointment) =>
    a.status === "SCHEDULED" && nowMs - new Date(a.startsAt).getTime() > LATE_AFTER_MS;
  const allActiveTransfers = transfers.filter(
    (t) => t.status === "REQUESTED" || t.status === "LOADED"
  );
  const completedTransfersAll = transfers
    .filter((t) => t.status === "COMPLETED")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  // Newest 5 only, unless searching — a busy warehouse racks up hundreds of these.
  const completedTransfers = completedTransferSearch.trim()
    ? completedTransfersAll.filter((t) => {
        const q = completedTransferSearch.trim().toLowerCase();
        return (
          (t.bidder.name ?? "").toLowerCase().includes(q) ||
          (t.bidder.email ?? "").toLowerCase().includes(q) ||
          (t.bidder.phone ?? "").includes(completedTransferSearch.trim())
        );
      })
    : completedTransfersAll.slice(0, 5);
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
  // transfers and waiting so an owner at Owosso never sees Gladwin's items — this
  // replaces the old confusing "Owosso → Gladwin" direction chips.
  const scopedLocName = apptLocationId === "all" ? null : locations.find((l) => l.id === apptLocationId)?.name ?? null;
  // A transfer is gathered at the SOURCE, so scope it by where its items sit now.
  const atScope = (fromName: string | null | undefined) => !scopedLocName || fromName === scopedLocName;

  const activeTransfers = allActiveTransfers.filter((t) => !scopedLocName || t.items.some((i) => i.fromLocationName === scopedLocName));

  // Waiting rows scoped to the working warehouse (someone with items at both shows
  // in both, but each owner only sees/gathers their building's items).
  const waitingRowsScoped = (waiting?.rows ?? []).filter((w) => !scopedLocName || w.itemList.some((i) => i.warehouse === scopedLocName));
  // These are all active (people who still need to book), so we don't cap them —
  // but a search box keeps it usable once there are dozens of names.
  const waitingRows = waitingSearch.trim()
    ? waitingRowsScoped.filter((w) => {
        const q = waitingSearch.trim().toLowerCase();
        return (
          (w.name ?? "").toLowerCase().includes(q) ||
          (w.email ?? "").toLowerCase().includes(q) ||
          (w.phone ?? "").includes(waitingSearch.trim())
        );
      })
    : waitingRowsScoped;

  // The expanded appointment panel — items to gather, the staging box, and the
  // actions. Shared by Today and Coming up so the two lists can never drift apart.
  const ApptDetail = ({ a }: { a: Appointment }) => (
    <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-[#f0e6d6]">
    {(a.bidder.email || a.bidder.phone) && (
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-3 text-base text-[#6f5b46]">
        {a.bidder.email && <span className="break-all">{a.bidder.email}</span>}
        {a.bidder.phone && <span>{a.bidder.phone}</span>}
      </div>
    )}

    {/* ── Gather list ──
        Photo + tag number are what staff actually use to find a thing on a shelf,
        so both lead. Tap anywhere on a row to tick it off; it's saved server-side,
        so a locked phone or a second person helping doesn't lose the progress. */}
    {(() => {
      const grabbed = a.items.filter((it) => it.grabbed).length;
      const all = a.items.length;
      const allGrabbed = all > 0 && grabbed === all;

      // Already staged = gathered AND boxed. Drop the gather checklist entirely —
      // there's nothing to gather. Just show where it's boxed and what's in it.
      if (a.stagedSpot) {
        return (
          <div className="mt-4">
            <div className="rounded-xl bg-[#e6f1e8] border border-[#bfd9c5] px-4 py-3 mb-2.5">
              <Eyebrow className="!text-[#2f5d3a]">Staged &amp; ready</Eyebrow>
              <div className="font-display text-xl font-black text-[#2f5d3a] leading-tight mt-0.5">{a.stagedSpot}</div>
              <div className="text-sm text-[#4a7c59]">{all} item{all !== 1 ? "s" : ""} boxed for pickup.</div>
            </div>
            <ul className="space-y-1.5">
              {a.items.map((it) => (
                <li key={it.id} className="flex items-center gap-2 text-base text-[#4a3a2b] px-1 py-0.5">
                  {it.itemCode && <span className="font-mono font-bold text-[#6c4d39] text-sm shrink-0">{it.itemCode}</span>}
                  <span className="truncate flex-1 min-w-0">{it.title}</span>
                  {PickedUpItemBtn(it.id)}
                </li>
              ))}
            </ul>
          </div>
        );
      }

      return (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <Eyebrow>Gather {all} item{all !== 1 ? "s" : ""}</Eyebrow>
            <div className={`font-display text-lg font-black tabular-nums ${allGrabbed ? "text-[#2f5d3a]" : "text-[#8a4f1c]"}`}>
              {grabbed}/{all}
            </div>
          </div>

          {all > 0 && <Progress value={grabbed / all} tone={allGrabbed ? "green" : "amber"} className="mb-2.5" />}

          <ul className="space-y-2">
            {a.items.map((it) => (
              <li key={it.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => toggleGrab(a.id, it.id, !it.grabbed)}
                  className={`flex-1 min-w-0 flex items-center gap-3 rounded-xl px-3 py-2.5 border-2 text-left transition-colors ${
                    it.grabbed
                      ? "bg-[#e6f1e8] border-[#bfd9c5]"
                      : "bg-white border-[#e6dac6] active:bg-[#faf5ea]"
                  }`}
                >
                  {/* Tick box, 44px hit area via the whole row. */}
                  <span className={`w-7 h-7 shrink-0 rounded-lg border-2 grid place-items-center ${
                    it.grabbed ? "bg-[#4a7c59] border-[#4a7c59] text-white" : "bg-white border-[#d9c7ab]"
                  }`}>
                    {it.grabbed && <Check size={16} />}
                  </span>

                  <span className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-[#efe3d0] grid place-items-center">
                    {it.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.photo} alt="" className={`w-full h-full object-cover ${it.grabbed ? "opacity-60" : ""}`} />
                    ) : (
                      <span className="text-[10px] text-[#b3a085]">No photo</span>
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 flex-wrap">
                      {it.itemCode && (
                        <span className="font-mono font-extrabold text-[#563e2c] bg-[#f1e7d5] border border-[#d9c7ab] rounded px-1.5 py-0.5 text-sm">
                          {it.itemCode}
                        </span>
                      )}
                      {/* Once the item is grabbed (off the shelf) or the whole order
                          is staged, the shelf spot no longer applies — hide it. */}
                      {it.storageLocation && !it.grabbed && !a.stagedSpot && (
                        <span className="text-sm font-bold text-[#8a4f1c] bg-[#fbeed8] border border-[#eed3ab] rounded px-1.5 py-0.5">
                          {it.storageLocation}
                        </span>
                      )}
                      {/* Rode in on a transfer and auto-joined this pickup — still needs a shelf. */}
                      {it.needsPlacement && !it.grabbed && !a.stagedSpot && (
                        <Pill tone="amber">Just arrived · place it</Pill>
                      )}
                    </span>
                    <span className={`block text-base mt-0.5 leading-snug line-clamp-2 ${
                      it.grabbed ? "text-[#8a7559] line-through" : "text-[#241a12]"
                    }`}>
                      {it.title}
                    </span>
                  </span>
                </button>
                {PickedUpItemBtn(it.id)}
              </li>
            ))}
          </ul>

          {allGrabbed && !a.stagedSpot && (
            <p className="mt-2.5 text-base font-bold text-[#2f5d3a]">
              Everything&apos;s gathered — stage it below.
            </p>
          )}
        </div>
      );
    })()}

    {/* Reschedule editor */}
    {editingApptId === a.id ? (
      <div className="mt-4 bg-[#f4ede1] border border-[#e6dac6] rounded-xl p-4 space-y-3">
        <div>
          <label className={labelCls}>Date & time (Michigan)</label>
          <Input
            type="datetime-local"
            value={editStartsAt}
            onChange={(e) => setEditStartsAt(e.target.value)}
            className="text-base"
          />
        </div>
        <div>
          <label className={labelCls}>Location</label>
          <select
            value={editLocationId}
            onChange={(e) => setEditLocationId(e.target.value)}
            className={`${fieldCls} text-base`}
          >
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
    ) : stagingApptId === a.id ? (
      /* Stage the order: one spot for everything above. */
      <div className="mt-4 bg-[#f4ede1] border border-[#e6dac6] rounded-xl p-4">
        <label className="block font-display text-lg font-black text-[#241a12] mb-0.5">
          Where is this order boxed up?
        </label>
        <p className="text-sm text-[#8a7559] mb-2.5">
          The customer sees this on their pickup screen. It clears itself once collected.
        </p>
        <Input
          type="text"
          autoFocus
          value={stageSpot}
          onChange={(e) => setStageSpot(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") saveStage(a.id, stageSpot); }}
          placeholder="Box 4"
          className="text-base"
        />
        <div className="flex gap-2 mt-3">
          <Btn onClick={() => saveStage(a.id, stageSpot)} disabled={!stageSpot.trim()} className="flex-1">
            {a.stagedSpot ? "Update spot" : "Stage order"}
          </Btn>
          <Btn onClick={() => { setStagingApptId(null); setStageSpot(""); }} tone="slate" variant="outline" className="flex-1">
            Cancel
          </Btn>
        </div>
        {a.stagedSpot && (
          <Btn onClick={() => saveStage(a.id, "")} tone="red" variant="ghost" full className="mt-2">
            Un-stage this order
          </Btn>
        )}
      </div>
    ) : (
      <div className="mt-4 flex flex-wrap gap-2">
        <Btn
          onClick={() => { setStagingApptId(a.id); setStageSpot(a.stagedSpot ?? ""); }}
          tone={a.stagedSpot ? "slate" : "amber"}
          variant={a.stagedSpot ? "outline" : "solid"}
        >
          {a.stagedSpot ? `Staged in ${a.stagedSpot}` : "Stage order"}
        </Btn>
        <PrintLabelButton
          href={`/api/admin/label?type=appointment&appt=${a.id}`}
          label="Print label"
          className={printBtnCls}
        />
        <Btn onClick={() => startEdit(a)} tone="slate" variant="outline">
          Reschedule
        </Btn>
        <Btn
          onClick={() => askConfirm(
            "Mark this whole order as picked up? Every item on it will be marked collected and the staging spot frees up.",
            () => markCollected(a.id),
            { confirmLabel: "Order picked up" }
          )}
          tone="green"
        >
          Order picked up
        </Btn>
        <Btn
          onClick={() => askConfirm(
            "Cancel this appointment? Its items will return to the unscheduled list.",
            () => cancelAppt(a.id),
            { confirmLabel: "Cancel appointment", danger: true }
          )}
          tone="red"
          variant="outline"
        >
          Cancel
        </Btn>
      </div>
    )}
    </div>
  );

  // Warehouse scope — lives in the page header so it's the same control on every
  // tab. Switching while on the pickups board also closes any open order / staging
  // box (same as before), so nothing from the other warehouse stays expanded.
  const warehouseScope = locations.length > 1 && tab !== "locations" && (
    <Segmented
      value={apptLocationId}
      onChange={(id) => {
        setApptLocationId(id);
        if (tab === "pickups") { setSelectedApptId(null); setStagingApptId(null); }
      }}
      options={[{ id: "all", name: "All warehouses" }, ...locations].map((l) => ({
        value: l.id,
        label: l.name,
        count: tab === "pickups" ? countFor(l.id) : undefined,
      }))}
      className="max-w-[calc(100vw-2rem)]"
    />
  );

  // Compact appointment header row (name, contact, where, status chips).
  const ApptChips = ({ a }: { a: Appointment }) => (
    <>
      <LocationBadge name={a.location.name} size="sm" />
      {isLate(a) && (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#c0392b] text-white font-black text-[11px] uppercase tracking-wide">Late</span>
      )}
      {!a.stagedSpot && a.items.length > 0 && a.items.every((it) => it.grabbed) && (
        <Pill tone="green" dot>Gathered</Pill>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        title="Pickup"
        sub="Appointments, transfers, warehouses."
        actions={warehouseScope || undefined}
      />

      <PageBody wide>
        {/* View switch + "Find an item" — where is it RIGHT NOW? Tag #, title, or customer. */}
        <Toolbar>
          <Segmented
            value={tab}
            onChange={setTab}
            options={(["pickups", "transfers", "locations"] as const).map((t) => {
              const badge =
                t === "transfers" ? activeTransfers.length :
                t === "pickups" ? waitingRowsScoped.length : 0;
              const label =
                t === "pickups" ? "Pickups" :
                t === "transfers" ? "Transfers" : "Locations";
              return { value: t, label, count: badge > 0 ? badge : undefined };
            })}
          />
          <div className="relative flex-1 min-w-[240px]">
            <SearchBox
              type="text"
              value={locateQ}
              onChange={(e) => setLocateQ(e.target.value)}
              placeholder="Find an item — tag #, title, or customer…"
            />
            {locateQ.trim() && (
              <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-[#e6dac6] rounded-2xl shadow-[0_18px_40px_-20px_rgba(60,40,25,0.5)] overflow-hidden max-h-[60vh] overflow-y-auto">
                {locating && !located ? (
                  <div className="px-4 py-3 text-sm text-[#8a7559]">Looking…</div>
                ) : !located || located.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-[#8a7559]">No sold items match that.</div>
                ) : (
                  located.map((r) => {
                    const p = r.place;
                    const where =
                      p.kind === "appointment"
                        ? `On ${new Date(p.startsAt).toLocaleString("en-US", { timeZone: "America/Detroit", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} pickup · ${p.locationName}${p.stagedSpot ? ` · staged ${p.stagedSpot}` : ""}`
                        : p.kind === "transfer"
                        ? `On transfer to ${p.toLocationName} (${p.status === "LOADED" ? "loaded / in transit" : "gathering"})${p.stagedSpot ? ` · staged ${p.stagedSpot}` : ""}`
                        : p.kind === "collected"
                        ? `Collected${p.pickedUpAt ? " " + new Date(p.pickedUpAt).toLocaleDateString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric" }) : ""}`
                        : p.kind === "loose"
                        ? `Waiting — loose at ${r.warehouse?.name ?? "no warehouse set"}${r.gatherSpot ? ` · gathered ${r.gatherSpot}` : r.storageLocation ? ` · shelf ${r.storageLocation}` : ""}`
                        : "Sold, but no winner on record";
                    const whereTone = tone(
                      p.kind === "appointment" ? "blue" :
                      p.kind === "transfer" ? "amber" :
                      p.kind === "collected" ? "slate" :
                      p.kind === "loose" ? "green" : "red"
                    );
                    return (
                      <button key={r.id} onClick={() => jumpTo(r)} className="w-full text-left px-4 py-3 min-h-[56px] border-b border-[#f0e6d6] last:border-0 hover:bg-[#faf5ea] active:bg-[#f4ede1] transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-bold text-[#241a12] truncate">
                              {r.itemCode && <span className="font-mono text-[#6c4d39] mr-1.5">{r.itemCode}</span>}
                              {r.title}
                            </div>
                            <div className="text-xs text-[#8a7559] truncate">{r.owner?.name ?? "—"}{r.owner?.phone ? ` · ${r.owner.phone}` : ""}</div>
                          </div>
                          <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-[#6c4d39]">
                            Jump
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5" /></svg>
                          </span>
                        </div>
                        <div className={`mt-1.5 inline-block text-xs font-bold px-2 py-0.5 rounded-full border ${whereTone.bg} ${whereTone.text} ${whereTone.border}`}>{where}</div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </Toolbar>

        {msg && <Notice tone={msg.ok ? "green" : "red"} className="text-base">{msg.text}</Notice>}

        {loading ? (
          <div className="text-center py-20 text-base text-[#8a7559]">Loading…</div>
        ) : tab === "pickups" ? (
          <div className="grid lg:grid-cols-5 gap-5 items-start">
          <div className="lg:col-span-3 space-y-5">
            {/* ── TODAY ── The day's actual work, first and unmissable. ── */}
            <section>
              <div className={`rounded-2xl border p-4 sm:p-5 mb-2.5 ${
                todayAppts.length === 0
                  ? "bg-white border-[#e6dac6]"
                  : allTodayStaged
                  ? "bg-[#4a7c59] border-[#4a7c59] text-white"
                  : "bg-[#fbeed8] border-[#eed3ab]"
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Eyebrow className={allTodayStaged && todayAppts.length > 0 ? "!text-[#d3e6d7]" : "!text-[#8a4f1c]"}>
                      Today
                      {apptLocationId !== "all" && (
                        <> · {locations.find((l) => l.id === apptLocationId)?.name}</>
                      )}
                    </Eyebrow>
                    <div className={`font-display text-2xl font-black mt-1 leading-tight ${
                      allTodayStaged && todayAppts.length > 0 ? "text-white" : "text-[#241a12]"
                    }`}>
                      {todayAppts.length === 0
                        ? "No pickups today"
                        : `${todayAppts.length} pickup${todayAppts.length !== 1 ? "s" : ""} · ${todayItems} item${todayItems !== 1 ? "s" : ""}`}
                    </div>
                  </div>
                  {todayAppts.length > 0 && (
                    <div className="text-right shrink-0">
                      <div className={`font-display text-3xl font-black tabular-nums leading-none ${
                        allTodayStaged ? "text-white" : "text-[#8a4f1c]"
                      }`}>
                        {todayStaged}/{todayAppts.length}
                      </div>
                      <Eyebrow className={`mt-1 ${allTodayStaged ? "!text-[#d3e6d7]" : "!text-[#8a4f1c]"}`}>staged</Eyebrow>
                    </div>
                  )}
                </div>
                {todayAppts.length > 0 && (
                  <>
                    <div className={`mt-3 h-2.5 rounded-full overflow-hidden ${allTodayStaged ? "bg-white/25" : "bg-white"}`}>
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ${allTodayStaged ? "bg-white" : "bg-[#4a7c59]"}`}
                        style={{ width: `${(todayStaged / todayAppts.length) * 100}%` }}
                      />
                    </div>
                    <p className={`text-sm mt-2.5 ${allTodayStaged ? "text-[#d3e6d7]" : "text-[#6f5b46]"}`}>
                      {allTodayStaged
                        ? "Everything's boxed and labeled. You're ready for the day."
                        : `${todayAppts.length - todayStaged} order${todayAppts.length - todayStaged !== 1 ? "s" : ""} still to gather and label.`}
                    </p>
                  </>
                )}
              </div>

              {todayAppts.length > 0 && (
                <div className="space-y-2">
                  {todayAppts.map((a) => {
                    const expanded = selectedApptId === a.id;
                    return (
                      <div
                        key={a.id}
                        id={`appt-${a.id}`}
                        className={`border-2 rounded-2xl overflow-hidden ${
                          isLate(a)
                            ? "bg-[#fbeae6] border-[#c0392b]/60"
                            : a.stagedSpot ? "bg-white border-[#bfd9c5]" : "bg-white border-[#eed3ab]"
                        }`}
                      >
                        <button
                          onClick={() => setSelectedApptId(expanded ? null : a.id)}
                          className="w-full min-h-[56px] text-left px-4 py-3.5 flex items-center gap-3 hover:bg-[#faf5ea] transition-colors"
                        >
                          {/* Time leads — you work a day in time order. */}
                          <div className="shrink-0 w-14 text-center">
                            <div className={`font-display text-lg font-black leading-tight tabular-nums ${isLate(a) ? "text-[#a1321f]" : "text-[#241a12]"}`}>
                              {fmtTimeOnly(a.startsAt).replace(/\s?(AM|PM)/, "")}
                            </div>
                            <div className="text-[10px] font-black text-[#8a7559] uppercase tracking-wide">
                              {fmtTimeOnly(a.startsAt).includes("PM") ? "PM" : "AM"}
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-[#241a12] truncate">
                              {bidderPrimary(a.bidder)}
                            </div>
                            {bidderSecondary(a.bidder) && (
                              <div className="text-sm text-[#8a7559] truncate">{bidderSecondary(a.bidder)}</div>
                            )}
                            <div className="text-sm text-[#6f5b46] flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                              <span>{a.items.length} item{a.items.length !== 1 ? "s" : ""}</span>
                              <ApptChips a={a} />
                            </div>
                          </div>
                          {a.stagedSpot ? (
                            <span className="shrink-0 inline-flex items-center gap-1 bg-[#4a7c59] text-white rounded-lg px-2.5 py-1.5 text-sm font-bold">
                              <Check />
                              {a.stagedSpot}
                            </span>
                          ) : (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => { e.stopPropagation(); setSelectedApptId(a.id); setStagingApptId(a.id); setStageSpot(""); }}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setSelectedApptId(a.id); setStagingApptId(a.id); setStageSpot(""); } }}
                              className="shrink-0 inline-flex items-center min-h-[44px] bg-[#c47b3e] hover:bg-[#a85f28] text-white rounded-xl px-3.5 text-sm font-bold cursor-pointer transition-colors shadow-sm"
                            >
                              Stage
                            </span>
                          )}
                        </button>
                        {expanded && <ApptDetail a={a} />}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── Later ── everything beyond today ── */}
            <Panel title="Coming up" sub={`${laterAppts.length} booked beyond today`}>
              {scheduled.length === 0 ? (
                <Empty text="No upcoming appointments yet." sub="Winners book their own slot once they've paid." />
              ) : (
                <div className="p-3 sm:p-4 space-y-3">
                  <SearchBox
                    type="text"
                    value={apptSearch}
                    onChange={(e) => setApptSearch(e.target.value)}
                    placeholder="Search customer or item…"
                  />
                  {laterAppts.length === 0 ? (
                    <p className="text-base text-[#8a7559] px-1 py-3">
                      {apptSearch ? "No matches." : "Nothing scheduled beyond today."}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {laterAppts.map((a) => {
                        const expanded = selectedApptId === a.id;
                        return (
                          <div key={a.id} id={`appt-${a.id}`} className={`border rounded-2xl overflow-hidden ${isLate(a) ? "bg-[#fbeae6] border-[#c0392b]/60 border-2" : "bg-white border-[#e6dac6]"}`}>
                            {/* Compact row — name, time, location, item count. Click to expand. */}
                            <button
                              onClick={() => setSelectedApptId(expanded ? null : a.id)}
                              className="w-full min-h-[56px] text-left px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#faf5ea] transition-colors"
                            >
                              <div className="min-w-0">
                                <div className="font-bold text-[#241a12] truncate">
                                  {bidderPrimary(a.bidder)}
                                </div>
                                {bidderSecondary(a.bidder) && (
                                  <div className="text-sm text-[#8a7559] truncate">{bidderSecondary(a.bidder)}</div>
                                )}
                                <div className="text-sm text-[#6f5b46] mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className={`font-bold ${isLate(a) ? "text-[#a1321f]" : "text-[#241a12]"}`}>{fmtDateTime(a.startsAt)}</span>
                                  <ApptChips a={a} />
                                  {/* Staged orders are ready to hand over — call that out on the row. */}
                                  {a.stagedSpot && (
                                    <span className="inline-flex items-center gap-1 bg-[#e6f1e8] text-[#2f5d3a] border border-[#bfd9c5] rounded-full px-2 py-0.5 font-bold">
                                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 5.5h12v8H2zM2 5.5 4 2.5h8l2 3M8 2.5v11" /></svg>
                                      {a.stagedSpot}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-full bg-[#f1e7d5] text-[#563e2c] text-sm font-bold tabular-nums">
                                  {a.items.length}
                                </span>
                                <Chevron open={expanded} />
                              </div>
                            </button>

                            {/* Expanded detail — items + actions */}
                            {expanded && <ApptDetail a={a} />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </Panel>

            {/* Collected — collapsed by default, reveal with the arrow */}
            {collected.length > 0 && (
              <Panel
                title="Picked up"
                sub={`${collected.length} collected`}
                action={
                  <Btn onClick={() => setShowCollected((v) => !v)} tone="slate" variant="ghost" size="sm" className="min-h-[44px]">
                    {showCollected ? "Hide" : "Show"}
                    <Chevron open={showCollected} size={16} />
                  </Btn>
                }
              >
                {showCollected && (
                <div className="p-3 sm:p-4 space-y-2">
                  <SearchBox
                    type="text"
                    value={collectedSearch}
                    onChange={(e) => setCollectedSearch(e.target.value)}
                    placeholder="Search picked-up orders by name, email or phone…"
                  />
                  {!collectedSearch.trim() && collected.length > 5 && (
                    <p className="text-sm text-[#8a7559] px-1">Showing the 5 most recent · search to find older ones.</p>
                  )}
                  {collectedSearch.trim() && collectedShown.length === 0 && (
                    <p className="text-sm text-[#8a7559] px-1 py-2">No picked-up orders match &ldquo;{collectedSearch.trim()}&rdquo;.</p>
                  )}
                  {/* Collected orders open up like any other, so a mis-tap can be undone. */}
                  {collectedShown.map((a) => {
                    const expanded = selectedApptId === a.id;
                    return (
                      <div key={a.id} id={`appt-${a.id}`} className="bg-white border border-[#e6dac6] rounded-2xl overflow-hidden">
                        <button
                          onClick={() => setSelectedApptId(expanded ? null : a.id)}
                          className="w-full min-h-[56px] text-left px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#faf5ea] transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-[#241a12] truncate">{bidderPrimary(a.bidder)}</div>
                            {bidderSecondary(a.bidder) && (
                              <div className="text-sm text-[#8a7559] truncate">{bidderSecondary(a.bidder)}</div>
                            )}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#6f5b46] mt-1">
                              <span>{fmtDateTime(a.startsAt)}</span>
                              <LocationBadge name={a.location.name} size="sm" />
                              <span>· {a.items.length} item{a.items.length !== 1 ? "s" : ""}</span>
                            </div>
                          </div>
                          <Pill tone="green">Picked up</Pill>
                          <Chevron open={expanded} />
                        </button>

                        {expanded && (
                          <div className="px-4 pb-4 pt-1 border-t border-[#f0e6d6]">
                            {(a.bidder.email || a.bidder.phone) && (
                              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-3 text-base text-[#6f5b46]">
                                {a.bidder.email && <span className="break-all">{a.bidder.email}</span>}
                                {a.bidder.phone && <span>{a.bidder.phone}</span>}
                              </div>
                            )}
                            <div className="mt-3">
                              <Eyebrow className="mb-2">
                                {a.items.length} item{a.items.length !== 1 ? "s" : ""} handed over
                              </Eyebrow>
                              <ul className="space-y-2">
                                {a.items.map((it) => (
                                  <li key={it.id} className="flex items-center gap-3 bg-[#faf5ea] border border-[#e6dac6] rounded-xl px-3 py-2">
                                    <span className="w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-[#efe3d0] grid place-items-center">
                                      {it.photo ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={it.photo} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        <span className="text-[10px] text-[#b3a085]">—</span>
                                      )}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      {it.itemCode && (
                                        <span className="font-mono font-bold text-[#6c4d39] text-sm">{it.itemCode} </span>
                                      )}
                                      <span className="text-base text-[#241a12]">{it.title}</span>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            <Btn
                              onClick={() => askConfirm(
                                "Reopen this pickup? Its items go back to waiting for collection and the appointment becomes active again. Use this if it was marked collected by mistake.",
                                () => reopenAppt(a.id),
                                { confirmLabel: "Reopen pickup" }
                              )}
                              tone="slate"
                              variant="outline"
                              full
                              className="mt-4"
                            >
                              Reopen — this wasn&apos;t picked up
                            </Btn>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                )}
              </Panel>
            )}
          </div>

          {/* ── Not booked yet — merged from the old Waiting tab into one pipeline.
              Same warehouse scope (the header switch) governs this section too. ── */}
          <div className="lg:col-span-2">
          <Panel title="Not booked yet" sub={waitingRowsScoped.length > 0 ? `${waitingRowsScoped.length} ${waitingRowsScoped.length === 1 ? "person" : "people"} paid, no slot yet` : "Paid winners without a pickup slot"}>
            {!waiting || waitingRowsScoped.length === 0 ? (
              <Empty
                text={scopedLocName ? `Nothing waiting at ${scopedLocName}.` : "Nobody's waiting."}
                sub="Everyone with won items has booked a pickup."
                icon={<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></svg>}
              />
            ) : (
              <div className="p-3 sm:p-4 space-y-3">
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { k: "People", v: waiting.totals.people, tone: "slate" },
                    { k: "Items", v: waiting.totals.items, tone: "slate" },
                    { k: "No location", v: waiting.totals.noLocation, tone: "amber" },
                  ].map((s) => (
                    <div key={s.k} className={`rounded-2xl border p-3 text-center ${
                      s.tone === "amber" && s.v > 0 ? "border-[#eed3ab] bg-[#fbeed8]" : "border-[#e6dac6] bg-[#faf5ea]"
                    }`}>
                      <Eyebrow className={s.tone === "amber" && s.v > 0 ? "!text-[#8a4f1c]" : ""}>{s.k}</Eyebrow>
                      <div className={`font-display text-2xl font-black tabular-nums mt-0.5 ${
                        s.tone === "amber" && s.v > 0 ? "text-[#8a4f1c]" : "text-[#241a12]"
                      }`}>{s.v}</div>
                    </div>
                  ))}
                </div>

                {waitingRowsScoped.length > 5 && (
                  <SearchBox
                    type="text"
                    value={waitingSearch}
                    onChange={(e) => setWaitingSearch(e.target.value)}
                    placeholder="Search by name, email or phone…"
                  />
                )}
                {waitingSearch.trim() && waitingRows.length === 0 && (
                  <p className="text-sm text-[#8a7559] px-1">No one waiting matches &ldquo;{waitingSearch.trim()}&rdquo;.</p>
                )}
                <ul className="space-y-2">
                  {waitingRows.map((w) => {
                    const scopedItems = w.itemList.filter((i) => atScope(i.warehouse));
                    const scopedGathered = scopedItems.filter((i) => i.grabbed).length;
                    const allScopedGathered = scopedItems.length > 0 && scopedGathered === scopedItems.length;
                    // Does this customer already have a booked pickup? If so, their loose
                    // items at that pickup's warehouse can be added straight to it.
                    // Pick the RIGHT pickup: the one at the warehouse you're working (or
                    // where their loose items actually are) — never blindly their first.
                    const custAppts = appointments
                      .filter((ap) => ap.clerkUserId === w.clerkUserId && ap.status === "SCHEDULED")
                      .sort((x, y) => new Date(x.startsAt).getTime() - new Date(y.startsAt).getTime());
                    const scopedName = apptLocationId !== "all" ? locations.find((l) => l.id === apptLocationId)?.name : undefined;
                    const custAppt =
                      (scopedName ? custAppts.find((ap) => ap.location.name === scopedName) : undefined) ??
                      custAppts.find((ap) => w.itemList.some((i) => !i.transferring && i.warehouse === ap.location.name)) ??
                      custAppts[0];
                    const addableToAppt = custAppt
                      ? w.itemList.filter((i) => !i.transferring && i.warehouse === custAppt.location.name)
                      : [];
                    const apptWhen = custAppt
                      ? new Date(custAppt.startsAt).toLocaleString("en-US", { timeZone: "America/Detroit", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                      : "";
                    return (
                    <li key={w.clerkUserId} id={`waiting-${w.clerkUserId}`} className={`border rounded-2xl p-4 ${
                      w.hasLocation ? "bg-white border-[#e6dac6]" : "bg-[#fbeed8]/60 border-[#eed3ab]"
                    }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-[#241a12] break-words">
                            {w.name || w.email || w.phone || "Unknown bidder"}
                          </div>
                          {/* Email always shown when there's also a name — it's how
                              you actually identify the many nameless bidders. */}
                          {w.name && w.email && (
                            <div className="text-sm text-[#8a7559] break-all">{w.email}</div>
                          )}
                          {w.phone && <div className="text-sm text-[#8a7559]">{w.phone}</div>}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-display text-2xl font-black text-[#241a12] tabular-nums leading-none">{scopedItems.length}</div>
                          <Eyebrow className="mt-0.5">item{scopedItems.length !== 1 ? "s" : ""}</Eyebrow>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-2.5">
                        {w.hasLocation ? (
                          <LocationBadge name={w.locationName ?? "Location set"} size="sm" />
                        ) : (
                          <Pill tone="amber" dot>No location picked</Pill>
                        )}
                        {w.gatherSpot ? (
                          <Pill tone="amber">Gathered: {w.gatherSpot}</Pill>
                        ) : allScopedGathered ? (
                          <Pill tone="green" dot>Gathered</Pill>
                        ) : null}
                        <span className="text-sm text-[#8a7559]">
                          waiting {w.waitingDays === 0 ? "today" : `${w.waitingDays} day${w.waitingDays !== 1 ? "s" : ""}`}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <Btn
                          onClick={() => setExpandedWaitingId(expandedWaitingId === w.clerkUserId ? null : w.clerkUserId)}
                          tone="slate"
                          variant="outline"
                          size="sm"
                          className="min-h-[44px]"
                        >
                          {expandedWaitingId === w.clerkUserId ? "Hide" : "Gather"}
                          {scopedItems.length > 0 && <span className="text-[#a3927b] tabular-nums">{scopedGathered}/{scopedItems.length}</span>}
                        </Btn>
                        <PrintLabelButton
                          href={`/api/admin/label?type=waiting&user=${encodeURIComponent(w.clerkUserId)}`}
                          label="Print label"
                          className={printBtnSmCls}
                        />
                        {w.phone ? (
                          <Btn
                            onClick={() => setMsgTarget({ clerkUserId: w.clerkUserId, name: w.name, phone: w.phone })}
                            tone="blue"
                            variant="outline"
                            size="sm"
                            className="min-h-[44px]"
                          >
                            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 3h12v8H5l-3 3V3z" /></svg>
                            Text
                          </Btn>
                        ) : (
                          <span className="text-sm text-[#a3927b]">No phone</span>
                        )}
                      </div>

                      {/* Customer already has a booked pickup at this warehouse — add these
                          loose / just-arrived items straight onto it. This is the missing
                          "click and add" so an arrived transfer isn't stranded. */}
                      {custAppt && addableToAppt.length > 0 && (
                        <Btn
                          onClick={() => addToAppointment(custAppt, addableToAppt.map((i) => i.id))}
                          disabled={addingApptId === custAppt.id}
                          tone="blue"
                          full
                          className="mt-3 !whitespace-normal text-left leading-snug py-2"
                        >
                          {addingApptId === custAppt.id ? (
                            "Adding…"
                          ) : (
                            <>
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" className="shrink-0"><path d="M8 3v10M3 8h10" /></svg>
                              <span>Add {addableToAppt.length} item{addableToAppt.length !== 1 ? "s" : ""} to their {apptWhen} pickup at {custAppt.location.name}</span>
                            </>
                          )}
                        </Btn>
                      )}

                      {/* Gather checklist — pull their items early, even with no appointment.
                          Transferring items can't be gathered until they arrive. */}
                      {expandedWaitingId === w.clerkUserId && (
                        <ul className="mt-3 space-y-2 border-t border-[#f0e6d6] pt-3">
                          {scopedItems.map((it) => (
                            <li key={it.id} className="flex items-stretch gap-2">
                              {it.transferring ? (
                                <div className="flex-1 flex items-start gap-2.5 rounded-xl px-4 py-2.5 bg-[#fbeed8] border border-[#eed3ab]">
                                  <span className="mt-0.5 text-[#c47b3e] shrink-0">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 7h13v9H1zM14 10h4l3 3v3h-7z" /><circle cx="5.5" cy="18" r="2" /><circle cx="17.5" cy="18" r="2" /></svg>
                                  </span>
                                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-base text-[#241a12] min-w-0">
                                    {it.itemCode && <span className="font-mono font-extrabold text-[#6c4d39]">{it.itemCode}</span>}
                                    <span className="font-semibold">{it.title}</span>
                                    <span className="text-[#8a4f1c] font-semibold">— awaiting transfer</span>
                                  </span>
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => toggleWaitingGrab(w.clerkUserId, it.id, !it.grabbed)}
                                    className={`flex-1 min-w-0 min-h-[48px] flex items-start gap-2.5 rounded-xl px-4 py-2.5 text-left transition-colors ${it.grabbed ? "bg-[#e6f1e8]" : "bg-[#f4ede1] hover:bg-[#efe3d0]"}`}
                                  >
                                    <span className={`mt-0.5 w-5 h-5 rounded-md border-2 grid place-items-center shrink-0 ${it.grabbed ? "bg-[#4a7c59] border-[#4a7c59] text-white" : "border-[#d9c7ab] text-transparent"}`}>
                                      <Check />
                                    </span>
                                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-base text-[#241a12] min-w-0">
                                      {it.itemCode && <span className="font-mono font-extrabold text-[#6c4d39]">{it.itemCode}</span>}
                                      <span className={`font-semibold ${it.grabbed ? "line-through text-[#6f5b46]" : ""}`}>{it.title}</span>
                                      {/* Just landed via transfer — warehouse known, spot not. Needs a human to place it. */}
                                      {it.needsPlacement && !it.grabbed && (
                                        <Pill tone="amber">Just arrived · place it</Pill>
                                      )}
                                      {/* Off the shelf once THIS item is grabbed or has its own gather spot.
                                          (Must be per-item — a newly won item on an already-gathered order
                                          is still on the shelf.) */}
                                      {!it.grabbed && !it.gatherSpot && (
                                        <>
                                          <span className="text-[#6f5b46]">— at</span>
                                          <LocationBadge name={it.warehouse || "Unassigned"} size="sm" />
                                          <span className="text-[#6f5b46]">· {it.storageLocation || "no spot"}</span>
                                        </>
                                      )}
                                    </span>
                                  </button>
                                  {PickedUpItemBtn(it.id)}
                                </>
                              )}
                            </li>
                          ))}
                          {/* Gather spot for this bundle (internal). */}
                          {scopedItems.length > 0 && (
                            <li className="pt-1">
                              {gatherWaitingId === w.clerkUserId ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <Input
                                    autoFocus
                                    value={waitingGatherSpot}
                                    onChange={(e) => setWaitingGatherSpot(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") saveWaitingGatherSpot(w.clerkUserId, scopedItems.map((i) => i.id), waitingGatherSpot); }}
                                    placeholder="Gather spot — e.g. Shelf B"
                                    className="flex-1 min-w-[130px] !w-auto text-base"
                                  />
                                  <Btn onClick={() => saveWaitingGatherSpot(w.clerkUserId, scopedItems.map((i) => i.id), waitingGatherSpot)} tone="amber">
                                    {w.gatherSpot ? "Update" : "Set spot"}
                                  </Btn>
                                  <Btn onClick={() => setGatherWaitingId(null)} tone="slate" variant="outline">Cancel</Btn>
                                  {w.gatherSpot && (
                                    <Btn onClick={() => saveWaitingGatherSpot(w.clerkUserId, scopedItems.map((i) => i.id), "")} tone="red" variant="ghost">Clear</Btn>
                                  )}
                                </div>
                              ) : (
                                <Btn
                                  onClick={() => { setGatherWaitingId(w.clerkUserId); setWaitingGatherSpot(w.gatherSpot ?? ""); }}
                                  tone={w.gatherSpot ? "slate" : "amber"}
                                  variant={w.gatherSpot ? "outline" : "solid"}
                                  size="sm"
                                  className="min-h-[44px]"
                                >
                                  {w.gatherSpot ? `Gathered in ${w.gatherSpot}` : "Set gather spot"}
                                </Btn>
                              )}
                            </li>
                          )}
                        </ul>
                      )}
                    </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Panel>
          </div>
          </div>
        ) : tab === "transfers" ? (
          // ── Transfers ──
          <div className="space-y-5 max-w-3xl">
            <Panel
              title="Active transfers"
              sub={`${activeTransfers.length}${scopedLocName ? ` of ${allActiveTransfers.length} · gathering at ${scopedLocName}` : " to move"}`}
              action={
                /* One print job with every transfer to pull from the selected warehouse
                   (one label per transfer) — walk the aisles, grab, gather for delivery. */
                activeTransfers.length > 0 ? (
                  <PrintLabelButton
                    href={`/api/admin/label?type=transfer-batch&location=${apptLocationId}`}
                    label={scopedLocName ? `Print all to pull · ${scopedLocName}` : "Print all transfers to pull"}
                    className={printBtnSmCls}
                  />
                ) : undefined
              }
            >
              {activeTransfers.length === 0 ? (
                <Empty
                  text={
                    allActiveTransfers.length === 0
                      ? "No transfers waiting."
                      : scopedLocName
                      ? `Nothing to gather at ${scopedLocName} right now.`
                      : "No transfers right now."
                  }
                  sub={allActiveTransfers.length === 0 ? "When a bidder asks for their items to be moved to another location, it shows up here." : undefined}
                />
              ) : (
                <div className="p-3 sm:p-4 space-y-2">
                {/* Collapsed to one line each — name, direction, item count, status.
                    Tap to open the gather list and the action buttons. */}
                {activeTransfers.map((t) => {
                  const expanded = expandedTransferId === t.id;
                  return (
                  <div key={t.id} id={`transfer-${t.id}`} className={`bg-white border rounded-2xl overflow-hidden ${t.status === "LOADED" ? "border-[#eed3ab]" : "border-[#e6dac6]"}`}>
                    <button
                      type="button"
                      onClick={() => setExpandedTransferId(expanded ? null : t.id)}
                      className="w-full min-h-[56px] text-left px-4 py-3.5 hover:bg-[#faf5ea] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-[#241a12] truncate">
                            {bidderPrimary(t.bidder)}
                          </div>
                          {bidderSecondary(t.bidder) && (
                            <div className="text-sm text-[#8a7559] truncate">{bidderSecondary(t.bidder)}</div>
                          )}
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-sm text-[#6f5b46]">
                            <LocationBadge name={transferFrom(t)} size="sm" />
                            <ArrowRight />
                            <LocationBadge name={t.toLocation.name} size="sm" />
                            <span>· {t.items.length} item{t.items.length !== 1 ? "s" : ""}</span>
                          </div>
                          {/* Gather marker on its own line so it doesn't squeeze the route.
                              Transfers are GATHERED (internal), never staged. */}
                          {t.gatherSpot ? (
                            <span className="inline-flex mt-1.5"><Pill tone="amber">Gathered: {t.gatherSpot}</Pill></span>
                          ) : t.items.length > 0 && t.items.every((i) => i.grabbed) ? (
                            <span className="inline-flex mt-1.5"><Pill tone="green" dot>Gathered</Pill></span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Pill tone={t.status === "LOADED" ? "amber" : "slate"} dot>
                            {t.status === "LOADED" ? "In transit" : "Requested"}
                          </Pill>
                          <Chevron open={expanded} />
                        </div>
                      </div>
                    </button>

                    {expanded && (
                      <div className="px-4 sm:px-5 pb-4 border-t border-[#f0e6d6] pt-4">
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-base text-[#6f5b46]">
                          {t.bidder.email && <span className="break-all">{t.bidder.email}</span>}
                          {t.bidder.phone && <span>{t.bidder.phone}</span>}
                        </div>
                        <div className="text-sm text-[#8a7559] mt-1">Requested {fmtDateTime(t.createdAt)}</div>

                        {/* Gathered banner — internal spot the bundle is set aside in
                            before loading. NOT staging (that's customer-facing at pickup). */}
                        {t.gatherSpot && (
                          <div className="mt-3 rounded-xl bg-[#c47b3e] text-white px-4 py-3">
                            <Eyebrow className="!text-[#fbeed8]">Gathered — ready to load</Eyebrow>
                            <div className="font-display text-xl font-black leading-tight mt-0.5">{t.gatherSpot}</div>
                            <p className="text-sm text-[#fbeed8] mt-1">Set aside for the team. Load &amp; drop off on transfer day.</p>
                          </div>
                        )}

                        <div className="mt-3">
                          <Eyebrow className="mb-2">
                            {t.items.filter((it) => atScope(it.fromLocationName)).length} item{t.items.filter((it) => atScope(it.fromLocationName)).length !== 1 ? "s" : ""} to gather{scopedLocName ? ` at ${scopedLocName}` : ""}
                          </Eyebrow>
                          <ul className="space-y-2">
                            {t.items.filter((it) => atScope(it.fromLocationName)).map((it) => (
                              <li key={it.id}>
                                <button
                                  type="button"
                                  onClick={() => toggleTransferGrab(t.id, it.id, !it.grabbed)}
                                  className={`w-full min-h-[48px] flex items-start gap-2.5 rounded-xl px-4 py-2.5 text-left transition-colors ${it.grabbed ? "bg-[#e6f1e8]" : "bg-[#f4ede1] hover:bg-[#efe3d0]"}`}
                                >
                                  <span className={`mt-0.5 w-5 h-5 rounded-md border-2 grid place-items-center shrink-0 ${it.grabbed ? "bg-[#4a7c59] border-[#4a7c59] text-white" : "border-[#d9c7ab] text-transparent"}`}>
                                    <Check />
                                  </span>
                                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-base text-[#241a12] min-w-0">
                                    {it.itemCode && <span className="font-mono font-extrabold text-[#6c4d39]">{it.itemCode}</span>}
                                    <span className={`font-semibold ${it.grabbed ? "line-through text-[#6f5b46]" : ""}`}>{it.title}</span>
                                    {/* Off the shelf once THIS item is grabbed or has its own gather spot. */}
                                    {!it.grabbed && !it.gatherSpot && (
                                      <>
                                        <span className="text-[#6f5b46]">— now at</span>
                                        <LocationBadge name={it.fromLocationName || "Unassigned"} size="sm" />
                                        <span className="text-[#6f5b46]">· {it.storageLocation || "no spot"}</span>
                                      </>
                                    )}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Print + Gather spot (internal; the customer never sees this). */}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <PrintLabelButton
                            href={`/api/admin/label?type=transfer&transfer=${t.id}`}
                            label="Print 4×6 label"
                            className={printBtnSmCls}
                          />
                          {(() => {
                            const scopedIds = t.items.filter((it) => atScope(it.fromLocationName)).map((it) => it.id);
                            return stagingTransferId === t.id ? (
                              <div className="flex flex-wrap items-center gap-2 w-full">
                                <Input
                                  autoFocus
                                  value={transferStageSpot}
                                  onChange={(e) => setTransferStageSpot(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") saveTransferGatherSpot(t.id, scopedIds, transferStageSpot); }}
                                  placeholder="Gather spot — e.g. Bay 3"
                                  className="flex-1 min-w-[130px] !w-auto text-base"
                                />
                                <Btn onClick={() => saveTransferGatherSpot(t.id, scopedIds, transferStageSpot)} tone="amber">
                                  {t.gatherSpot ? "Update spot" : "Set spot"}
                                </Btn>
                                <Btn onClick={() => setStagingTransferId(null)} tone="slate" variant="outline">Cancel</Btn>
                                {t.gatherSpot && (
                                  <Btn onClick={() => saveTransferGatherSpot(t.id, scopedIds, "")} tone="red" variant="ghost">Clear</Btn>
                                )}
                              </div>
                            ) : (
                              <Btn
                                onClick={() => { setStagingTransferId(t.id); setTransferStageSpot(t.gatherSpot ?? ""); }}
                                tone={t.gatherSpot ? "slate" : "amber"}
                                variant={t.gatherSpot ? "outline" : "solid"}
                                size="sm"
                                className="min-h-[44px]"
                              >
                                {t.gatherSpot ? `Gathered in ${t.gatherSpot}` : "Set gather spot"}
                              </Btn>
                            );
                          })()}
                        </div>
                        <div className="mt-3 flex flex-col sm:flex-row gap-3">
                          {t.status === "REQUESTED" && (
                            <Btn
                              onClick={() => askConfirm(
                                `Mark this transfer to ${t.toLocation.name} as loaded onto the truck?`,
                                () => setTransferStatus(t.id, "LOADED", t.toLocation.name),
                                { confirmLabel: "Mark Loaded" }
                              )}
                              variant="outline"
                              className="flex-1"
                            >
                              Mark Loaded
                            </Btn>
                          )}
                          <Btn
                            onClick={() => askConfirm(
                              `This moves the items to ${t.toLocation.name} and lets the bidder schedule — continue?`,
                              () => setTransferStatus(t.id, "COMPLETED", t.toLocation.name),
                              { confirmLabel: "Mark Dropped Off" }
                            )}
                            tone="green"
                            className="flex-1"
                          >
                            Mark Dropped Off
                          </Btn>
                        </div>
                        {t.status === "LOADED" && (
                          <Btn onClick={() => unloadTransfer(t.id)} tone="slate" variant="outline" full className="mt-2">
                            Undo &ldquo;loaded&rdquo; — back to gathering
                          </Btn>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
                </div>
              )}
            </Panel>

            {/* Recently completed — collapsed by default, reveal with the arrow */}
            {completedTransfersAll.length > 0 && (
              <Panel
                title="Recently completed"
                sub={`${completedTransfersAll.length} dropped off`}
                action={
                  <Btn onClick={() => setShowCompletedTransfers((v) => !v)} tone="slate" variant="ghost" size="sm" className="min-h-[44px]">
                    {showCompletedTransfers ? "Hide" : "Show"}
                    <Chevron open={showCompletedTransfers} size={16} />
                  </Btn>
                }
              >
                {showCompletedTransfers && (
                <div className="p-3 sm:p-4 space-y-2">
                  {completedTransfersAll.length > 5 && (
                    <SearchBox
                      type="text"
                      value={completedTransferSearch}
                      onChange={(e) => setCompletedTransferSearch(e.target.value)}
                      placeholder="Search completed by name, email or phone…"
                    />
                  )}
                  {completedTransferSearch.trim() && completedTransfers.length === 0 && (
                    <p className="text-sm text-[#8a7559] px-1 py-2">No completed transfers match &ldquo;{completedTransferSearch.trim()}&rdquo;.</p>
                  )}
                  {/* Completed drop-offs open up so a mis-tap can be undone. */}
                  {completedTransfers.map((t) => {
                    const open = expandedTransferId === t.id;
                    return (
                      <div key={t.id} className="bg-white border border-[#e6dac6] rounded-2xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setExpandedTransferId(open ? null : t.id)}
                          className="w-full min-h-[56px] text-left px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#faf5ea] transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-[#241a12] truncate">{bidderPrimary(t.bidder)}</div>
                            {bidderSecondary(t.bidder) && (
                              <div className="text-sm text-[#8a7559] truncate">{bidderSecondary(t.bidder)}</div>
                            )}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#6f5b46] mt-1">
                              <ArrowRight />
                              <LocationBadge name={t.toLocation.name} size="sm" />
                              <span>· {t.items.length} item{t.items.length !== 1 ? "s" : ""}
                              {t.completedAt ? ` · ${fmtDateTime(t.completedAt)}` : ""}</span>
                            </div>
                          </div>
                          <Pill tone="green">Dropped off</Pill>
                          <Chevron open={open} />
                        </button>

                        {open && (
                          <div className="px-4 pb-4 pt-1 border-t border-[#f0e6d6]">
                            <div className="mt-3">
                              <Eyebrow className="mb-2">
                                {t.items.length} item{t.items.length !== 1 ? "s" : ""} moved
                              </Eyebrow>
                              <ul className="space-y-1.5">
                                {t.items.map((it) => (
                                  <li key={it.id} className="text-base text-[#241a12] bg-[#faf5ea] border border-[#e6dac6] rounded-xl px-3 py-2">
                                    {it.title}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <Btn
                              onClick={() => askConfirm(
                                `Undo this drop-off? The ${t.items.length} item${t.items.length !== 1 ? "s go" : " goes"} back to the warehouse ${t.items.length !== 1 ? "they were" : "it was"} in before, and the transfer becomes active again. The "your items arrived" text already sent won't be recalled.`,
                                () => revertTransfer(t.id),
                                { confirmLabel: "Undo drop-off" }
                              )}
                              tone="slate"
                              variant="outline"
                              full
                              className="mt-4"
                            >
                              Undo — these weren&apos;t dropped off
                            </Btn>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!completedTransferSearch.trim() && completedTransfersHidden > 0 && (
                    <p className="text-[11px] text-[#a3927b] px-1 pt-1">
                      Showing 5 most recent. Search above to find any of the other {completedTransfersHidden}.
                    </p>
                  )}
                </div>
                )}
              </Panel>
            )}
          </div>
        ) : (
          // ── Locations & Hours ──
          <div className="space-y-5 max-w-3xl">
            {/* Adding a location happens once; setting hours happens constantly —
                so the form is collapsed and the locations themselves lead. */}
            <Panel>
              <button
                type="button"
                onClick={() => setShowAddLoc((v) => !v)}
                className="w-full px-4 sm:px-5 min-h-[56px] flex items-center justify-between gap-3 hover:bg-[#faf5ea] transition-colors"
              >
                <span className="inline-flex items-center gap-2 font-display text-lg font-black text-[#241a12]">
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" className="text-[#6c4d39]"><path d="M8 3v10M3 8h10" /></svg>
                  Add a pickup location
                </span>
                <Chevron open={showAddLoc} size={20} />
              </button>
              {showAddLoc && (
              <div className="space-y-3 px-4 sm:px-5 pb-5 pt-3 border-t border-[#f0e6d6]">
                <Input
                  value={newLoc.name}
                  onChange={(e) => setNewLoc({ ...newLoc, name: e.target.value })}
                  placeholder="Location name (e.g. Main Warehouse)"
                  className="text-base"
                />
                <Input
                  value={newLoc.address}
                  onChange={(e) => setNewLoc({ ...newLoc, address: e.target.value })}
                  placeholder="Address (optional)"
                  className="text-base"
                />
                <textarea
                  value={newLoc.instructions}
                  onChange={(e) => setNewLoc({ ...newLoc, instructions: e.target.value })}
                  placeholder="Instructions for bidders (optional)"
                  rows={2}
                  className={`${fieldCls} py-3 text-base`}
                />
                <Btn
                  onClick={() => { addLocation(); setShowAddLoc(false); }}
                  disabled={!newLoc.name.trim()}
                  full
                >
                  Add location
                </Btn>
              </div>
              )}
            </Panel>

            {locations.length === 0 ? (
              <Panel>
                <Empty text="No pickup locations yet." sub="Add one above and set its weekly hours." />
              </Panel>
            ) : (
              locations.map((loc) => (
                <LocationCard
                  key={loc.id}
                  loc={loc}
                  onToggle={() => toggleLocation(loc)}
                  onDelete={() => askConfirm(
                    "Delete this location and all its hours? You can only delete a location with no scheduled pickups or incoming transfers.",
                    () => deleteLocation(loc.id),
                    { confirmLabel: "Delete location", danger: true }
                  )}
                  onDeleteWindow={deleteWindow}
                  onWindowAdded={loadLocations}
                  flash={flash}
                />
              ))
            )}
          </div>
        )}
      </PageBody>

      {/* In-app confirmation dialog (replaces native confirm, which some webviews block) */}
      <MessageSheet target={msgTarget} onClose={() => setMsgTarget(null)} />

      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setConfirmDialog(null)}
        >
          <div
            className="bg-white rounded-2xl border border-[#e6dac6] max-w-sm w-full p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base text-[#241a12]">{confirmDialog.text}</p>
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

// ── Location card with window management ───────────────────────────────────────
function LocationCard({
  loc,
  onToggle,
  onDelete,
  onDeleteWindow,
  onWindowAdded,
  flash,
}: {
  loc: Location;
  onToggle: () => void;
  onDelete: () => void;
  onDeleteWindow: (wid: string) => void;
  onWindowAdded: () => void;
  flash: (text: string, ok: boolean) => void;
}) {
  const [win, setWin] = useState({ weekday: 3, start: "09:00", end: "17:00", slotMinutes: 30, capacityPerSlot: 2 });

  // ── Edit name / address / instructions in place ──────────────────────────
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: loc.name, address: loc.address ?? "", instructions: loc.instructions ?? "" });
  const [saving, setSaving] = useState(false);
  const startEdit = () => { setDraft({ name: loc.name, address: loc.address ?? "", instructions: loc.instructions ?? "" }); setEditing(true); };
  const saveEdit = async () => {
    if (!draft.name.trim()) { flash("Name can't be empty.", false); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/pickup/locations/${loc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, address: draft.address, instructions: draft.instructions }),
      });
      const d = await res.json();
      if (d.success) { flash("Location updated. Confirmation texts and the pickup page use the new details from now on.", true); setEditing(false); onWindowAdded(); }
      else flash(d.error || "Could not save.", false);
    } catch { flash("Something went wrong.", false); }
    setSaving(false);
  };

  const addWindow = async () => {
    const startMinutes = timeStrToMinutes(win.start);
    const endMinutes = timeStrToMinutes(win.end);
    if (startMinutes >= endMinutes) {
      flash("End time must be after start time.", false);
      return;
    }
    try {
      const res = await fetch(`/api/admin/pickup/locations/${loc.id}/windows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekday: win.weekday,
          startMinutes,
          endMinutes,
          slotMinutes: win.slotMinutes,
          capacityPerSlot: win.capacityPerSlot,
        }),
      });
      const d = await res.json();
      if (d.success) {
        flash("Hours added.", true);
        onWindowAdded();
      } else flash(d.error || "Could not add hours.", false);
    } catch {
      flash("Something went wrong.", false);
    }
  };

  // ── Block-off dates (vacations / holidays) ──
  const [bo, setBo] = useState({ start: "", end: "", reason: "" });
  const addBlackout = async () => {
    if (!bo.start) { flash("Pick a start date.", false); return; }
    try {
      const res = await fetch(`/api/admin/pickup/locations/${loc.id}/blackouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: bo.start, endDate: bo.end || bo.start, reason: bo.reason }),
      });
      const d = await res.json();
      if (d.success) { flash("Dates blocked off.", true); setBo({ start: "", end: "", reason: "" }); onWindowAdded(); }
      else flash(d.error || "Could not block off dates.", false);
    } catch { flash("Something went wrong.", false); }
  };
  const removeBlackout = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/pickup/blackouts/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (d.success) onWindowAdded(); else flash(d.error || "Could not remove.", false);
    } catch { flash("Something went wrong.", false); }
  };
  const fmtDay = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

  return (
    <Panel className={loc.isActive ? "" : "opacity-70"}>
      <div className="px-4 sm:px-5 py-4 border-b border-[#f0e6d6] flex flex-wrap items-start justify-between gap-3">
        {editing ? (
          <div className="min-w-0 flex-1 space-y-2">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name (e.g. Owosso)" className="font-bold" />
            <Input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="Street address, city, state zip" />
            <textarea value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} rows={2} placeholder="Instructions bidders see (porch pickup, where to park, who to text…)" className={`${fieldCls} py-3 text-sm`} />
            <div className="flex gap-2">
              <Btn onClick={saveEdit} disabled={saving} size="sm" className="min-h-[44px]">{saving ? "Saving…" : "Save"}</Btn>
              <Btn onClick={() => setEditing(false)} tone="slate" variant="ghost" size="sm" className="min-h-[44px]">Cancel</Btn>
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-display text-lg font-black text-[#241a12]">{loc.name}</div>
              {!loc.isActive && <Pill tone="amber" dot>Hidden from bidders</Pill>}
            </div>
            {loc.address && <div className="text-base text-[#6f5b46] mt-0.5">{loc.address}</div>}
            {loc.instructions && <div className="text-sm text-[#8a7559] mt-1">{loc.instructions}</div>}
          </div>
        )}
        <div className="flex flex-wrap gap-2 shrink-0">
          {!editing && (
            <Btn onClick={startEdit} variant="outline" size="sm" className="min-h-[44px]">
              Edit
            </Btn>
          )}
          <Btn onClick={onToggle} tone="slate" variant="outline" size="sm" className="min-h-[44px]">
            {loc.isActive ? "Hide" : "Show"}
          </Btn>
          <Btn onClick={onDelete} tone="red" variant="outline" size="sm" className="min-h-[44px]">
            Delete
          </Btn>
        </div>
      </div>

      <div className="px-4 sm:px-5 py-4">
        <Eyebrow className="mb-2">Weekly hours</Eyebrow>
        {loc.windows.length === 0 ? (
          <div className="text-base text-[#8a7559] mb-4">No hours set yet.</div>
        ) : (
          <div className="space-y-2 mb-4">
            {loc.windows.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-3 bg-[#f4ede1] border border-[#e6dac6] rounded-xl pl-4 pr-1.5 py-1.5 min-h-[48px]">
                <span className="text-base text-[#241a12]">
                  <span className="font-bold">{WEEKDAYS_SHORT[w.weekday]}</span>{" "}
                  {minutesToLabel(w.startMinutes)}–{minutesToLabel(w.endMinutes)} ·{" "}
                  {w.slotMinutes}-min slots · {w.capacityPerSlot} per slot
                </span>
                <Btn onClick={() => onDeleteWindow(w.id)} tone="red" variant="ghost" size="sm" className="shrink-0 min-h-[40px]">
                  Remove
                </Btn>
              </div>
            ))}
          </div>
        )}

        {/* Add window form */}
        <div className="bg-[#faf5ea] border border-[#e6dac6] rounded-xl p-4">
          <div className="font-display text-base font-black text-[#241a12] mb-3">Add hours</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className={labelCls}>Day</label>
              <select
                value={win.weekday}
                onChange={(e) => setWin({ ...win, weekday: Number(e.target.value) })}
                className={`${fieldCls} text-base`}
              >
                {WEEKDAYS.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Start</label>
              <Input
                type="time"
                value={win.start}
                onChange={(e) => setWin({ ...win, start: e.target.value })}
                className="text-base"
              />
            </div>
            <div>
              <label className={labelCls}>End</label>
              <Input
                type="time"
                value={win.end}
                onChange={(e) => setWin({ ...win, end: e.target.value })}
                className="text-base"
              />
            </div>
            <div>
              <label className={labelCls}>Slot length</label>
              <select
                value={win.slotMinutes}
                onChange={(e) => setWin({ ...win, slotMinutes: Number(e.target.value) })}
                className={`${fieldCls} text-base`}
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Capacity</label>
              <Input
                type="number"
                min={1}
                value={win.capacityPerSlot}
                onChange={(e) => setWin({ ...win, capacityPerSlot: Number(e.target.value) })}
                className="text-base"
              />
            </div>
            <div className="flex items-end">
              <Btn onClick={addWindow} full>
                Add
              </Btn>
            </div>
          </div>
        </div>

        {/* Block-off dates (vacations & holidays) */}
        <div className="mt-6">
          <Eyebrow className="mb-2">Block off dates (vacations &amp; holidays)</Eyebrow>
          {loc.blackouts.length > 0 && (
            <div className="space-y-2 mb-3">
              {loc.blackouts.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 bg-[#fbeed8] border border-[#eed3ab] rounded-xl pl-4 pr-1.5 py-1.5 min-h-[48px]">
                  <span className="text-base text-[#8a4f1c]">
                    <span className="font-bold">
                      {fmtDay(b.startDate)}{b.endDate !== b.startDate ? ` – ${fmtDay(b.endDate)}` : ""}
                    </span>
                    {b.reason ? <span> · {b.reason}</span> : null}
                  </span>
                  <Btn onClick={() => removeBlackout(b.id)} tone="red" variant="ghost" size="sm" className="shrink-0 min-h-[40px]">Remove</Btn>
                </div>
              ))}
            </div>
          )}
          <div className="bg-[#faf5ea] border border-[#e6dac6] rounded-xl p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>From</label>
                <Input type="date" value={bo.start} onChange={(e) => setBo({ ...bo, start: e.target.value })} className="text-base" />
              </div>
              <div>
                <label className={labelCls}>To <span className="font-semibold normal-case tracking-normal">(optional)</span></label>
                <Input type="date" value={bo.end} onChange={(e) => setBo({ ...bo, end: e.target.value })} className="text-base" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Reason <span className="font-semibold normal-case tracking-normal">(optional)</span></label>
                <Input type="text" value={bo.reason} onChange={(e) => setBo({ ...bo, reason: e.target.value })} placeholder="e.g. Vacation, Holiday" className="text-base" />
              </div>
              <div className="sm:col-span-2">
                <Btn onClick={addBlackout} className="w-full sm:w-auto">Block off these dates</Btn>
              </div>
            </div>
            <p className="text-sm text-[#8a7559] mt-2">Bidders can&apos;t schedule pickups on blocked days. Leave &ldquo;To&rdquo; empty to block a single day.</p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
