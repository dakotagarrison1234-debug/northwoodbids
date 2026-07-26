"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export interface ResultItem {
  id: string;
  title: string;
  photo: string | null;
  amount: number;
  paidState: "paid" | "comped" | "unpaid";
  pickedUp: boolean;
}
export interface ResultOrder {
  clerkUserId: string;
  name: string;
  email: string | null;
  phone: string | null;
  preferredLocationId: string | null;
  scheduledFor: string | null; // ISO of earliest upcoming appt, or null
  scheduledLocation: string | null;
  total: number;
  items: ResultItem[];
}
export interface ResultUnsold {
  id: string;
  title: string;
  photo: string | null;
  highBid: number;
}

type Bucket = "scheduled" | "no_pickup" | "no_location";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

// A customer's fulfillment state. Derived on the client so setting a location
// instantly moves the order out of "no location".
function bucketOf(o: ResultOrder): Bucket {
  if (o.scheduledFor) return "scheduled";
  if (o.preferredLocationId) return "no_pickup";
  return "no_location";
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function PaidPill({ state }: { state: ResultItem["paidState"] }) {
  const map = {
    paid: "bg-green-100 text-green-800",
    comped: "bg-slate-100 text-slate-600",
    unpaid: "bg-red-100 text-red-700",
  } as const;
  const label = { paid: "Paid", comped: "Comped", unpaid: "Unpaid" }[state];
  return <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${map[state]}`}>{label}</span>;
}

const SECTIONS: { key: Bucket; title: string; dot: string; hint: string }[] = [
  { key: "scheduled", title: "Pickup scheduled", dot: "bg-green-500", hint: "Has a booked collection time" },
  { key: "no_pickup", title: "No pickup booked", dot: "bg-amber-500", hint: "Has a location — waiting on the customer to pick a time" },
  { key: "no_location", title: "No location set", dot: "bg-red-500", hint: "Pick their pickup location to start fulfillment" },
];

export default function AuctionResults({
  orders: initialOrders,
  unsold,
  locations,
}: {
  auctionId: string;
  orders: ResultOrder[];
  unsold: ResultUnsold[];
  locations: { id: string; name: string }[];
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [busyLoc, setBusyLoc] = useState<string | null>(null);
  const [note, setNote] = useState<{ key: string; text: string; ok: boolean } | null>(null);

  const soldCount = orders.reduce((n, o) => n + o.items.length, 0);
  const grossTotal = orders.reduce((n, o) => n + o.total, 0);
  const unpaidCount = orders.reduce((n, o) => n + o.items.filter((i) => i.paidState === "unpaid").length, 0);
  const pickedUpCount = orders.reduce((n, o) => n + o.items.filter((i) => i.pickedUp).length, 0);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setItemPickup = async (clerkUserId: string, itemId: string, pickedUp: boolean) => {
    setBusyItem(itemId);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/items/${itemId}/pickup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickedUp }),
      });
      const data = await res.json();
      if (data.success) {
        setOrders((prev) =>
          prev.map((o) =>
            o.clerkUserId === clerkUserId
              ? { ...o, items: o.items.map((i) => (i.id === itemId ? { ...i, pickedUp } : i)) }
              : o
          )
        );
      } else {
        setNote({ key: itemId, text: data.error || "Could not update.", ok: false });
      }
    } catch {
      setNote({ key: itemId, text: "Something went wrong.", ok: false });
    } finally {
      setBusyItem(null);
    }
  };

  const markOrderPickedUp = async (order: ResultOrder) => {
    for (const it of order.items) {
      if (!it.pickedUp) await setItemPickup(order.clerkUserId, it.id, true);
    }
  };

  const setLocation = async (clerkUserId: string, locationId: string) => {
    setBusyLoc(clerkUserId);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/pickup/set-location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkUserId, locationId }),
      });
      const data = await res.json();
      if (data.success) {
        setOrders((prev) =>
          prev.map((o) => (o.clerkUserId === clerkUserId ? { ...o, preferredLocationId: locationId } : o))
        );
        setNote({
          key: clerkUserId,
          text: `Pickup set to ${data.locationName}${data.transferred ? ` · ${data.transferred} item(s) transferring` : ""}.`,
          ok: true,
        });
      } else {
        setNote({ key: clerkUserId, text: data.error || "Could not set location.", ok: false });
      }
    } catch {
      setNote({ key: clerkUserId, text: "Something went wrong.", ok: false });
    } finally {
      setBusyLoc(null);
    }
  };

  const renderOrder = (order: ResultOrder) => {
    const isOpen = expanded.has(order.clerkUserId);
    const allPickedUp = order.items.every((i) => i.pickedUp);
    const orderUnpaid = order.items.filter((i) => i.paidState === "unpaid").length;
    const orderPicked = order.items.filter((i) => i.pickedUp).length;

    return (
      <div key={order.clerkUserId} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {/* Header — always visible, tap to expand items */}
        <button
          onClick={() => toggle(order.clerkUserId)}
          className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors"
        >
          <div className="min-w-0 flex-1">
            <div className="font-bold text-slate-900 truncate">{order.name}</div>
            <div className="text-xs text-slate-500 truncate">
              {[order.phone, order.email].filter(Boolean).join(" · ") || "No contact on file"}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px]">
              <span className="text-slate-500">
                {order.items.length} item{order.items.length !== 1 ? "s" : ""}
              </span>
              {orderUnpaid > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">{orderUnpaid} unpaid</span>
              )}
              <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                {orderPicked}/{order.items.length} picked up
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-extrabold text-green-700 tabular-nums">{money(order.total)}</div>
            <div className="text-[11px] text-[#6c4d39] font-semibold mt-0.5">{isOpen ? "Hide items ▲" : "View items ▼"}</div>
          </div>
        </button>

        {/* Scheduled banner */}
        {order.scheduledFor && (
          <div className="px-4 py-2 bg-green-50 border-t border-green-100 text-xs text-green-800 font-semibold">
            Pickup {fmtWhen(order.scheduledFor)}
            {order.scheduledLocation ? ` · ${order.scheduledLocation}` : ""}
          </div>
        )}

        {/* Pickup location selector */}
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/60">
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">
            Pickup location (this customer)
          </label>
          <div className="flex items-center gap-2">
            <select
              value={order.preferredLocationId ?? ""}
              disabled={busyLoc === order.clerkUserId || locations.length === 0}
              onChange={(e) => setLocation(order.clerkUserId, e.target.value)}
              className="flex-1 min-w-0 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#6c4d39] disabled:opacity-50"
            >
              <option value="" disabled>
                {locations.length === 0 ? "No locations set up" : "Choose a location…"}
              </option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            {busyLoc === order.clerkUserId && <span className="text-xs text-slate-400 shrink-0">Saving…</span>}
          </div>
          {note && note.key === order.clerkUserId && (
            <p className={`text-xs mt-1.5 ${note.ok ? "text-green-700" : "text-red-600"}`}>{note.text}</p>
          )}
        </div>

        {/* Items — hidden until expanded */}
        {isOpen && (
          <>
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 px-4 py-2.5">
                  {it.photo ? (
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-white ring-1 ring-slate-200">
                      <Image src={it.photo} alt="" fill sizes="40px" className="object-contain p-0.5" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 truncate">{it.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm font-bold text-green-700 tabular-nums">{money(it.amount)}</span>
                      <PaidPill state={it.paidState} />
                    </div>
                  </div>
                  <button
                    onClick={() => setItemPickup(order.clerkUserId, it.id, !it.pickedUp)}
                    disabled={busyItem === it.id}
                    className={`shrink-0 text-xs font-bold px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
                      it.pickedUp
                        ? "bg-green-600 border-green-600 text-white hover:bg-green-700"
                        : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {busyItem === it.id ? "…" : it.pickedUp ? "Picked up ✓" : "Mark picked up"}
                  </button>
                </li>
              ))}
            </ul>
            {!allPickedUp && (
              <div className="px-4 py-2.5 border-t border-slate-100">
                <button onClick={() => markOrderPickedUp(order)} className="text-sm font-bold text-[#6c4d39] hover:underline">
                  Mark whole order picked up
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary + report links */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">Results &amp; fulfillment</h2>
          <div className="flex gap-2">
            <Link href="/admin/reports" className="text-sm font-bold text-[#6c4d39] border border-[#cdbda3] rounded-lg px-3 py-1.5 hover:bg-[#efe3d0]">
              Reports
            </Link>
            <Link href="/admin/winners" className="text-sm font-bold text-[#6c4d39] border border-[#cdbda3] rounded-lg px-3 py-1.5 hover:bg-[#efe3d0]">
              Winners
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3">
          {[
            { label: "Sold", value: String(soldCount) },
            { label: "Gross", value: money(grossTotal) },
            { label: "Unpaid", value: String(unpaidCount) },
            { label: "Picked up", value: `${pickedUpCount}/${soldCount}` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-2 text-center">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{s.label}</div>
              <div className="text-base font-extrabold text-slate-900 tabular-nums mt-0.5">{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Orders grouped by fulfillment state */}
      {orders.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500">
          Nothing sold in this auction.
        </div>
      ) : (
        SECTIONS.map(({ key, title, dot, hint }) => {
          const group = orders.filter((o) => bucketOf(o) === key);
          if (group.length === 0) return null;
          return (
            <div key={key} className="space-y-2.5">
              <div className="flex items-center gap-2 px-1 pt-1">
                <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
                <h3 className="text-sm font-extrabold text-slate-900">
                  {title} <span className="text-slate-400">({group.length})</span>
                </h3>
                <span className="text-[11px] text-slate-400 hidden sm:inline">— {hint}</span>
              </div>
              {group.map(renderOrder)}
            </div>
          );
        })
      )}

      {/* Unsold */}
      {unsold.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">Didn&apos;t sell ({unsold.length})</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {unsold.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                {u.photo ? (
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-white ring-1 ring-slate-200">
                    <Image src={u.photo} alt="" fill sizes="40px" className="object-contain p-0.5" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 truncate">{u.title}</div>
                  <div className="text-xs text-slate-400">No sale{u.highBid > 0 ? ` · high bid ${money(u.highBid)}` : ""}</div>
                </div>
                <Link href={`/admin/items/${u.id}`} className="shrink-0 text-xs font-bold text-[#6c4d39] px-2 py-1">
                  Edit
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
