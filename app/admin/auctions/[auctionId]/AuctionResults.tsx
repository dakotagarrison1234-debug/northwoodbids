"use client";

import { useState } from "react";
import Image from "next/image";
import { IcoCheck, IcoTruck } from "@/app/components/BidIcons";
import { Panel, Pill, Btn, BtnLink, Initials, Money, SearchBox, Notice, Empty, Progress, Disclosure, type Tone } from "../../ui";

export interface ResultItem {
  id: string;
  title: string;
  code: string | null;
  photo: string | null;
  amount: number;
  paidState: "paid" | "comped" | "unpaid";
  pickedUp: boolean;
  gathered: boolean;
  warehouse: string | null; // where the item currently sits
  transferring: boolean; // has an active (requested/loaded) transfer
  transferTo: string | null; // transfer destination
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

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Detroit",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function IcoPin({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="6" cy="5" r="2"/><path d="M6 1C3.79 1 2 2.79 2 5c0 3 4 7 4 7s4-4 4-7c0-2.21-1.79-4-4-4z"/></svg>;
}
function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden><path d="M4 6l4 4 4-4" /></svg>
  );
}

function PaidPill({ state }: { state: ResultItem["paidState"] }) {
  const t: Tone = state === "paid" ? "green" : state === "unpaid" ? "red" : "slate";
  const label = { paid: "Paid", comped: "Comped", unpaid: "Unpaid" }[state];
  return <Pill tone={t}>{label}</Pill>;
}

