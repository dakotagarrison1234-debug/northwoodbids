"use client";
import { useState, useEffect, useCallback } from "react";
import LocationBadge from "@/app/components/LocationBadge";

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
}
interface Bidder {
  name: string | null;
  email: string | null;
  phone: string | null;
}
interface Appointment {
  id: string;
  startsAt: string;
  status: "SCHEDULED" | "COLLECTED" | "CANCELLED";
  notes: string | null;
  clerkUserId: string;
  locationId: string;
  location: { id: string; name: string };
  items: ApptItem[];
  bidder: Bidder;
}
interface TransferItem {
  id: string;
  title: string;
  fromLocationName: string | null;
  storageLocation: string | null;
}
interface Transfer {
  id: string;
  status: "REQUESTED" | "LOADED" | "COMPLETED" | "CANCELLED";
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
  const [tab, setTab] = useState<"appointments" | "locations" | "transfers">("appointments");
  const [selectedApptId, setSelectedApptId] = useState<string | null>(null);
  const [showCollected, setShowCollected] = useState(false);
  const [showCompletedTransfers, setShowCompletedTransfers] = useState(false);
  // Transfers are collapsed to one line each until tapped, and filterable by
  // direction ("Gladwin → Owosso") so a run can be picked out at a glance.
  const [expandedTransferId, setExpandedTransferId] = useState<string | null>(null);
  const [transferDir, setTransferDir] = useState<string>("all");
  const [apptSearch, setApptSearch] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
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

