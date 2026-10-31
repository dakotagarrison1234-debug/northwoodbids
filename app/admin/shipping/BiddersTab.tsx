"use client";
import { useCallback, useEffect, useState } from "react";
import { Btn, Empty, Initials, Notice, Pill, Segmented } from "../ui";
import { fmtMoney } from "../format";

/**
 * "Bidding to ship" on the Ship board: everyone set to Ship who is bidding on
 * a live, shippable lot right now, before anything is won. Two uses: see the
 * boxes coming, and catch a local bidder who'd rather pick up and switch them.
 *
 * Ship / Pickup is one setting per bidder (it decides every lot they win), so
 * the list is grouped by bidder and "Switch to pickup" flips that person.
 * Local (mid-Michigan ZIP) bidders sort first and carry a Local pill.
 */

type Lot = { id: string; title: string; code: string | null; thumb: string | null; currentBid: number; myBid: number; leading: boolean; closesAt: string; warehouse: string | null };
type Bidder = { clerkUserId: string; name: string; phone: string | null; city: string; state: string; zip: string; local: boolean; leading: number; lots: Lot[] };
type Filter = "all" | "local" | "leading";

const closes = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Detroit", weekday: "short", hour: "numeric", minute: "2-digit" });

export default function BiddersTab() {
  const [bidders, setBidders] = useState<Bidder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<Bidder | null>(null);

  const load = useCallback(() => {
    setError(null);
    return fetch("/api/admin/shipping/bidders", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Couldn't load bidders.");
        setBidders(j.bidders ?? []);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load bidders."));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const flip = async (b: Bidder, choice: "PICKUP" | "SHIP") => {
    if (busy) return;
    setBusy(b.clerkUserId);
    setError(null);
    try {
      const r = await fetch("/api/admin/shipping/bidders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkUserId: b.clerkUserId, choice }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't switch them.");
      setConfirmId(null);
      if (choice === "PICKUP") {
        setBidders((list) => (list ?? []).filter((x) => x.clerkUserId !== b.clerkUserId));
        setLast(b);
      } else {
        setLast(null);
        await load();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't switch them.");
    } finally {
      setBusy(null);
    }
  };

  const all = bidders ?? [];
  const shown = all.filter((b) => (filter === "local" ? b.local : filter === "leading" ? b.leading > 0 : true));
  const leadingLots = all.reduce((n, b) => n + b.leading, 0);
  const localCount = all.filter((b) => b.local).length;

  return (
    <div className="space-y-3">
      {error && <Notice tone="red">{error}</Notice>}
      {last && (
        <Notice tone="green">
          <span className="flex flex-wrap items-center gap-3">
            <span><strong className="font-bold">{last.name}</strong> is on pickup now. Every lot they win picks up instead of ships.</span>
            <Btn size="sm" variant="outline" disabled={!!busy} onClick={() => flip(last, "SHIP")}>Undo</Btn>
          </span>
        </Notice>
      )}

      {bidders && all.length > 0 && (
        <>
          <p className="text-[15px] text-[#6f5b46]">
            <strong className="text-[#241a12] tabular-nums">{all.length}</strong> bidder{all.length !== 1 ? "s" : ""} set to ship ·{" "}
            <strong className="text-[#241a12] tabular-nums">{leadingLots}</strong> lot{leadingLots !== 1 ? "s" : ""} they&apos;re winning right now
          </p>
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Everyone", count: all.length },
              { value: "local", label: "Local", count: localCount },
              { value: "leading", label: "Winning", count: all.filter((b) => b.leading > 0).length },
            ]}
          />
        </>
      )}

      {!bidders ? (
        <div className="text-center py-20 text-[#8a7559]">Loading…</div>
      ) : all.length === 0 ? (
        <Empty text="Nobody bidding to ship yet" sub="When someone set to Ship bids on a live shippable lot, they show up here before the auction closes." />
      ) : shown.length === 0 ? (
        <Empty text={filter === "local" ? "No local bidders set to ship" : "Nobody set to ship is winning a lot right now"} />
      ) : (
        shown.map((b) => (
          <section key={b.clerkUserId} className={`bg-white border rounded-2xl overflow-hidden ${b.local ? "border-[#eed3ab]" : "border-[#e6dac6]"}`}>
            <div className="px-4 py-3 flex items-start gap-3">
              <Initials name={b.name} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[17px] text-[#241a12] leading-tight">{b.name}</span>
                  {b.local && <Pill tone="amber">Local</Pill>}
                </div>
                <div className="text-[15px] text-[#8a7559] mt-0.5 leading-snug">
                  Ships to {b.city}, {b.state} {b.zip}
                  {b.phone && (
                    <>
                      {" · "}
                      <a href={`tel:${b.phone}`} className="font-semibold text-[#563e2c] underline underline-offset-2">{b.phone}</a>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`font-display text-2xl font-black tabular-nums leading-none ${b.leading > 0 ? "text-[#2f5d3a]" : "text-[#cdbda3]"}`}>{b.leading}</div>
                <div className="text-[13px] font-bold text-[#8a7559] mt-0.5">winning</div>
              </div>
            </div>

            <ul className="divide-y divide-[#f0e6d6] border-t border-[#f0e6d6]">
              {b.lots.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                  {l.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.thumb} alt="" className="w-11 h-11 rounded-lg object-contain bg-white border border-[#f0e6d6] shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-[#f4ede1] shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold text-[#241a12] leading-tight line-clamp-1">{l.title}</div>
                    <div className="text-[13px] text-[#8a7559] tabular-nums mt-0.5 truncate">
                      {l.code ? `#${l.code} · ` : ""}{l.warehouse ? `${l.warehouse} · ` : ""}closes {closes(l.closesAt)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[15px] font-extrabold tabular-nums text-[#241a12]">{fmtMoney(l.leading ? l.currentBid : l.myBid)}</div>
                    {l.leading ? <Pill tone="green">Winning</Pill> : <Pill tone="slate">Outbid</Pill>}
                  </div>
                </li>
              ))}
            </ul>

            <div className="px-4 py-3 border-t border-[#f0e6d6] bg-[#fdfaf4]">
              {confirmId === b.clerkUserId ? (
                <div className="space-y-2.5">
                  <p className="text-[15px] text-[#4a3a2b] leading-snug">
                    Switch <strong>{b.name}</strong> to pickup? Every lot they win from now on, here and in later auctions, is pickup instead of shipped. They can switch back on any lot page.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Btn size="sm" tone="amber" disabled={busy === b.clerkUserId} onClick={() => flip(b, "PICKUP")}>
                      {busy === b.clerkUserId ? "Switching…" : "Switch to pickup"}
                    </Btn>
                    <Btn size="sm" variant="ghost" tone="slate" onClick={() => setConfirmId(null)}>Cancel</Btn>
                  </div>
                </div>
              ) : (
                <Btn size="sm" variant="outline" tone="leather" onClick={() => setConfirmId(b.clerkUserId)}>Switch to pickup</Btn>
              )}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
