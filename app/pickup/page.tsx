"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

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
function fmtDayHeader(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Detroit",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Detroit",
    hour: "numeric",
    minute: "2-digit",
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

// ── Slot picker (day/time grid + book button) ──────────────────────────────────
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
  const [selected, setSelected] = useState<string | null>(null);
  const slots = location.slots ?? [];

  // group slots by day
  const days: { key: string; label: string; slots: Slot[] }[] = [];
  for (const s of slots) {
    const k = dayKey(s.startsAt);
    let d = days.find((x) => x.key === k);
    if (!d) {
      d = { key: k, label: fmtDayHeader(s.startsAt), slots: [] };
      days.push(d);
    }
    d.slots.push(s);
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-base font-semibold text-[#241a12] mb-2">Pick a day & time (Michigan time)</label>
        {days.length === 0 ? (
          <div className="rounded-xl border border-[#e3d6bf] bg-white px-4 py-6 text-base text-[#8a7559]">
            No times are available at this location right now. Please check back soon.
          </div>
        ) : (
          <div className="space-y-5">
            {days.map((d) => (
              <div key={d.key}>
                <div className="text-base font-semibold text-[#6f5b46] mb-2">{d.label}</div>
                <div className="flex flex-wrap gap-2">
                  {d.slots.map((s) => (
                    <button
                      key={s.startsAt}
                      type="button"
                      onClick={() => setSelected(s.startsAt)}
                      className={`rounded-xl border-2 px-4 py-3 text-base font-semibold transition-colors ${
                        selected === s.startsAt
                          ? "border-[#6c4d39] bg-[#6c4d39] text-white"
                          : "border-[#e3d6bf] bg-white text-[#241a12] hover:bg-[#efe3d0]"
                      }`}
                    >
                      {fmtTime(s.startsAt)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
  const [busy, setBusy] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [rescheduleLocationId, setRescheduleLocationId] = useState<string>("");

  const load = useCallback(() => {
    fetch("/api/pickup")
      .then((r) => r.json())
      .then((d: PickupData) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  const requestTransfer = async (toLocationId: string) => {
    setTransferBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/pickup/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toLocationId }),
      });
      const d = await res.json();
      if (res.ok && d.needed === false) {
        // Nothing to move — items are already here; just refresh so the slot picker shows.
        load();
      } else if (res.ok && d.success) {
        setMsg({ text: "Transfer requested — transfers usually take 5–6 days. We'll let you know when your items arrive.", ok: true });
        load();
      } else {
        setMsg({ text: d.error || "Could not request a transfer. Please try again.", ok: false });
      }
    } catch {
      setMsg({ text: "Something went wrong. Please try again.", ok: false });
    } finally {
      setTransferBusy(false);
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
  if (!data) return null;

  const { appointment, unscheduledItems, locations, pendingTransfers } = data;

  // Items already moving in a transfer — exclude them from the scheduling area.
  const itemsInTransitIds = new Set(
    pendingTransfers.flatMap((t) => t.items.map((it) => it.id))
  );
  const schedulable = unscheduledItems.filter((it) => !itemsInTransitIds.has(it.id));

  // The location we're scheduling against: the appointment's, or the chosen one.
  const activeLocationId = appointment ? appointment.location.id : selectedLocationId;
  const readyHere = schedulable.filter(
    (it) => it.locationId === activeLocationId || it.locationId == null
  );
  const elsewhere = schedulable.filter(
    (it) => it.locationId != null && it.locationId !== activeLocationId
  );
  const chosenLocation = locations.find((l) => l.id === activeLocationId);

  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-semibold">Pickup</h1>
          <Link href="/dashboard" className="text-base text-[#6c4d39] hover:text-[#563e2c] font-semibold">
            ← My Bids
          </Link>
        </div>

        {msg && (
          <div
            className={`mb-6 rounded-xl px-4 py-3.5 text-base font-medium border ${
              msg.ok
                ? "bg-[#5f7a45]/10 text-[#5f7a45] border-[#5f7a45]/30"
                : "bg-red-50 text-red-600 border-red-500/20"
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* ── Has an upcoming appointment ── */}
        {appointment && !rescheduling && (
          <div className="space-y-6">
            <div className="bg-white border-2 border-[#6c4d39]/30 rounded-2xl overflow-hidden">
              <div className="bg-[#6c4d39] text-white px-6 py-5">
                <div className="text-base font-medium opacity-90">Your pickup is scheduled for</div>
                <div className="text-2xl font-semibold mt-1">{fmtDateTime(appointment.startsAt)}</div>
              </div>
              <div className="px-6 py-5">
                <div className="text-lg font-semibold text-[#241a12]">{appointment.location.name}</div>
                {appointment.location.address && (
                  <div className="text-base text-[#6f5b46] mt-0.5">{appointment.location.address}</div>
                )}
                {appointment.location.instructions && (
                  <div className="text-base text-[#8a7559] mt-2 bg-[#f1e7d5] rounded-xl px-4 py-3">
                    {appointment.location.instructions}
                  </div>
                )}
              </div>
            </div>

            {/* Items grouped by auction */}
            <div>
              <h2 className="text-xl font-semibold mb-3">
                {appointment.items.length} item{appointment.items.length !== 1 ? "s" : ""} for this pickup
              </h2>
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
              Any items you win before this date are added here automatically.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setRescheduling(true)}
                className="flex-1 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-semibold text-base py-3.5 rounded-xl transition-colors"
              >
                Reschedule
              </button>
              <button
                onClick={cancel}
                disabled={busy}
                className="flex-1 bg-white border-2 border-red-500/30 text-red-600 hover:bg-red-50 disabled:opacity-50 font-semibold text-base py-3.5 rounded-xl transition-colors"
              >
                Cancel pickup
              </button>
            </div>
          </div>
        )}

        {/* ── Rescheduling an existing appointment ── */}
        {appointment && rescheduling && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Reschedule your pickup</h2>
              <button
                onClick={() => {
                  setRescheduling(false);
                  setRescheduleLocationId("");
                }}
                className="text-base text-[#6c4d39] hover:text-[#563e2c] font-semibold"
              >
                Cancel
              </button>
            </div>
            {locations.length === 0 ? (
              <div className="rounded-xl border border-[#e3d6bf] bg-white px-4 py-6 text-base text-[#8a7559]">
                No pickup times are available right now.
              </div>
            ) : (
              (() => {
                const locId = rescheduleLocationId || appointment.location.id;
                const loc = locations.find((l) => l.id === locId);
                return (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-base font-semibold text-[#241a12] mb-2">
                        Choose a pickup location
                      </label>
                      <div className="space-y-2">
                        {locations.map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => setRescheduleLocationId(l.id)}
                            className={`w-full text-left rounded-xl border-2 px-4 py-3.5 transition-colors ${
                              locId === l.id
                                ? "border-[#6c4d39] bg-[#efe3d0]"
                                : "border-[#e3d6bf] bg-white hover:bg-[#efe3d0]"
                            }`}
                          >
                            <div className="font-semibold text-base text-[#241a12]">{l.name}</div>
                            {l.address && <div className="text-base text-[#6f5b46] mt-0.5">{l.address}</div>}
                            {l.instructions && <div className="text-sm text-[#8a7559] mt-1">{l.instructions}</div>}
                          </button>
                        ))}
                      </div>
                    </div>
                    {loc && (
                      <SlotPicker location={loc} onBook={reschedule} busy={busy} submitLabel="Update pickup" />
                    )}
                  </div>
                );
              })()
            )}
          </div>
        )}

        {/* ── "On the way" cards — one per active transfer ── */}
        {!rescheduling && pendingTransfers.length > 0 && (
          <div className="space-y-4 mt-6">
            {pendingTransfers.map((t) => (
              <div key={t.id} className="rounded-2xl border-2 border-[#6c4d39]/25 bg-[#efe3d0] px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-lg font-semibold text-[#241a12]">
                    {t.items.length} item{t.items.length !== 1 ? "s" : ""} moving to {t.toLocationName}
                  </div>
                  <span
                    className={`text-sm px-3 py-1 rounded-full font-semibold shrink-0 ${
                      t.status === "LOADED"
                        ? "bg-[#5f7a45]/15 text-[#5f7a45]"
                        : "bg-[#6c4d39]/15 text-[#6c4d39]"
                    }`}
                  >
                    {t.status === "LOADED" ? "Loaded / in transit" : "Requested"}
                  </span>
                </div>
                <p className="text-base text-[#6f5b46] mt-2">
                  We&apos;ve been notified. Transfers usually take 5–6 days — we&apos;ll let you know when they arrive.
                </p>
                {t.items.length > 0 && (
                  <ul className="mt-3 space-y-1 text-base text-[#241a12]">
                    {t.items.map((it) => (
                      <li key={it.id}>
                        • {it.title} — from {it.fromLocationName}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Scheduling area for items NOT in transit ── */}
        {!rescheduling && schedulable.length > 0 && (
          <div className="space-y-6 mt-6">
            {/* HAS an appointment: ready items auto-attach; just prompt for elsewhere items. */}
            {appointment ? (
              <>
                {readyHere.length > 0 && (
                  <p className="text-base text-[#5f7a45] bg-[#5f7a45]/10 border border-[#5f7a45]/30 rounded-xl px-4 py-3">
                    {readyHere.length} newly won item{readyHere.length !== 1 ? "s have" : " has"} been added to your pickup above.
                  </p>
                )}
                {elsewhere.length > 0 && (
                  <div className="rounded-2xl border-2 border-[#6c4d39]/25 bg-white px-5 py-5">
                    <div className="text-lg font-semibold text-[#241a12]">
                      You&apos;ve also won items at another location
                    </div>
                    <p className="text-base text-[#6f5b46] mt-2">
                      Request a transfer to {appointment.location.name} to add them to this pickup.
                      Transfers usually take 5–6 days.
                    </p>
                    <ul className="mt-3 space-y-1.5 text-base text-[#241a12]">
                      {elsewhere.map((it) => (
                        <li key={it.id} className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium">{it.title}</span>
                          <span className="text-[#8a7559] text-sm">
                            currently at {it.locationName ?? "another location"}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      disabled={transferBusy}
                      onClick={() => requestTransfer(appointment.location.id)}
                      className="mt-5 w-full bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-base py-3.5 rounded-xl transition-colors"
                    >
                      {transferBusy ? "Requesting…" : `Request transfer to ${appointment.location.name}`}
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* NO appointment: choose a location, then book ready items or request transfers. */
              <>
                <div className="bg-white border-2 border-[#6c4d39]/25 rounded-2xl px-6 py-5">
                  <h2 className="text-xl font-semibold text-[#241a12]">
                    You have {schedulable.length} item{schedulable.length !== 1 ? "s" : ""} ready to schedule
                  </h2>
                  <p className="text-base text-[#6f5b46] mt-1">
                    Choose a pickup location to get started.
                  </p>
                </div>

                {locations.length === 0 ? (
                  <div className="rounded-xl border border-[#e3d6bf] bg-white px-4 py-6 text-base text-[#8a7559]">
                    Pickup scheduling isn&apos;t available yet. Please check back soon.
                  </div>
                ) : (
                  <>
                    {/* Location chooser */}
                    <div>
                      <label className="block text-base font-semibold text-[#241a12] mb-2">
                        Choose a pickup location
                      </label>
                      <div className="space-y-2">
                        {locations.map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => setSelectedLocationId(l.id)}
                            className={`w-full text-left rounded-xl border-2 px-4 py-3.5 transition-colors ${
                              activeLocationId === l.id
                                ? "border-[#6c4d39] bg-[#efe3d0]"
                                : "border-[#e3d6bf] bg-white hover:bg-[#efe3d0]"
                            }`}
                          >
                            <div className="font-semibold text-base text-[#241a12]">{l.name}</div>
                            {l.address && <div className="text-base text-[#6f5b46] mt-0.5">{l.address}</div>}
                            {l.instructions && <div className="text-sm text-[#8a7559] mt-1">{l.instructions}</div>}
                          </button>
                        ))}
                      </div>
                    </div>

                    {activeLocationId && chosenLocation && (
                      <>
                        {/* Ready items + slot picker */}
                        {readyHere.length > 0 && (
                          <div className="bg-white border border-[#e3d6bf] rounded-2xl px-6 py-6 space-y-5">
                            <div>
                              <div className="text-lg font-semibold text-[#241a12]">
                                {readyHere.length} item{readyHere.length !== 1 ? "s" : ""} ready at {chosenLocation.name}
                              </div>
                              <ul className="mt-2 space-y-1 text-base text-[#241a12]">
                                {readyHere.map((it) => (
                                  <li key={it.id}>• {it.title}</li>
                                ))}
                              </ul>
                            </div>
                            <SlotPicker
                              location={chosenLocation}
                              onBook={book}
                              busy={busy}
                              submitLabel="Schedule pickup"
                            />
                          </div>
                        )}

                        {/* Items elsewhere → request transfer */}
                        {elsewhere.length > 0 && (
                          <div className="rounded-2xl border-2 border-[#6c4d39]/25 bg-white px-5 py-5">
                            <div className="text-lg font-semibold text-[#241a12]">
                              These items are at another location
                            </div>
                            <p className="text-base text-[#6f5b46] mt-2">
                              Request a transfer to {chosenLocation.name} so you can pick them up there.
                              Transfers usually take 5–6 days.
                            </p>
                            <ul className="mt-3 space-y-1.5 text-base text-[#241a12]">
                              {elsewhere.map((it) => (
                                <li key={it.id} className="flex flex-wrap items-baseline gap-x-2">
                                  <span className="font-medium">{it.title}</span>
                                  <span className="text-[#8a7559] text-sm">
                                    currently at {it.locationName ?? "another location"}
                                  </span>
                                </li>
                              ))}
                            </ul>
                            <button
                              type="button"
                              disabled={transferBusy}
                              onClick={() => requestTransfer(activeLocationId)}
                              className="mt-5 w-full bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-base py-3.5 rounded-xl transition-colors"
                            >
                              {transferBusy ? "Requesting…" : `Request transfer to ${chosenLocation.name}`}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Empty state ── */}
        {!appointment && schedulable.length === 0 && pendingTransfers.length === 0 && (
          <div className="bg-white border border-[#e3d6bf] rounded-2xl px-6 py-16 text-center">
            <p className="text-lg text-[#6f5b46]">No items waiting for pickup yet.</p>
            <p className="text-base text-[#8a7559] mt-2">
              When you win and pay for an item, you&apos;ll be able to schedule a pickup here.
            </p>
            <Link
              href="/auctions"
              className="inline-block mt-6 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-semibold text-base px-6 py-3.5 rounded-xl transition-colors"
            >
              Browse auctions
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
