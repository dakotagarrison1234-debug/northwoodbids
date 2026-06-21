"use client";
import { useState, useEffect, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────────────
interface Window {
  id: string;
  weekday: number;
  startMinutes: number;
  endMinutes: number;
  slotMinutes: number;
  capacityPerSlot: number;
}
interface Location {
  id: string;
  name: string;
  address: string | null;
  instructions: string | null;
  isActive: boolean;
  windows: Window[];
}
interface ApptItem {
  id: string;
  title: string;
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
  status: "REQUESTED" | "COMPLETED" | "CANCELLED";
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
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

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
    if (!confirm("Mark this appointment as collected? All its items will be marked picked up.")) return;
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
    if (!confirm("Cancel this appointment? Its items will return to the unscheduled list.")) return;
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
  const completeTransfer = async (id: string) => {
    if (!confirm("Mark this transfer complete? The items will be set to their new location and the bidder can schedule a pickup.")) return;
    try {
      const res = await fetch(`/api/admin/pickup/transfers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      const d = await res.json();
      if (d.success) {
        flash("Transfer completed.", true);
        loadTransfers();
      } else flash(d.error || "Could not complete transfer.", false);
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
    if (!confirm("Delete this location and all its hours? Existing appointments here will be removed.")) return;
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
  const pendingTransfers = transfers.filter((t) => t.status === "REQUESTED");

  return (
    <>
      <header className="border-b border-[#e3d6bf] px-4 sm:px-8 py-4">
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
              {t === "transfers" && pendingTransfers.length > 0 && (
                <span className={`ml-2 inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full text-sm font-bold ${
                  tab === t ? "bg-white text-[#6c4d39]" : "bg-[#6c4d39] text-white"
                }`}>
                  {pendingTransfers.length}
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

      <div className="px-4 sm:px-8 py-6">
        {loading ? (
          <div className="text-center py-20 text-base text-[#8a7559]">Loading…</div>
        ) : tab === "appointments" ? (
          <div className="space-y-8">
            {/* Scheduled */}
            <div>
              <h2 className="text-xl font-semibold mb-4">
                Upcoming ({scheduled.length})
              </h2>
              {scheduled.length === 0 ? (
                <div className="text-base text-[#8a7559] bg-white border border-[#e3d6bf] rounded-xl px-5 py-8 text-center">
                  No upcoming appointments yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {scheduled.map((a) => (
                    <div key={a.id} className="bg-white border border-[#cdbda3] rounded-xl overflow-hidden">
                      <div className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-lg font-semibold text-[#241a12]">
                              {a.bidder.name || "Unknown Bidder"}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5 text-base text-[#6f5b46]">
                              {a.bidder.email && <span>{a.bidder.email}</span>}
                              {a.bidder.phone && <span>{a.bidder.phone}</span>}
                            </div>
                          </div>
                          <span className="text-sm bg-[#6c4d39]/15 text-[#6c4d39] px-3 py-1 rounded-full font-semibold shrink-0">
                            Scheduled
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-base">
                          <span className="font-semibold text-[#241a12]">{fmtDateTime(a.startsAt)}</span>
                          <span className="text-[#6f5b46]">{a.location.name}</span>
                        </div>

                        <div className="mt-3">
                          <div className="text-sm font-semibold text-[#8a7559] uppercase tracking-wide mb-1">
                            {a.items.length} item{a.items.length !== 1 ? "s" : ""}
                          </div>
                          <ul className="text-base text-[#241a12] space-y-0.5">
                            {a.items.map((it) => (
                              <li key={it.id}>• {it.title}</li>
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
                              onClick={() => markCollected(a.id)}
                              className="bg-[#5f7a45] hover:bg-[#4f6639] text-white font-semibold text-base px-4 py-2.5 rounded-xl"
                            >
                              Mark Collected
                            </button>
                            <button
                              onClick={() => cancelAppt(a.id)}
                              className="bg-white border border-red-500/30 text-red-600 hover:bg-red-50 font-semibold text-base px-4 py-2.5 rounded-xl"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Collected */}
            {collected.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Collected ({collected.length})</h2>
                <div className="space-y-3">
                  {collected.map((a) => (
                    <div key={a.id} className="bg-white/60 border border-[#e3d6bf] rounded-xl px-5 py-4 opacity-75">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-base text-[#241a12]">{a.bidder.name || "Unknown Bidder"}</div>
                          <div className="text-base text-[#8a7559]">
                            {fmtDateTime(a.startsAt)} · {a.location.name} · {a.items.length} item{a.items.length !== 1 ? "s" : ""}
                          </div>
                        </div>
                        <span className="text-sm bg-[#5f7a45]/15 text-[#5f7a45] px-3 py-1 rounded-full font-semibold">
                          Collected
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : tab === "transfers" ? (
          // ── Transfers ──
          <div className="space-y-4 max-w-3xl">
            <h2 className="text-xl font-semibold">
              Pending transfers ({pendingTransfers.length})
            </h2>
            {pendingTransfers.length === 0 ? (
              <div className="text-base text-[#8a7559] bg-white border border-[#e3d6bf] rounded-xl px-5 py-8 text-center">
                No transfers waiting. When a bidder asks for their items to be moved to another location, it shows up here.
              </div>
            ) : (
              pendingTransfers.map((t) => (
                <div key={t.id} className="bg-white border border-[#cdbda3] rounded-xl px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-lg font-semibold text-[#241a12]">
                        {t.bidder.name || "Unknown Bidder"}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5 text-base text-[#6f5b46]">
                        {t.bidder.email && <span>{t.bidder.email}</span>}
                        {t.bidder.phone && <span>{t.bidder.phone}</span>}
                      </div>
                    </div>
                    <span className="text-sm bg-[#6c4d39]/15 text-[#6c4d39] px-3 py-1 rounded-full font-semibold shrink-0">
                      Requested {fmtDateTime(t.createdAt)}
                    </span>
                  </div>

                  <div className="mt-3 text-lg font-semibold text-[#5f7a45]">
                    → Move to {t.toLocation.name}
                  </div>

                  <div className="mt-3">
                    <div className="text-sm font-semibold text-[#8a7559] uppercase tracking-wide mb-2">
                      {t.items.length} item{t.items.length !== 1 ? "s" : ""} to gather
                    </div>
                    <ul className="space-y-2">
                      {t.items.map((it) => (
                        <li key={it.id} className="flex items-start gap-2 bg-[#f1e7d5] rounded-xl px-4 py-2.5">
                          <span className="text-[#5f7a45] mt-0.5">☐</span>
                          <span className="text-base text-[#241a12]">
                            <span className="font-semibold">{it.title}</span>
                            {" "}— now at {it.fromLocationName || "Unassigned"} · {it.storageLocation || "no spot"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => completeTransfer(t.id)}
                    className="mt-4 w-full bg-[#5f7a45] hover:bg-[#4f6639] text-white font-semibold text-base py-3.5 rounded-xl transition-colors"
                  >
                    Transfer Complete
                  </button>
                </div>
              ))
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
                  onDelete={() => deleteLocation(loc.id)}
                  onDeleteWindow={deleteWindow}
                  onWindowAdded={loadLocations}
                  flash={flash}
                />
              ))
            )}
          </div>
        )}
      </div>
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
      </div>
    </div>
  );
}