/** Thumb or a blank tile, 40px. */
function Thumb({ src }: { src: string | null }) {
  return src ? (
    <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-white ring-1 ring-[#e6dac6]">
      <Image src={src} alt="" fill sizes="40px" className="object-contain p-0.5" />
    </div>
  ) : (
    <div className="w-10 h-10 rounded-lg bg-[#f4ede1] ring-1 ring-[#e6dac6] shrink-0" />
  );
}

const DONE_SHOWN = 5;

/**
 * Who won what in an ended auction: paid or not, picked up or not, and where they
 * stand on pickup. Gathering, staging, labels and marking picked up all happen on
 * the Pickup board — every order links straight there.
 */
export default function AuctionResults({
  orders: initialOrders,
  locations,
}: {
  orders: ResultOrder[];
  locations: { id: string; name: string }[];
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyItem, setBusyItem] = useState<string | null>(null);
  // Two-tap confirm for forfeit (it moves money / relists an item).
  const [forfeitKey, setForfeitKey] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [note, setNote] = useState<{ key: string; text: string } | null>(null);

  // One search across all orders (name/email/phone) so a big auction stays usable.
  const oq = orderSearch.trim().toLowerCase();
  const matchOrder = (o: ResultOrder) =>
    !oq ||
    o.name.toLowerCase().includes(oq) ||
    (o.email ?? "").toLowerCase().includes(oq) ||
    (o.phone ?? "").includes(orderSearch.trim());

  // id to name, for showing a customer's chosen pickup location read-only.
  const locName = new Map(locations.map((l) => [l.id, l.name]));

  const unpaidCount = orders.reduce((n, o) => n + o.items.filter((i) => i.paidState === "unpaid").length, 0);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Forfeit a single item: refund this item's share if it was paid, then free it to
  // relist (drops off "who owes" if it wasn't paid). Removes it from the order here.
  const forfeitItem = async (clerkUserId: string, itemId: string) => {
    setBusyItem(itemId);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/items/${itemId}/forfeit`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setForfeitKey(null);
        setOrders((prev) =>
          prev
            .map((o) =>
              o.clerkUserId === clerkUserId
                ? { ...o, items: o.items.filter((i) => i.id !== itemId) }
                : o
            )
            .filter((o) => o.items.length > 0)
        );
      } else {
        setNote({ key: itemId, text: data.error || "Couldn't forfeit this item." });
      }
    } catch {
      setNote({ key: itemId, text: "Something went wrong." });
    } finally {
      setBusyItem(null);
    }
  };

  const isDone = (o: ResultOrder) => o.items.length > 0 && o.items.every((i) => i.pickedUp);

  const renderOrder = (order: ResultOrder) => {
    const done = isDone(order);
    const isOpen = expanded.has(order.clerkUserId);
    const orderUnpaid = order.items.filter((i) => i.paidState === "unpaid").length;
    const orderPicked = order.items.filter((i) => i.pickedUp).length;
    const chosenLocation = order.preferredLocationId ? locName.get(order.preferredLocationId) ?? null : null;
    // Land on the tab the customer is actually on, searching by something that
    // matches the board (name can be a fallback like "Bidder" — prefer phone then).
    const todayKeyDetroit = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Detroit" }).format(new Date());
    const pickupTab = !order.scheduledFor
      ? "waiting"
      : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Detroit" }).format(new Date(order.scheduledFor)) <= todayKeyDetroit
        ? "today"
        : "upcoming";
    const pickupQ = order.phone || order.email || order.name;
    const pickupHref = `/admin/pickup?tab=${pickupTab}&q=${encodeURIComponent(pickupQ)}`;

    return (
      <div
        key={order.clerkUserId}
        className={`rounded-2xl border overflow-hidden ${done ? "border-[#bfd9c5] bg-[#f3f8f4]" : "border-[#e6dac6] bg-white"}`}
      >
        {/* Header — always visible, tap to expand items */}
        <button
          type="button"
          onClick={() => toggle(order.clerkUserId)}
          aria-expanded={isOpen}
          className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors ${done ? "hover:bg-[#e6f1e8]" : "hover:bg-[#faf5ea]"}`}
        >
          <Initials name={order.name} size={40} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className={`font-bold truncate ${done ? "text-[#2f5d3a]" : "text-[#241a12]"}`}>{order.name}</div>
            <div className="text-[15px] text-[#8a7559] truncate">
              {order.phone || order.email || "No contact on file"}
              {" · "}{order.items.length} item{order.items.length !== 1 ? "s" : ""}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {orderUnpaid > 0 ? <Pill tone="red">{orderUnpaid} unpaid</Pill> : <Pill tone="green">Paid</Pill>}
              {done ? (
                <Pill tone="green" dot>Picked up</Pill>
              ) : (
                <Pill tone="slate">{orderPicked}/{order.items.length} picked up</Pill>
              )}
            </div>
            {!done && order.items.length > 1 && (
              <Progress value={orderPicked / order.items.length} className="mt-2 max-w-[200px]" />
            )}
            {/* Pickup status — one line. */}
            {!done && (
              <div className="text-[15px] mt-2 inline-flex items-center gap-1.5">
                {order.scheduledFor ? (
                  <span className="inline-flex items-center gap-1.5 text-[#2f5d3a] font-bold">
                    <IcoCheck className="w-4 h-4" />
                    Pickup {fmtWhen(order.scheduledFor)}{order.scheduledLocation ? ` · ${order.scheduledLocation}` : ""}
                  </span>
                ) : chosenLocation ? (
                  <span className="inline-flex items-center gap-1 text-[#6f5b46]"><IcoPin /> Picks up at <strong className="text-[#241a12]">{chosenLocation}</strong></span>
                ) : (
                  <span className="text-[#8a4f1c] font-semibold">No pickup location yet</span>
                )}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="font-display text-xl"><Money value={order.total} /></div>
            <div className="inline-flex items-center gap-1 text-[15px] text-[#6c4d39] font-bold mt-0.5">
              {isOpen ? "Hide" : "Items"} <Chevron open={isOpen} />
            </div>
          </div>
        </button>

        {/* Items — hidden until expanded */}
        {isOpen && (
          <>
            <ul className="divide-y divide-[#f0e6d6] border-t border-[#f0e6d6]">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-start gap-3 px-4 py-3">
                  <Thumb src={it.photo} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[#241a12] truncate">
                      {it.code && <span className="font-mono text-[#6c4d39] mr-1.5">{it.code}</span>}
                      {it.title}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Money value={it.amount} />
                      <PaidPill state={it.paidState} />
                    </div>
                    <div className="text-[15px] mt-1 font-semibold inline-flex items-center gap-1">
                      {it.pickedUp ? (
                        <span className="inline-flex items-center gap-1 text-[#2f5d3a]"><IcoCheck className="w-4 h-4" /> Picked up</span>
                      ) : it.transferring ? (
                        <span className="inline-flex items-center gap-1 text-[#8a4f1c]"><IcoTruck className="w-4 h-4" /> Transferring{it.transferTo ? ` to ${it.transferTo}` : ""}</span>
                      ) : it.gathered ? (
                        <span className="inline-flex items-center gap-1 text-[#8a4f1c]"><IcoCheck className="w-4 h-4" /> Gathered</span>
                      ) : it.warehouse ? (
                        <span className="inline-flex items-center gap-1 text-[#8a7559]"><IcoPin /> {it.warehouse}</span>
                      ) : (
                        <span className="text-[#b3a085]">No warehouse set</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="px-4 py-3 border-t border-[#f0e6d6] space-y-3">
              <BtnLink href={pickupHref} variant="outline" size="sm" className="w-full sm:w-auto">Open on Pickup board</BtnLink>

              {/* Rare: forfeit an item (refund if paid, relist). Two-tap. */}
              <Disclosure label="More">
                <ul className="divide-y divide-[#f0e6d6]">
                  {order.items.map((it) => (
                    <li key={it.id} className="px-4 py-3 flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-[#241a12]">{it.title}</span>
                      {forfeitKey === it.id ? (
                        <>
                          <Btn size="sm" tone="red" onClick={() => forfeitItem(order.clerkUserId, it.id)} disabled={busyItem === it.id}>
                            {busyItem === it.id ? "Working…" : it.paidState === "paid" ? "Refund and relist" : "Forfeit and relist"}
                          </Btn>
                          <Btn size="sm" tone="slate" variant="ghost" onClick={() => setForfeitKey(null)}>Cancel</Btn>
                        </>
                      ) : (
                        <Btn size="sm" tone="red" variant="outline" onClick={() => { setForfeitKey(it.id); setNote(null); }}>
                          Forfeit item
                        </Btn>
                      )}
                      {note && note.key === it.id && (
                        <span className="w-full text-[15px] font-semibold text-[#a1321f]">{note.text}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </Disclosure>
            </div>
          </>
        )}
      </div>
    );
  };

  const shown = orders.filter(matchOrder);
  const openOrders = shown.filter((o) => !isDone(o));
  const doneOrders = shown.filter(isDone);
  // When not searching, only show the 5 most recent picked-up orders — a big
  // auction can have hundreds and we don't want to render them all.
  const doneShown = oq ? doneOrders : doneOrders.slice(0, DONE_SHOWN);

  return (
    <Panel
      title={<>Orders <span className="text-[#8a7559] text-[17px]">({orders.length})</span></>}
      sub={unpaidCount > 0 ? `${unpaidCount} unpaid` : undefined}
    >
      {orders.length === 0 ? (
        <Empty text="Nothing sold in this auction." />
      ) : (
        <div className="px-4 sm:px-5 py-4 space-y-3">
          {orders.length > 5 && (
            <SearchBox
              type="text"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              placeholder="Search by name, email or phone"
            />
          )}

          {note && !orders.some((o) => o.items.some((i) => i.id === note.key)) && (
            <Notice tone="red">{note.text}</Notice>
          )}

          {shown.length === 0 && <Empty text={`No orders match "${orderSearch.trim()}".`} />}

          {openOrders.map((o) => renderOrder(o))}

          {doneOrders.length > 0 && (
            <Disclosure label={`Picked up (${doneOrders.length})`} tone="green">
              <div className="p-3 space-y-2.5">
                {doneShown.map((o) => renderOrder(o))}
                {doneOrders.length > doneShown.length && (
                  <p className="text-[15px] text-[#8a7559] px-1">Showing {doneShown.length} of {doneOrders.length}. Search to find the rest.</p>
                )}
              </div>
            </Disclosure>
          )}
        </div>
      )}
    </Panel>
  );
}
