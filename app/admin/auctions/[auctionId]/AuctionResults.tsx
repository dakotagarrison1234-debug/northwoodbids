"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import RelistControl, { type RelistTarget } from "../../RelistControl";

export interface ResultItem {
  id: string;
  title: string;
  photo: string | null;
  amount: number;
  paidState: "paid" | "comped" | "unpaid";
  pickedUp: boolean;
  gathered: boolean;
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
  warehouse: string | null;
  storageLocation: string | null;
}

type Bucket = "done" | "scheduled" | "no_pickup" | "no_location";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

// A customer's fulfillment state. "done" (everything collected) wins over
// everything else so a finished order never shows as "no pickup scheduled".
function bucketOf(o: ResultOrder): Bucket {
  if (o.items.length > 0 && o.items.every((i) => i.pickedUp)) return "done";
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
  auctionId,
  orders: initialOrders,
  unsold,
  locations,
  relistTargets,
}: {
  auctionId: string;
  orders: ResultOrder[];
  unsold: ResultUnsold[];
  locations: { id: string; name: string }[];
  relistTargets: RelistTarget[];
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [busyGather, setBusyGather] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [note, setNote] = useState<{ key: string; text: string; ok: boolean } | null>(null);

  // id → name, for showing a customer's chosen pickup location read-only.
  const locName = new Map(locations.map((l) => [l.id, l.name]));

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

  // Mark a whole order gathered (or un-gather) — sets grabbedAt on each item so the
  // closed screen doubles as a clear-the-storage checklist.
  const toggleOrderGathered = async (order: ResultOrder, gathered: boolean) => {
    setBusyGather(order.clerkUserId);
    setNote(null);
    try {
      await Promise.all(
        order.items.map((it) =>
          fetch(`/api/admin/pickup/items/${it.id}/grab`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ grabbed: gathered }),
          })
        )
      );
      setOrders((prev) =>
        prev.map((o) =>
          o.clerkUserId === order.clerkUserId
            ? { ...o, items: o.items.map((i) => ({ ...i, gathered })) }
            : o
        )
      );
    } catch {
      setNote({ key: order.clerkUserId, text: "Couldn't update gathered status.", ok: false });
    } finally {
      setBusyGather(null);
    }
  };

  const renderOrder = (order: ResultOrder, done = false) => {
    const isOpen = expanded.has(order.clerkUserId);
    const allPickedUp = order.items.every((i) => i.pickedUp);
    const allGathered = order.items.length > 0 && order.items.every((i) => i.gathered);
    const orderUnpaid = order.items.filter((i) => i.paidState === "unpaid").length;
    const orderPicked = order.items.filter((i) => i.pickedUp).length;
    const chosenLocation = order.preferredLocationId ? locName.get(order.preferredLocationId) ?? null : null;
    const labelHref = `/print/label?type=pickup&auction=${auctionId}&user=${encodeURIComponent(order.clerkUserId)}`;

    return (
      <div
        key={order.clerkUserId}
        className={`rounded-2xl border overflow-hidden ${done ? "border-green-200 bg-green-50/50" : "border-slate-200 bg-white"}`}
      >
        {/* Header — always visible, tap to expand items */}
        <button
          onClick={() => toggle(order.clerkUserId)}
          className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${done ? "hover:bg-green-50" : "hover:bg-slate-50"}`}
        >
          <div className="min-w-0 flex-1">
            <div className={`font-bold truncate ${done ? "text-green-900" : "text-slate-900"}`}>{order.name}</div>
            <div className="text-xs text-slate-500 truncate">
              {[order.phone, order.email].filter(Boolean).join(" · ") || "No contact on file"}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px]">
              <span className="text-slate-500">
                {order.items.length} item{order.items.length !== 1 ? "s" : ""}
              </span>
              {done ? (
                <span className="px-1.5 py-0.5 rounded-full bg-green-600 text-white font-bold">All set ✓</span>
              ) : (
                <>
                  {orderUnpaid > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">{orderUnpaid} unpaid</span>
                  )}
                  {allGathered && (
                    <span className="px-1.5 py-0.5 rounded-full bg-[#efe0c9] text-[#8a5a2b] font-bold">Gathered ✓</span>
                  )}
                  <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                    {orderPicked}/{order.items.length} picked up
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-lg font-extrabold tabular-nums ${done ? "text-green-700" : "text-green-700"}`}>{money(order.total)}</div>
            <div className="text-[11px] text-[#6c4d39] font-semibold mt-0.5">{isOpen ? "Hide items ▲" : "View items ▼"}</div>
          </div>
        </button>

        {/* Scheduled banner (only while not fully done) */}
        {!done && order.scheduledFor && (
          <div className="px-4 py-2 bg-green-50 border-t border-green-100 text-xs text-green-800 font-semibold">
            Pickup {fmtWhen(order.scheduledFor)}
            {order.scheduledLocation ? ` · ${order.scheduledLocation}` : ""}
          </div>
        )}

        {/* Pickup location — READ ONLY. The customer sets this on their pickup page;
            it sticks until they (or an admin, elsewhere) change it. */}
        {!done && (
          <div className="px-4 py-2 border-t border-slate-100 text-xs">
            {chosenLocation ? (
              <span className="text-slate-600">📍 Picks up at <strong className="text-slate-900">{chosenLocation}</strong></span>
            ) : (
              <span className="text-amber-700">No pickup location chosen yet — the customer sets it on their pickup page.</span>
            )}
          </div>
        )}

        {/* Gather & label — clear this order out of storage now, booked or not. */}
        {!done && (
          <div className="px-4 py-2.5 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <a
              href={labelHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-[#6c4d39] text-white hover:bg-[#563e2c]"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="6" rx="1"/><path d="M4 7V3h8v4M5 10h6"/></svg>
              Print 4×6 label
            </a>
            <button
              onClick={() => toggleOrderGathered(order, !allGathered)}
              disabled={busyGather === order.clerkUserId}
              className={`text-xs font-bold px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
                allGathered
                  ? "bg-[#efe0c9] border-[#e3c9a3] text-[#8a5a2b]"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {busyGather === order.clerkUserId ? "…" : allGathered ? "Gathered ✓ — undo" : "Mark gathered"}
            </button>
          </div>
        )}

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

      {note && (
        <p className={`text-sm font-medium px-1 ${note.ok ? "text-green-700" : "text-red-600"}`}>{note.text}</p>
      )}

      {/* Orders grouped by fulfillment state */}
      {orders.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500">
          Nothing sold in this auction.
        </div>
      ) : (
        <>
          {SECTIONS.map(({ key, title, dot, hint }) => {
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
                {group.map((o) => renderOrder(o))}
              </div>
            );
          })}

          {/* All set — everything for this auction is collected. Minimized, green,
              parked at the bottom. Tap the header to expand. */}
          {(() => {
            const doneOrders = orders.filter((o) => bucketOf(o) === "done");
            if (doneOrders.length === 0) return null;
            return (
              <div className="space-y-2.5">
                <button
                  onClick={() => setDoneOpen((v) => !v)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-green-200 bg-green-50 text-left"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-green-600" />
                  <h3 className="text-sm font-extrabold text-green-900 flex-1">
                    All set — picked up <span className="text-green-700/70">({doneOrders.length})</span>
                  </h3>
                  <span className="text-xs font-bold text-green-700">{doneOpen ? "Hide ▲" : "Show ▼"}</span>
                </button>
                {doneOpen && doneOrders.map((o) => renderOrder(o, true))}
              </div>
            );
          })()}
        </>
      )}

      {/* Unsold — where each sits + relist it straight into another auction */}
      {unsold.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">Didn&apos;t sell ({unsold.length})</h2>
            <Link href="/admin/unsold" className="text-xs font-bold text-[#6c4d39] hover:underline">
              All unsold →
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {unsold.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                {u.photo ? (
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-white ring-1 ring-slate-200">
                    <Image src={u.photo} alt="" fill sizes="40px" className="object-contain p-0.5" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 truncate">{u.title}</div>
                  <div className="text-xs text-slate-400 truncate">
                    {(u.warehouse || u.storageLocation)
                      ? `📍 ${[u.warehouse, u.storageLocation].filter(Boolean).join(" · ")}`
                      : "No location set"}
                    {u.highBid > 0 ? ` · high bid ${money(u.highBid)}` : ""}
                  </div>
                </div>
                <RelistControl itemId={u.id} targets={relistTargets} />
                <Link href={`/admin/items/${u.id}`} className="shrink-0 text-xs font-bold text-[#6c4d39] px-1">
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
