"use client";

import { useState } from "react";
import Image from "next/image";
import RelistControl, { type RelistTarget } from "../../RelistControl";
import PrintLabelButton from "../../PrintLabelButton";
import { IcoCheck, IcoTruck } from "@/app/components/BidIcons";
import { fmtMoney0 } from "../../format";
import { Panel, Pill, Btn, BtnLink, Initials, Money, SearchBox, Notice, Empty, Progress, Eyebrow, tone, type Tone } from "../../ui";

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
export interface ResultUnsold {
  id: string;
  title: string;
  code: string | null;
  photo: string | null;
  highBid: number;
  warehouse: string | null;
  storageLocation: string | null;
}

type Bucket = "done" | "scheduled" | "no_pickup" | "no_location";

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

function IcoPin({ className = "w-3 h-3" }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="6" cy="5" r="2"/><path d="M6 1C3.79 1 2 2.79 2 5c0 3 4 7 4 7s4-4 4-7c0-2.21-1.79-4-4-4z"/></svg>;
}
function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden><path d="M4 6l4 4 4-4" /></svg>
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

const SECTIONS: { key: Bucket; title: string; tone: Tone; hint: string }[] = [
  { key: "scheduled", title: "Pickup scheduled", tone: "green", hint: "Has a booked collection time" },
  { key: "no_pickup", title: "No pickup booked", tone: "amber", hint: "Has a location — waiting on the customer to pick a time" },
  { key: "no_location", title: "No location set", tone: "red", hint: "Pick their pickup location to start fulfillment" },
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
  // Two-tap confirm for forfeit (it moves money / relists an item).
  const [forfeitKey, setForfeitKey] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  // Each status group is a collapsible dropdown — open just the one you're working.
  const [openSections, setOpenSections] = useState<Set<Bucket>>(new Set());

  // One search across all orders (name/email/phone) so a big auction stays usable.
  const oq = orderSearch.trim().toLowerCase();
  const matchOrder = (o: ResultOrder) =>
    !oq ||
    o.name.toLowerCase().includes(oq) ||
    (o.email ?? "").toLowerCase().includes(oq) ||
    (o.phone ?? "").includes(orderSearch.trim());
  const toggleSection = (key: Bucket) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
        setNote({ key: itemId, text: data.error || "Couldn't forfeit this item.", ok: false });
      }
    } catch {
      setNote({ key: itemId, text: "Something went wrong.", ok: false });
    } finally {
      setBusyItem(null);
    }
  };

  const gatherItem = async (itemId: string, gathered: boolean) => {
    await fetch(`/api/admin/pickup/items/${itemId}/grab`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grabbed: gathered }),
    });
  };

  // Gather (or un-gather) a single item — the one you actually pulled off the shelf.
  const setItemGathered = async (clerkUserId: string, itemId: string, gathered: boolean) => {
    setBusyItem(itemId);
    setNote(null);
    try {
      await gatherItem(itemId, gathered);
      setOrders((prev) =>
        prev.map((o) =>
          o.clerkUserId === clerkUserId
            ? { ...o, items: o.items.map((i) => (i.id === itemId ? { ...i, gathered } : i)) }
            : o
        )
      );
    } catch {
      setNote({ key: itemId, text: "Couldn't update gathered status.", ok: false });
    } finally {
      setBusyItem(null);
    }
  };

  // Gather all of an order's items that are ACTUALLY HERE (skip transferring / picked
  // up) — the rest wait until they're transferred in and scheduled.
  const toggleOrderGathered = async (order: ResultOrder, gathered: boolean) => {
    const targets = order.items.filter((i) => !i.pickedUp && !i.transferring);
    setBusyGather(order.clerkUserId);
    setNote(null);
    try {
      await Promise.all(targets.map((it) => gatherItem(it.id, gathered)));
      const ids = new Set(targets.map((t) => t.id));
      setOrders((prev) =>
        prev.map((o) =>
          o.clerkUserId === order.clerkUserId
            ? { ...o, items: o.items.map((i) => (ids.has(i.id) ? { ...i, gathered } : i)) }
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
    // You can only gather what's physically here: not picked up, not out on transfer.
    const gatherable = order.items.filter((i) => !i.pickedUp && !i.transferring);
    const allGathered = gatherable.length > 0 && gatherable.every((i) => i.gathered);
    const orderUnpaid = order.items.filter((i) => i.paidState === "unpaid").length;
    const orderPicked = order.items.filter((i) => i.pickedUp).length;
    const chosenLocation = order.preferredLocationId ? locName.get(order.preferredLocationId) ?? null : null;
    const labelHref = `/api/admin/label?type=pickup&auction=${auctionId}&user=${encodeURIComponent(order.clerkUserId)}`;

    // Where this person's not-yet-collected items physically are: sitting at a
    // warehouse (ready to gather) vs. on an active transfer (moving / to be moved).
    const active = order.items.filter((i) => !i.pickedUp);
    const transferringItems = active.filter((i) => i.transferring);
    const hereByWarehouse = new Map<string, number>();
    for (const i of active.filter((i) => !i.transferring)) {
      const w = i.warehouse || "No warehouse";
      hereByWarehouse.set(w, (hereByWarehouse.get(w) ?? 0) + 1);
    }
    const transferDests = [...new Set(transferringItems.map((i) => i.transferTo).filter(Boolean))] as string[];

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
            <div className="text-xs text-[#8a7559] truncate">
              {[order.phone, order.email].filter(Boolean).join(" · ") || "No contact on file"}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-xs text-[#8a7559]">
                {order.items.length} item{order.items.length !== 1 ? "s" : ""}
              </span>
              {done ? (
                <Pill tone="green" dot>All set</Pill>
              ) : (
                <>
                  {orderUnpaid > 0 && <Pill tone="red">{orderUnpaid} unpaid</Pill>}
                  {allGathered && <Pill tone="amber">Gathered</Pill>}
                  <Pill tone="slate">{orderPicked}/{order.items.length} picked up</Pill>
                </>
              )}
            </div>

            {/* Where their stuff is — at a warehouse (ready to gather) vs transferring. */}
            {!done && (hereByWarehouse.size > 0 || transferringItems.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {[...hereByWarehouse.entries()].map(([w, n]) => (
                  <span key={w} className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#e6f1e8] text-[#2f5d3a] border border-[#bfd9c5]">
                    <IcoPin /> {w} ×{n}
                  </span>
                ))}
                {transferringItems.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#fbeed8] text-[#8a4f1c] border border-[#eed3ab]">
                    <IcoTruck className="w-3.5 h-3.5" /> {transferringItems.length} transferring{transferDests.length ? ` to ${transferDests.join(", ")}` : ""}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="font-display text-lg"><Money value={order.total} /></div>
            <div className="inline-flex items-center gap-1 text-[11px] text-[#6c4d39] font-bold mt-0.5">
              {isOpen ? "Hide items" : "View items"} <Chevron open={isOpen} />
            </div>
          </div>
        </button>

        {/* Scheduled banner (only while not fully done) */}
        {!done && order.scheduledFor && (
          <div className="px-4 py-2 bg-[#e6f1e8] border-t border-[#bfd9c5] text-xs text-[#2f5d3a] font-bold inline-flex w-full items-center gap-1.5">
            <IcoCheck className="w-3.5 h-3.5" />
            Pickup {fmtWhen(order.scheduledFor)}
            {order.scheduledLocation ? ` · ${order.scheduledLocation}` : ""}
          </div>
        )}

        {/* Pickup location — READ ONLY. The customer sets this on their pickup page;
            it sticks until they (or an admin, elsewhere) change it. */}
        {!done && (
          <div className="px-4 py-2 border-t border-[#f0e6d6] text-xs">
            {chosenLocation ? (
              <span className="inline-flex items-center gap-1 text-[#6f5b46]"><IcoPin /> Picks up at <strong className="text-[#241a12]">{chosenLocation}</strong></span>
            ) : (
              <span className="text-[#8a4f1c] font-semibold">No pickup location chosen yet — the customer sets it on their pickup page.</span>
            )}
          </div>
        )}

        {/* Gather & label — clear this order out of storage now, booked or not. */}
        {!done && (
          <div className="px-4 py-2.5 border-t border-[#f0e6d6] flex flex-wrap items-center gap-2">
            <PrintLabelButton
              href={labelHref}
              label="Print 4×6 label"
              className="inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors whitespace-nowrap min-h-[40px] px-3.5 text-sm bg-[#6c4d39] hover:bg-[#563e2c] text-white shadow-sm"
            />
            {gatherable.length > 0 && (
              <Btn
                size="sm"
                tone="amber"
                variant={allGathered ? "solid" : "outline"}
                onClick={() => toggleOrderGathered(order, !allGathered)}
                disabled={busyGather === order.clerkUserId}
              >
                {busyGather === order.clerkUserId
                  ? "…"
                  : allGathered
                  ? "Gathered — undo"
                  : `Gather ${gatherable.length} here`}
              </Btn>
            )}
          </div>
        )}

        {/* Items — hidden until expanded */}
        {isOpen && (
          <>
            <ul className="divide-y divide-[#f0e6d6] border-t border-[#f0e6d6]">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-start gap-3 px-4 py-3">
                  <Thumb src={it.photo} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-[#241a12] truncate">
                      {it.code && <span className="font-mono text-[#6c4d39] mr-1.5">{it.code}</span>}
                      {it.title}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm"><Money value={it.amount} /></span>
                      <PaidPill state={it.paidState} />
                    </div>
                    <div className="text-[11px] mt-1 font-semibold inline-flex items-center gap-1">
                      {it.pickedUp ? (
                        <span className="inline-flex items-center gap-1 text-[#2f5d3a]"><IcoCheck className="w-3 h-3" /> Picked up</span>
                      ) : it.transferring ? (
                        <span className="inline-flex items-center gap-1 text-[#8a4f1c]"><IcoTruck className="w-3.5 h-3.5" /> Transferring{it.transferTo ? ` to ${it.transferTo}` : ""}</span>
                      ) : it.gathered ? (
                        // Off the shelf now — the warehouse it came from no longer matters.
                        <span className="inline-flex items-center gap-1 text-[#8a4f1c]"><IcoCheck className="w-3 h-3" /> Gathered · off shelf</span>
                      ) : it.warehouse ? (
                        <span className="inline-flex items-center gap-1 text-[#8a7559]"><IcoPin /> {it.warehouse} · ready to gather</span>
                      ) : (
                        <span className="text-[#b3a085]">No warehouse set</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    {it.pickedUp ? (
                      <Btn
                        size="sm"
                        tone="green"
                        onClick={() => setItemPickup(order.clerkUserId, it.id, false)}
                        disabled={busyItem === it.id}
                      >
                        {busyItem === it.id ? "…" : <><IcoCheck className="w-4 h-4" /> Picked up</>}
                      </Btn>
                    ) : it.transferring ? (
                      <Pill tone="amber">Awaiting transfer</Pill>
                    ) : (
                      <>
                        <Btn
                          size="sm"
                          tone="amber"
                          variant={it.gathered ? "solid" : "outline"}
                          onClick={() => setItemGathered(order.clerkUserId, it.id, !it.gathered)}
                          disabled={busyItem === it.id}
                        >
                          {busyItem === it.id ? "…" : it.gathered ? "Gathered" : "Gather"}
                        </Btn>
                        <Btn
                          size="sm"
                          tone="slate"
                          variant="ghost"
                          onClick={() => setItemPickup(order.clerkUserId, it.id, true)}
                          disabled={busyItem === it.id}
                        >
                          Picked up
                        </Btn>
                      </>
                    )}

                    {/* Forfeit — refund this item (if paid) + relist. Two-tap. */}
                    {forfeitKey === it.id ? (
                      <div className="flex flex-col items-end gap-1 mt-0.5">
                        <Btn
                          size="sm"
                          tone="red"
                          onClick={() => forfeitItem(order.clerkUserId, it.id)}
                          disabled={busyItem === it.id}
                        >
                          {busyItem === it.id
                            ? "…"
                            : it.paidState === "paid"
                            ? "Refund this item & relist"
                            : "Forfeit & relist"}
                        </Btn>
                        <Btn size="sm" tone="slate" variant="ghost" onClick={() => setForfeitKey(null)}>
                          Cancel
                        </Btn>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setForfeitKey(it.id); setNote(null); }}
                        className="text-xs font-semibold text-[#a1321f] hover:underline min-h-[32px] px-1"
                      >
                        Forfeit item
                      </button>
                    )}
                    {note && note.key === it.id && !note.ok && (
                      <span className="text-[11px] font-semibold text-[#a1321f] text-right max-w-[160px] leading-tight">{note.text}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {!allPickedUp && (
              <div className="px-4 py-2 border-t border-[#f0e6d6]">
                <Btn size="sm" variant="ghost" onClick={() => markOrderPickedUp(order)}>
                  Mark whole order picked up
                </Btn>
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
      <Panel
        title="Results & fulfillment"
        sub="Who won what, who's paid, who's collected."
        action={
          <div className="flex gap-1">
            <BtnLink href="/admin/reports" variant="ghost" size="sm">Reports</BtnLink>
            <BtnLink href="/admin/winners" variant="ghost" size="sm">Winners</BtnLink>
          </div>
        }
      >
        <div className="px-4 sm:px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-xl bg-[#f4ede1] px-3 py-2.5">
              <Eyebrow>Sold</Eyebrow>
              <div className="font-display text-2xl font-black text-[#241a12] tabular-nums mt-0.5">{soldCount}</div>
            </div>
            <div className="rounded-xl bg-[#f4ede1] px-3 py-2.5">
              <Eyebrow>Gross</Eyebrow>
              <div className="font-display text-2xl font-black text-[#2f5d3a] tabular-nums mt-0.5">{fmtMoney0(grossTotal)}</div>
            </div>
            <div className={`rounded-xl px-3 py-2.5 ${unpaidCount > 0 ? "bg-[#fbeae6]" : "bg-[#f4ede1]"}`}>
              <Eyebrow className={unpaidCount > 0 ? "!text-[#a1321f]" : ""}>Unpaid</Eyebrow>
              <div className={`font-display text-2xl font-black tabular-nums mt-0.5 ${unpaidCount > 0 ? "text-[#a1321f]" : "text-[#241a12]"}`}>{unpaidCount}</div>
            </div>
            <div className="rounded-xl bg-[#f4ede1] px-3 py-2.5">
              <Eyebrow>Picked up</Eyebrow>
              <div className="font-display text-2xl font-black text-[#241a12] tabular-nums mt-0.5">{pickedUpCount}<span className="text-base text-[#8a7559]">/{soldCount}</span></div>
              <Progress value={soldCount > 0 ? pickedUpCount / soldCount : 0} className="mt-2" />
            </div>
          </div>
          {orders.length > 5 && (
            <SearchBox
              type="text"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              placeholder="Search orders by name, email or phone…"
            />
          )}
        </div>
      </Panel>

      {note && <Notice tone={note.ok ? "green" : "red"}>{note.text}</Notice>}

      {/* Orders grouped by fulfillment state */}
      {orders.length === 0 ? (
        <div className="bg-white border border-[#e6dac6] rounded-2xl">
          <Empty text="Nothing sold in this auction." sub="Unsold lots are listed below so you can relist them." />
        </div>
      ) : (
        <>
          {SECTIONS.map(({ key, title, tone: t, hint }) => {
            const group = orders.filter((o) => bucketOf(o) === key && matchOrder(o));
            if (group.length === 0) return null;
            const open = openSections.has(key);
            return (
              <div key={key} className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => toggleSection(key)}
                  aria-expanded={open}
                  className="w-full flex items-center gap-2.5 px-4 min-h-[52px] rounded-xl border border-[#e6dac6] bg-white text-left hover:bg-[#faf5ea] transition-colors"
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${tone(t).dot}`} />
                  <span className="flex-1 min-w-0">
                    <span className="font-bold text-[#241a12]">{title}</span>
                    <span className="text-[#8a7559] font-bold"> ({group.length})</span>
                    <span className="text-xs text-[#8a7559] hidden sm:inline"> — {hint}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#6c4d39] shrink-0">
                    {open ? "Hide" : "Show"} <Chevron open={open} />
                  </span>
                </button>
                {open && group.map((o) => renderOrder(o))}
              </div>
            );
          })}

          {/* All set — everything for this auction is collected. Minimized, green,
              parked at the bottom. Tap the header to expand. */}
          {(() => {
            const allDone = orders.filter((o) => bucketOf(o) === "done" && matchOrder(o));
            if (allDone.length === 0) return null;
            // When not searching, only show the 5 most recent — a big auction can
            // have hundreds of picked-up orders and we don't want to render them all.
            const doneOrders = oq ? allDone : allDone.slice(0, 5);
            const hiddenDone = allDone.length - doneOrders.length;
            return (
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => setDoneOpen((v) => !v)}
                  aria-expanded={doneOpen}
                  className="w-full flex items-center gap-2.5 px-4 min-h-[52px] rounded-xl border border-[#bfd9c5] bg-[#e6f1e8] text-left hover:bg-[#d3e6d7] transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-[#4a7c59] shrink-0" />
                  <span className="flex-1 min-w-0 font-bold text-[#2f5d3a]">
                    All set — picked up <span className="opacity-70">({allDone.length})</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#2f5d3a] shrink-0">
                    {doneOpen ? "Hide" : "Show"} <Chevron open={doneOpen} />
                  </span>
                </button>
                {doneOpen && doneOrders.map((o) => renderOrder(o, true))}
                {doneOpen && hiddenDone > 0 && (
                  <p className="text-xs text-[#8a7559] px-3 pb-1">
                    Showing 5 most recent. Search above to find any of the other {hiddenDone}.
                  </p>
                )}
              </div>
            );
          })()}
        </>
      )}

      {/* Unsold — where each sits + relist it straight into another auction */}
      {unsold.length > 0 && (
        <Panel
          title={<>Didn&apos;t sell <span className="text-[#8a7559] text-base">({unsold.length})</span></>}
          sub="Relist straight into another auction."
          action={<BtnLink href="/admin/unsold" variant="ghost" size="sm">All unsold</BtnLink>}
        >
          <ul className="divide-y divide-[#f0e6d6]">
            {unsold.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <Thumb src={u.photo} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-[#241a12] truncate">
                    {u.code && <span className="font-mono text-[#6c4d39] mr-1.5">{u.code}</span>}
                    {u.title}
                  </div>
                  <div className="text-xs text-[#8a7559] truncate inline-flex items-center gap-1">
                    {(u.warehouse || u.storageLocation) ? (
                      <><IcoPin /> {[u.warehouse, u.storageLocation].filter(Boolean).join(" · ")}</>
                    ) : (
                      "No location set"
                    )}
                    {u.highBid > 0 ? ` · high bid ${fmtMoney0(u.highBid)}` : ""}
                  </div>
                </div>
                <RelistControl itemId={u.id} targets={relistTargets} locations={locations} />
                <BtnLink href={`/admin/items/${u.id}`} variant="ghost" size="sm">Edit</BtnLink>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
