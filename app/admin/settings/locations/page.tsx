"use client";
import { useState, useEffect, useCallback } from "react";
import { PageHeader, PageBody, Panel, Pill, Eyebrow, Btn, Input, Empty, Notice, Disclosure } from "../../ui";

// Select / textarea share the kit Input look (the kit only ships a text input).
const fieldCls =
  "w-full min-h-[50px] bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-4 text-[#241a12] placeholder:text-[#b3a085] outline-none transition";
const labelCls = "text-[13px] font-black uppercase tracking-[0.14em] text-[#8a7559] mb-1 block";

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
  isShippingStation?: boolean;
  windows: Window[];
  blackouts: Blackout[];
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

// ── Page ─────────────────────────────────────────────────────────────────────
export default function LocationsSettingsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showAddLoc, setShowAddLoc] = useState(false);
  // In-app confirmation (native confirm() is blocked in some installed/PWA webviews).
  const [confirmDialog, setConfirmDialog] = useState<
    { text: string; confirmLabel: string; danger?: boolean; onConfirm: () => void } | null
  >(null);
  const askConfirm = (text: string, onConfirm: () => void, opts?: { confirmLabel?: string; danger?: boolean }) =>
    setConfirmDialog({ text, onConfirm, confirmLabel: opts?.confirmLabel ?? "Confirm", danger: opts?.danger });

  const loadLocations = useCallback(() => {
    return fetch("/api/admin/pickup/locations")
      .then((r) => r.json())
      .then((d) => setLocations(d.locations ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadLocations().finally(() => setLoading(false));
  }, [loadLocations]);

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
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

  // Per-location toggle: every station packs and ships its own boxes.
  const setShippingStation = async (loc: Location) => {
    try {
      const res = await fetch(`/api/admin/pickup/locations/${loc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isShippingStation: !loc.isShippingStation }),
      });
      const d = await res.json();
      if (d.success) loadLocations();
      else flash(d.error || "Could not update.", false);
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

  return (
    <>
      <PageHeader
        title="Settings"
        actions={<Btn size="sm" variant={showAddLoc ? "outline" : "solid"} onClick={() => setShowAddLoc((v) => !v)}>{showAddLoc ? "Close" : "Add location"}</Btn>}
      />

      <PageBody>
        {msg && <Notice tone={msg.ok ? "green" : "red"}>{msg.text}</Notice>}

        {/* Adding a location happens once; setting hours happens constantly —
            so the form is hidden behind the header button and the locations lead. */}
        {showAddLoc && (
          <Panel title="Add location">
            <div className="space-y-3 px-4 sm:px-5 py-4">
              <Input value={newLoc.name} onChange={(e) => setNewLoc({ ...newLoc, name: e.target.value })} placeholder="Name (e.g. Owosso)" autoFocus />
              <Input value={newLoc.address} onChange={(e) => setNewLoc({ ...newLoc, address: e.target.value })} placeholder="Address (optional)" />
              <textarea
                value={newLoc.instructions}
                onChange={(e) => setNewLoc({ ...newLoc, instructions: e.target.value })}
                placeholder="Instructions for bidders (optional)"
                rows={2}
                className={`${fieldCls} py-3`}
              />
              <Btn onClick={() => { addLocation(); setShowAddLoc(false); }} disabled={!newLoc.name.trim()} full>
                Add location
              </Btn>
            </div>
          </Panel>
        )}

        {loading ? (
          <div className="text-center py-20 text-[#8a7559]">Loading…</div>
        ) : locations.length === 0 ? (
          <Panel>
            <Empty text="No pickup locations yet." action={<Btn onClick={() => setShowAddLoc(true)}>Add location</Btn>} />
          </Panel>
        ) : (
          locations.map((loc) => (
            <LocationCard
              key={loc.id}
              loc={loc}
              onToggle={() => toggleLocation(loc)}
              onShippingStation={() => setShippingStation(loc)}
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
      </PageBody>

      {/* In-app confirmation dialog (replaces native confirm, which some webviews block) */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white rounded-2xl border border-[#e6dac6] max-w-sm w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-[#241a12]">{confirmDialog.text}</p>
            <div className="mt-5 flex gap-3">
              <Btn onClick={() => setConfirmDialog(null)} tone="slate" variant="outline" className="flex-1">Back</Btn>
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

// ── Location card with hours + blackouts ─────────────────────────────────────
function LocationCard({
  loc,
  onToggle,
  onShippingStation,
  onDelete,
  onDeleteWindow,
  onWindowAdded,
  flash,
}: {
  loc: Location;
  onToggle: () => void;
  onShippingStation: () => void;
  onDelete: () => void;
  onDeleteWindow: (wid: string) => void;
  onWindowAdded: () => void;
  flash: (text: string, ok: boolean) => void;
}) {
  const [win, setWin] = useState({ weekday: 3, start: "09:00", end: "17:00", slotMinutes: 30, capacityPerSlot: 2 });
  const [showAddHours, setShowAddHours] = useState(false);

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
      if (d.success) { flash("Location updated.", true); setEditing(false); onWindowAdded(); }
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
        setShowAddHours(false);
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
            <div>
              <label className={labelCls}>Name</label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Owosso" className="font-bold" />
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <Input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="Street, city, state zip" />
            </div>
            <div>
              <label className={labelCls}>Instructions for bidders</label>
              <textarea value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} rows={2} placeholder="Where to park, who to text…" className={`${fieldCls} py-3`} />
            </div>
            <div className="flex gap-2">
              <Btn onClick={saveEdit} disabled={saving} size="sm">{saving ? "Saving…" : "Save"}</Btn>
              <Btn onClick={() => setEditing(false)} tone="slate" variant="ghost" size="sm">Cancel</Btn>
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-display text-xl font-black text-[#241a12]">{loc.name}</div>
              {!loc.isActive && <Pill tone="amber" dot>Hidden from bidders</Pill>}
              {loc.isShippingStation && <Pill tone="green" dot>Shipping station</Pill>}
            </div>
            {loc.address && <div className="text-[#6f5b46] mt-0.5">{loc.address}</div>}
            {loc.instructions && <div className="text-[15px] text-[#8a7559] mt-1">{loc.instructions}</div>}
            {loc.isShippingStation && <div className="text-[15px] text-[#8a7559] mt-1">Ships its own boxes.</div>}
          </div>
        )}
        {!editing && (
          <div className="flex flex-wrap gap-2 shrink-0">
            <Btn onClick={startEdit} variant="outline" size="sm">Edit</Btn>
            <Btn onClick={onToggle} tone="slate" variant="outline" size="sm">{loc.isActive ? "Hide" : "Show"}</Btn>
            <Btn onClick={onShippingStation} tone={loc.isShippingStation ? "green" : "slate"} variant={loc.isShippingStation ? "solid" : "outline"} size="sm" aria-pressed={!!loc.isShippingStation}>
              Shipping station
            </Btn>
          </div>
        )}
      </div>

      <div className="px-4 sm:px-5 py-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <Eyebrow>Weekly hours</Eyebrow>
          <Btn onClick={() => setShowAddHours((v) => !v)} size="sm" variant={showAddHours ? "outline" : "solid"} tone="slate">
            {showAddHours ? "Close" : "Add hours"}
          </Btn>
        </div>
        {loc.windows.length === 0 ? (
          <div className="text-[15px] text-[#8a7559] mb-3">No hours set yet.</div>
        ) : (
          <div className="space-y-2 mb-3">
            {loc.windows.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-3 bg-[#f4ede1] border border-[#e6dac6] rounded-xl pl-4 pr-1.5 py-1.5 min-h-[48px]">
                <span className="text-[#241a12]">
                  <span className="font-bold">{WEEKDAYS_SHORT[w.weekday]}</span>{" "}
                  {minutesToLabel(w.startMinutes)}–{minutesToLabel(w.endMinutes)} ·{" "}
                  {w.slotMinutes}-min slots · {w.capacityPerSlot} per slot
                </span>
                <Btn onClick={() => onDeleteWindow(w.id)} tone="red" variant="ghost" size="sm" className="shrink-0">Remove</Btn>
              </div>
            ))}
          </div>
        )}

        {/* Add window form */}
        {showAddHours && (
          <div className="bg-[#faf5ea] border border-[#e6dac6] rounded-xl p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>Day</label>
                <select value={win.weekday} onChange={(e) => setWin({ ...win, weekday: Number(e.target.value) })} className={fieldCls}>
                  {WEEKDAYS.map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Start</label>
                <Input type="time" value={win.start} onChange={(e) => setWin({ ...win, start: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>End</label>
                <Input type="time" value={win.end} onChange={(e) => setWin({ ...win, end: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Slot length</label>
                <select value={win.slotMinutes} onChange={(e) => setWin({ ...win, slotMinutes: Number(e.target.value) })} className={fieldCls}>
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={60}>60 min</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Capacity</label>
                <Input type="number" min={1} value={win.capacityPerSlot} onChange={(e) => setWin({ ...win, capacityPerSlot: Number(e.target.value) })} />
              </div>
              <div className="flex items-end">
                <Btn onClick={addWindow} full>Add</Btn>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rare stuff: block-off dates and delete. */}
      <div className="px-4 sm:px-5 pb-4">
        <Disclosure label={`More${loc.blackouts.length ? ` · ${loc.blackouts.length} blocked`:""}`}>
          <div className="p-4 space-y-4">
            <div>
              <Eyebrow className="mb-2">Block off dates</Eyebrow>
              {loc.blackouts.length > 0 && (
                <div className="space-y-2 mb-3">
                  {loc.blackouts.map((b) => (
                    <div key={b.id} className="flex items-center justify-between gap-3 bg-[#fbeed8] border border-[#eed3ab] rounded-xl pl-4 pr-1.5 py-1.5 min-h-[48px]">
                      <span className="text-[#8a4f1c]">
                        <span className="font-bold">
                          {fmtDay(b.startDate)}{b.endDate !== b.startDate ? ` – ${fmtDay(b.endDate)}` : ""}
                        </span>
                        {b.reason ? <span> · {b.reason}</span> : null}
                      </span>
                      <Btn onClick={() => removeBlackout(b.id)} tone="red" variant="ghost" size="sm" className="shrink-0">Remove</Btn>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>From</label>
                  <Input type="date" value={bo.start} onChange={(e) => setBo({ ...bo, start: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>To <span className="font-semibold normal-case tracking-normal">(optional)</span></label>
                  <Input type="date" value={bo.end} onChange={(e) => setBo({ ...bo, end: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Reason <span className="font-semibold normal-case tracking-normal">(optional)</span></label>
                  <Input type="text" value={bo.reason} onChange={(e) => setBo({ ...bo, reason: e.target.value })} placeholder="Vacation, Holiday" />
                </div>
                <div className="sm:col-span-2">
                  <Btn onClick={addBlackout} className="w-full sm:w-auto">Block off these dates</Btn>
                </div>
              </div>
              <p className="text-[15px] text-[#8a7559] mt-2">Leave &ldquo;To&rdquo; empty to block a single day.</p>
            </div>

            <div className="pt-3 border-t border-[#f0e6d6]">
              <Btn onClick={onDelete} tone="red" variant="outline" size="sm">Delete location</Btn>
            </div>
          </div>
        </Disclosure>
      </div>
    </Panel>
  );
}