  useEffect(() => {
    Promise.all([loadAppointments(), loadLocations(), loadTransfers()]).finally(() => setLoading(false));
  }, [loadAppointments, loadLocations, loadTransfers]);

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  };

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

  const scheduled = appointments.filter((a) => a.status === "SCHEDULED");
  const collected = appointments.filter((a) => a.status === "COLLECTED");

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
  const allActiveTransfers = transfers.filter(
    (t) => t.status === "REQUESTED" || t.status === "LOADED"
  );
  const completedTransfers = transfers.filter((t) => t.status === "COMPLETED");

  // A transfer's "from" comes off its items (they're the things being moved). Almost
  // always one warehouse; if a run somehow spans two, say so rather than pick one.
  const transferFrom = (t: Transfer): string => {
    const names = [...new Set(t.items.map((i) => i.fromLocationName).filter(Boolean))] as string[];
    if (names.length === 0) return "Unassigned";
    if (names.length === 1) return names[0];
    return "Multiple";
  };
  const transferDirLabel = (t: Transfer) => `${transferFrom(t)} → ${t.toLocation.name}`;

  // Direction chips are built from the transfers that actually exist, so you only
  // ever see runs you really have (Gladwin → Owosso, Owosso → Gladwin, …).
  const directionCounts = new Map<string, number>();
  for (const t of allActiveTransfers) {
    const label = transferDirLabel(t);
    directionCounts.set(label, (directionCounts.get(label) ?? 0) + 1);
  }
  const directions = [...directionCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const activeTransfers =
    transferDir === "all"
      ? allActiveTransfers
      : allActiveTransfers.filter((t) => transferDirLabel(t) === transferDir);

  return (
    <>
      <header className="border-b border-[#e3d6bf] px-6 sm:px-8 py-4">
        <h1 className="text-2xl sm:text-3xl font-semibold">Pickup Scheduling</h1>
        <p className="text-[#8a7559] text-base mt-0.5">Manage appointments and pickup hours</p>
        <div className="flex gap-2 mt-4 flex-wrap">
          {(["appointments", "locations", "transfers"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative px-5 py-2.5 rounded-xl text-base font-semibold transition-colors ${
                tab === t
                  ? "bg-[#6c4d39] text-white"
                  : "bg-white border border-[#e3d6bf] text-[#6f5b46] hover:bg-[#efe3d0]"
              }`}
            >
              {t === "appointments" ? "Appointments" : t === "locations" ? "Locations & Hours" : "Transfers"}
              {t === "transfers" && activeTransfers.length > 0 && (
                <span className={`ml-2 inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full text-sm font-bold ${
                  tab === t ? "bg-white text-[#6c4d39]" : "bg-[#6c4d39] text-white"
                }`}>
                  {activeTransfers.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      {msg && (
        <div
          className={`mx-4 sm:mx-8 mt-4 rounded-xl px-4 py-3 text-base font-medium border ${
            msg.ok
              ? "bg-[#5f7a45]/10 text-[#5f7a45] border-[#5f7a45]/30"
              : "bg-red-50 text-red-600 border-red-500/20"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="px-6 sm:px-8 py-6">
        {loading ? (
          <div className="text-center py-20 text-base text-[#8a7559]">Loading…</div>
        ) : tab === "appointments" ? (
          <div className="space-y-8">
            {/* Scheduled — master/detail: pick a customer, see only their items */}
            <div>
              <h2 className="text-xl font-semibold mb-4">
                Upcoming ({scheduled.length})
              </h2>
              {scheduled.length === 0 ? (
                <div className="text-base text-[#8a7559] bg-white border border-[#e3d6bf] rounded-xl px-5 py-8 text-center">
                  No upcoming appointments yet.
                </div>
              ) : (
                <div className="space-y-3 max-w-3xl">
                  <input
                    type="text"
                    value={apptSearch}
                    onChange={(e) => setApptSearch(e.target.value)}
                    placeholder="Search customer or item…"
                    className="w-full bg-white border border-[#cdbda3] rounded-xl px-4 py-3 text-base focus:outline-none focus:border-[#6c4d39]"
                  />
                  {filteredScheduled.length === 0 ? (
                    <p className="text-base text-[#8a7559] px-1 py-3">No matches.</p>
                  ) : (
                    <div className="space-y-2">
                      {filteredScheduled.map((a) => {
                        const expanded = selectedApptId === a.id;
                        return (
                          <div key={a.id} className="bg-white border border-[#e3d6bf] rounded-xl overflow-hidden">
                            {/* Compact row — name, time, location, item count. Click to expand. */}
                            <button
                              onClick={() => setSelectedApptId(expanded ? null : a.id)}
                              className="w-full text-left px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-[#efe3d0]/50 transition-colors"
                            >
                              <div className="min-w-0">
                                <div className="font-semibold text-[#241a12] truncate">
                                  {a.bidder.name || "Unknown Bidder"}
                                </div>
                                <div className="text-sm text-[#6f5b46] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="font-semibold text-[#241a12]">{fmtDateTime(a.startsAt)}</span>
                                  <LocationBadge name={a.location.name} size="sm" />
                                </div>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-full bg-[#6c4d39]/10 text-[#6c4d39] text-sm font-bold">
                                  {a.items.length}
                                </span>
                                <span className={`text-[#8a7559] transition-transform ${expanded ? "rotate-180" : ""}`}>
                                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
                                </span>
                              </div>
                            </button>

                            {/* Expanded detail — items + actions */}
                            {expanded && (
                              <div className="px-5 pb-5 pt-1 border-t border-[#efe3d0]">
                                {(a.bidder.email || a.bidder.phone) && (
                                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-3 text-base text-[#6f5b46]">
                                    {a.bidder.email && <span>{a.bidder.email}</span>}
                                    {a.bidder.phone && <span>{a.bidder.phone}</span>}
                                  </div>
                                )}

                                <div className="mt-4">
                                  <div className="text-sm font-semibold text-[#8a7559] uppercase tracking-wide mb-2">
                                    {a.items.length} item{a.items.length !== 1 ? "s" : ""} to gather
                                  </div>
                                  <ul className="text-base text-[#241a12] space-y-2">
                                    {a.items.map((it) => (
                                      <li key={it.id} className="flex items-start gap-2 bg-[#f1e7d5] rounded-xl px-4 py-2.5">
                                        {it.itemCode && (
                                          <span className="font-mono font-bold text-[#6c4d39] bg-[#6c4d39]/10 border border-[#6c4d39]/20 rounded px-1.5 py-0.5 text-sm shrink-0">{it.itemCode}</span>
                                        )}
                                        <span>{it.title}{it.storageLocation ? <span className="text-[#8a7559] text-sm"> · {it.storageLocation}</span> : null}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                {/* Reschedule editor */}
                                {editingApptId === a.id ? (
                                  <div className="mt-4 bg-[#f1e7d5] rounded-xl p-4 space-y-3">
                                    <div>
                                      <label className="block text-base font-semibold mb-1">Date & time (Michigan)</label>
                                      <input
                                        type="datetime-local"
                                        value={editStartsAt}
                                        onChange={(e) => setEditStartsAt(e.target.value)}
                                        className="w-full bg-white border border-[#cdbda3] rounded-xl px-4 py-3 text-base"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-base font-semibold mb-1">Location</label>
                                      <select
                                        value={editLocationId}
                                        onChange={(e) => setEditLocationId(e.target.value)}
                                        className="w-full bg-white border border-[#cdbda3] rounded-xl px-4 py-3 text-base"
                                      >
                                        {locations.map((l) => (
                                          <option key={l.id} value={l.id}>{l.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => saveReschedule(a.id)}
                                        className="flex-1 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-semibold text-base py-3 rounded-xl"
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={() => setEditingApptId(null)}
                                        className="flex-1 bg-white border border-[#cdbda3] text-[#6f5b46] font-semibold text-base py-3 rounded-xl"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <button
                                      onClick={() => startEdit(a)}
                                      className="bg-white border border-[#cdbda3] text-[#6f5b46] hover:bg-[#efe3d0] font-semibold text-base px-4 py-2.5 rounded-xl"
                                    >
                                      Reschedule
                                    </button>
                                    <button
                                      onClick={() => askConfirm(
                                        "Mark this appointment as collected? All its items will be marked picked up.",
                                        () => markCollected(a.id),
                                        { confirmLabel: "Mark Collected" }
                                      )}
                                      className="bg-[#5f7a45] hover:bg-[#4f6639] text-white font-semibold text-base px-4 py-2.5 rounded-xl"
                                    >
                                      Mark Collected
                                    </button>
                                    <button
                                      onClick={() => askConfirm(
                                        "Cancel this appointment? Its items will return to the unscheduled list.",
                                        () => cancelAppt(a.id),
                                        { confirmLabel: "Cancel appointment", danger: true }
                                      )}
                                      className="bg-white border border-red-500/30 text-red-600 hover:bg-red-50 font-semibold text-base px-4 py-2.5 rounded-xl"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Collected — collapsed by default, reveal with the arrow */}
            {collected.length > 0 && (
              <div>
                <button
                  onClick={() => setShowCollected((v) => !v)}
                  className="w-full flex items-center justify-between gap-3 max-w-3xl mb-4 group"
                >
                  <h2 className="text-xl font-semibold">Collected ({collected.length})</h2>
                  <span className={`text-[#8a7559] transition-transform ${showCollected ? "rotate-180" : ""}`}>
                    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
                  </span>
                </button>
                {showCollected && (
                <div className="space-y-3 max-w-3xl">
                  {collected.map((a) => (
                    <div key={a.id} className="bg-white/60 border border-[#e3d6bf] rounded-xl px-5 py-4 opacity-75">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-base text-[#241a12]">{a.bidder.name || "Unknown Bidder"}</div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-[#8a7559]">
                            <span className="font-semibold text-[#241a12]">{fmtDateTime(a.startsAt)}</span>
                            <LocationBadge name={a.location.name} size="sm" />
                            <span>· {a.items.length} item{a.items.length !== 1 ? "s" : ""}</span>
                          </div>
                        </div>
                        <span className="text-sm bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-full font-bold">
                          Collected
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </div>
            )}
          </div>
        ) : tab === "transfers" ? (
          // ── Transfers ──
          <div className="space-y-4 max-w-3xl">
            <h2 className="text-xl font-semibold">
              Active transfers ({activeTransfers.length}
              {transferDir !== "all" ? ` of ${allActiveTransfers.length}` : ""})
            </h2>

            {/* Direction filter — pick a run (Gladwin → Owosso) and see only that. */}
            {directions.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setTransferDir("all"); setExpandedTransferId(null); }}
                  className={`px-3.5 py-2 rounded-xl text-sm font-bold border transition-colors ${
                    transferDir === "all"
                      ? "bg-[#6c4d39] text-white border-[#6c4d39]"
                      : "bg-white text-[#4a3a2b] border-[#cdbda3] hover:bg-[#efe3d0]"
                  }`}
                >
                  All ({allActiveTransfers.length})
                </button>
                {directions.map(([label, count]) => (
                  <button
                    key={label}
                    onClick={() => { setTransferDir(label); setExpandedTransferId(null); }}
                    className={`px-3.5 py-2 rounded-xl text-sm font-bold border transition-colors ${
                      transferDir === label
                        ? "bg-[#6c4d39] text-white border-[#6c4d39]"
                        : "bg-white text-[#4a3a2b] border-[#cdbda3] hover:bg-[#efe3d0]"
                    }`}
                  >
                    {label} ({count})
                  </button>
                ))}
              </div>
            )}

            {activeTransfers.length === 0 ? (
              <div className="text-base text-[#8a7559] bg-white border border-[#e3d6bf] rounded-xl px-5 py-8 text-center">
                {allActiveTransfers.length === 0
                  ? "No transfers waiting. When a bidder asks for their items to be moved to another location, it shows up here."
                  : "No transfers on this run right now."}
              </div>
            ) : (
              // Collapsed to one line each — name, direction, item count, status.
              // Tap to open the gather list and the action buttons.
              activeTransfers.map((t) => {
                const expanded = expandedTransferId === t.id;
                return (
                <div key={t.id} className="bg-white border border-[#cdbda3] rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedTransferId(expanded ? null : t.id)}
                    className="w-full text-left px-5 py-4 hover:bg-[#faf5ea] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-lg font-semibold text-[#241a12] truncate">
                          {t.bidder.name || "Unknown Bidder"}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-base text-[#6f5b46]">
                          <LocationBadge name={transferFrom(t)} size="sm" />
                          <span aria-hidden>→</span>
                          <LocationBadge name={t.toLocation.name} size="sm" />
                          <span>· {t.items.length} item{t.items.length !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-sm px-3 py-1 rounded-full font-bold border ${
                            t.status === "LOADED"
                              ? "bg-[#efe0c9] text-[#8a5a2b] border-[#e3c9a3]"
                              : "bg-amber-50 text-amber-600 border-amber-200"
                          }`}
                        >
                          {t.status === "LOADED" ? "In transit" : "Requested"}
                        </span>
                        <span className={`text-[#8a7559] transition-transform ${expanded ? "rotate-180" : ""}`}>
                          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
                        </span>
                      </div>
                    </div>
                  </button>

                  {expanded && (
                    <div className="px-5 pb-4 border-t border-[#efe3d0] pt-4">
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-base text-[#6f5b46]">
                        {t.bidder.email && <span>{t.bidder.email}</span>}
                        {t.bidder.phone && <span>{t.bidder.phone}</span>}
                      </div>
                      <div className="text-sm text-[#8a7559] mt-1">Requested {fmtDateTime(t.createdAt)}</div>

                      <div className="mt-3">
                        <div className="text-sm font-semibold text-[#8a7559] uppercase tracking-wide mb-2">
                          {t.items.length} item{t.items.length !== 1 ? "s" : ""} to gather
                        </div>
                        <ul className="space-y-2">
                          {t.items.map((it) => (
                            <li key={it.id} className="flex items-start gap-2 bg-[#f1e7d5] rounded-xl px-4 py-2.5">
                              <span className="text-[#5f7a45] mt-0.5">☐</span>
                              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-base text-[#241a12]">
                                <span className="font-semibold">{it.title}</span>
                                <span className="text-[#6f5b46]">— now at</span>
                                <LocationBadge name={it.fromLocationName || "Unassigned"} size="sm" />
                                <span className="text-[#6f5b46]">· {it.storageLocation || "no spot"}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="mt-4 flex flex-col sm:flex-row gap-3">
                        {t.status === "REQUESTED" && (
                          <button
                            onClick={() => setTransferStatus(t.id, "LOADED", t.toLocation.name)}
                            className="flex-1 bg-white border-2 border-[#6c4d39] text-[#6c4d39] hover:bg-[#efe3d0] font-semibold text-base py-3.5 rounded-xl transition-colors"
                          >
                            Mark Loaded
                          </button>
                        )}
                        <button
                          onClick={() => askConfirm(
                            `This moves the items to ${t.toLocation.name} and lets the bidder schedule — continue?`,
                            () => setTransferStatus(t.id, "COMPLETED", t.toLocation.name),
                            { confirmLabel: "Mark Dropped Off" }
                          )}
                          className="flex-1 bg-[#5f7a45] hover:bg-[#4f6639] text-white font-semibold text-base py-3.5 rounded-xl transition-colors"
                        >
                          Mark Dropped Off
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                );
              })
            )}

            {/* Recently completed — collapsed by default, reveal with the arrow */}
            {completedTransfers.length > 0 && (
              <div className="pt-4">
                <button
                  onClick={() => setShowCompletedTransfers((v) => !v)}
                  className="w-full flex items-center justify-between gap-3 mb-3"
                >
                  <h3 className="text-lg font-semibold">Recently completed ({completedTransfers.length})</h3>
                  <span className={`text-[#8a7559] transition-transform ${showCompletedTransfers ? "rotate-180" : ""}`}>
                    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
                  </span>
                </button>
                {showCompletedTransfers && (
                <div className="space-y-3">
                  {completedTransfers.map((t) => (
                    <div key={t.id} className="bg-white/60 border border-[#e3d6bf] rounded-xl px-5 py-4 opacity-75">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-base text-[#241a12]">{t.bidder.name || "Unknown Bidder"}</div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-[#8a7559]">
                            <span aria-hidden>→</span>
                            <LocationBadge name={t.toLocation.name} size="sm" />
                            <span>· {t.items.length} item{t.items.length !== 1 ? "s" : ""}
                            {t.completedAt ? ` · ${fmtDateTime(t.completedAt)}` : ""}</span>
                          </div>
                        </div>
                        <span className="text-sm bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-full font-bold">
                          Dropped off
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </div>
            )}
          </div>
        ) : (
          // ── Locations & Hours ──
          <div className="space-y-8 max-w-3xl">
            {/* Add location form */}
            <div className="bg-white border border-[#e3d6bf] rounded-xl p-5">
              <h2 className="text-xl font-semibold mb-4">Add a pickup location</h2>
              <div className="space-y-3">
                <input
                  value={newLoc.name}
                  onChange={(e) => setNewLoc({ ...newLoc, name: e.target.value })}
                  placeholder="Location name (e.g. Main Warehouse)"
                  className="w-full bg-white border border-[#cdbda3] rounded-xl px-4 py-3 text-base"
                />
                <input
                  value={newLoc.address}
                  onChange={(e) => setNewLoc({ ...newLoc, address: e.target.value })}
                  placeholder="Address (optional)"
                  className="w-full bg-white border border-[#cdbda3] rounded-xl px-4 py-3 text-base"
                />
                <textarea
                  value={newLoc.instructions}
                  onChange={(e) => setNewLoc({ ...newLoc, instructions: e.target.value })}
                  placeholder="Instructions for bidders (optional)"
                  rows={2}
                  className="w-full bg-white border border-[#cdbda3] rounded-xl px-4 py-3 text-base"
                />
                <button
                  onClick={addLocation}
                  disabled={!newLoc.name.trim()}
                  className="bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-40 text-white font-semibold text-base px-6 py-3 rounded-xl"
                >
                  Add location
                </button>
              </div>
            </div>

            {locations.length === 0 ? (
              <div className="text-base text-[#8a7559] bg-white border border-[#e3d6bf] rounded-xl px-5 py-8 text-center">
                No pickup locations yet. Add one above.
              </div>
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
      </div>

      {/* In-app confirmation dialog (replaces native confirm, which some webviews block) */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setConfirmDialog(null)}
        >
          <div
            className="bg-white rounded-2xl border border-[#cdbda3] max-w-sm w-full p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base text-[#241a12]">{confirmDialog.text}</p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="flex-1 bg-white border border-[#cdbda3] text-[#6f5b46] hover:bg-[#efe3d0] font-semibold text-base py-3 rounded-xl"
              >
                Back
              </button>
              <button
                onClick={() => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); fn(); }}
                className={`flex-1 text-white font-semibold text-base py-3 rounded-xl ${
                  confirmDialog.danger ? "bg-red-600 hover:bg-red-700" : "bg-[#6c4d39] hover:bg-[#563e2c]"
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
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
    <div className={`bg-white border rounded-xl overflow-hidden ${loc.isActive ? "border-[#cdbda3]" : "border-[#e3d6bf] opacity-70"}`}>
      <div className="px-5 py-4 border-b border-[#e3d6bf] flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-[#241a12]">{loc.name}</div>
          {loc.address && <div className="text-base text-[#6f5b46] mt-0.5">{loc.address}</div>}
          {loc.instructions && <div className="text-sm text-[#8a7559] mt-1">{loc.instructions}</div>}
          {!loc.isActive && <div className="text-sm text-amber-600 font-semibold mt-1">Hidden from bidders</div>}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onToggle}
            className="bg-white border border-[#cdbda3] text-[#6f5b46] hover:bg-[#efe3d0] font-semibold text-sm px-3 py-2 rounded-xl"
          >
            {loc.isActive ? "Hide" : "Show"}
          </button>
          <button
            onClick={onDelete}
            className="bg-white border border-red-500/30 text-red-600 hover:bg-red-50 font-semibold text-sm px-3 py-2 rounded-xl"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="text-sm font-semibold text-[#8a7559] uppercase tracking-wide mb-2">Weekly hours</div>
        {loc.windows.length === 0 ? (
          <div className="text-base text-[#8a7559] mb-4">No hours set yet.</div>
        ) : (
          <div className="space-y-2 mb-4">
            {loc.windows.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-3 bg-[#f1e7d5] rounded-xl px-4 py-2.5">
                <span className="text-base text-[#241a12]">
                  <span className="font-semibold">{WEEKDAYS_SHORT[w.weekday]}</span>{" "}
                  {minutesToLabel(w.startMinutes)}–{minutesToLabel(w.endMinutes)} ·{" "}
                  {w.slotMinutes}-min slots · {w.capacityPerSlot} per slot
                </span>
                <button
                  onClick={() => onDeleteWindow(w.id)}
                  className="text-red-600 hover:text-red-700 font-semibold text-sm shrink-0"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add window form */}
        <div className="bg-[#f1e7d5] rounded-xl p-4">
          <div className="text-base font-semibold text-[#241a12] mb-3">Add hours</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-semibold text-[#6f5b46] mb-1">Day</label>
              <select
                value={win.weekday}
                onChange={(e) => setWin({ ...win, weekday: Number(e.target.value) })}
                className="w-full bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 text-base"
              >
                {WEEKDAYS.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#6f5b46] mb-1">Start</label>
              <input
                type="time"
                value={win.start}
                onChange={(e) => setWin({ ...win, start: e.target.value })}
                className="w-full bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#6f5b46] mb-1">End</label>
              <input
                type="time"
                value={win.end}
                onChange={(e) => setWin({ ...win, end: e.target.value })}
                className="w-full bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#6f5b46] mb-1">Slot length</label>
              <select
                value={win.slotMinutes}
                onChange={(e) => setWin({ ...win, slotMinutes: Number(e.target.value) })}
                className="w-full bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 text-base"
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#6f5b46] mb-1">Capacity</label>
              <input
                type="number"
                min={1}
                value={win.capacityPerSlot}
                onChange={(e) => setWin({ ...win, capacityPerSlot: Number(e.target.value) })}
                className="w-full bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 text-base"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={addWindow}
                className="w-full bg-[#6c4d39] hover:bg-[#563e2c] text-white font-semibold text-base px-4 py-2.5 rounded-xl"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Block-off dates (vacations & holidays) */}
        <div className="mt-6">
          <div className="text-sm font-semibold text-[#8a7559] uppercase tracking-wide mb-2">Block off dates (vacations &amp; holidays)</div>
          {loc.blackouts.length > 0 && (
            <div className="space-y-2 mb-3">
              {loc.blackouts.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 bg-[#efe0c9] border border-[#e3c9a3] rounded-xl px-4 py-2.5">
                  <span className="text-base text-[#5a3a1c]">
                    <span className="font-semibold">
                      {fmtDay(b.startDate)}{b.endDate !== b.startDate ? ` – ${fmtDay(b.endDate)}` : ""}
                    </span>
                    {b.reason ? <span className="text-[#8a5a2b]"> · {b.reason}</span> : null}
                  </span>
                  <button onClick={() => removeBlackout(b.id)} className="text-red-600 hover:text-red-700 font-semibold text-sm shrink-0">Remove</button>
                </div>
              ))}
            </div>
          )}
          <div className="bg-[#f1e7d5] rounded-xl p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-[#6f5b46] mb-1">From</label>
                <input type="date" value={bo.start} onChange={(e) => setBo({ ...bo, start: e.target.value })} className="w-full bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 text-base" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#6f5b46] mb-1">To <span className="font-normal text-[#8a7559]">(optional)</span></label>
                <input type="date" value={bo.end} onChange={(e) => setBo({ ...bo, end: e.target.value })} className="w-full bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 text-base" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-[#6f5b46] mb-1">Reason <span className="font-normal text-[#8a7559]">(optional)</span></label>
                <input type="text" value={bo.reason} onChange={(e) => setBo({ ...bo, reason: e.target.value })} placeholder="e.g. Vacation, Holiday" className="w-full bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 text-base" />
              </div>
              <div className="sm:col-span-2">
                <button onClick={addBlackout} className="w-full sm:w-auto bg-[#6c4d39] hover:bg-[#563e2c] text-white font-semibold text-base px-5 py-2.5 rounded-xl">Block off these dates</button>
              </div>
            </div>
            <p className="text-sm text-[#8a7559] mt-2">Bidders can&apos;t schedule pickups on blocked days. Leave &ldquo;To&rdquo; empty to block a single day.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
