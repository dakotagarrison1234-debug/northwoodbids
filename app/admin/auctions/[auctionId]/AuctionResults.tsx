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
  total: number;
  items: ResultItem[];
}
export interface ResultUnsold {
  id: string;
  title: string;
  photo: string | null;
  highBid: number;
}

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function PaidPill({ state }: { state: ResultItem["paidState"] }) {
  const map = {
    paid: "bg-green-100 text-green-800",
    comped: "bg-slate-100 text-slate-600",
    unpaid: "bg-red-100 text-red-700",
  } as const;
  const label = { paid: "Paid", comped: "Comped", unpaid: "Unpaid" }[state];
  return <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${map[state]}`}>{label}</span>;
}

export default function AuctionResults({
  auctionId,
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
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [busyLoc, setBusyLoc] = useState<string | null>(null);
  const [note, setNote] = useState<{ key: string; text: string; ok: boolean } | null>(null);

  const soldCount = orders.reduce((n, o) => n + o.items.length, 0);
  const grossTotal = orders.reduce((n, o) => n + o.total, 0);
  const unpaidCount = orders.reduce((n, o) => n + o.items.filter((i) => i.paidState === "unpaid").length, 0);
  const pickedUpCount = orders.reduce((n, o) => n + o.items.filter((i) => i.pickedUp).length, 0);

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
        setNote({ key: clerkUserId, text: `Pickup set to ${data.locationName}${data.transferred ? ` · ${data.transferred} item(s) transferring` : ""}.`, ok: true });
      } else {
        setNote({ key: clerkUserId, text: data.error || "Could not set location.", ok: false });
      }
    } catch {
      setNote({ key: clerkUserId, text: "Something went wrong.", ok: false });
    } finally {
      setBusyLoc(null);
    }
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

      {/* Orders (grouped by winner) */}
      {orders.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500">
          Nothing sold in this auction.
        </div>
      ) : (
        orders.map((order) => {
          const allPickedUp = order.items.every((i) => i.pickedUp);
          return (
            <div key={order.clerkUserId} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              {/* Order header */}
              <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 truncate">{order.name}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {[order.phone, order.email].filter(Boolean).join(" · ") || "No contact on file"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-extrabold text-green-700 tabular-nums">{money(order.total)}</div>
                  <div className="text-[11px] text-slate-400">{order.items.length} item{order.items.length !== 1 ? "s" : ""}</div>
                </div>
              </div>

              {/* Pickup location selector */}
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
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

              {/* Items */}
              <ul className="divide-y divide-slate-100">
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

              {/* Order-level action */}
              {!allPickedUp && (
                <div className="px-4 py-2.5 border-t border-slate-100">
                  <button
                    onClick={() => markOrderPickedUp(order)}
                    className="text-sm font-bold text-[#6c4d39] hover:underline"
                  >
                    Mark whole order picked up
                  </button>
                </div>
              )}
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
