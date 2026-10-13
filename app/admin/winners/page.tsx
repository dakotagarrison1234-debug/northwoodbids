"use client";
import { useState, useEffect, useCallback } from "react";
import { fmtMoney } from "../format";
import {
  Pill, Panel, Empty, PageHeader, PageBody, Segmented, SearchBox, Toolbar,
  Btn, Row, Money, Initials, Notice, Disclosure,
} from "../ui";
import MessageSheet, { type MessageTarget } from "../MessageSheet";

interface OwedRow { clerkUserId: string; name: string; phone: string; email: string; itemCount: number; amount: number }
interface FeedRow {
  id: string; itemId: string; title: string; photo: string | null;
  auctionId: string | null; auctionTitle: string | null;
  amount: number; wonAt: string; clerkUserId: string; name: string;
  state: "paid" | "unpaid" | "comped";
}
interface Data {
  stats: { owedTotal: number; owedPeople: number };
  owed: OwedRow[];
  feed: FeedRow[];
  total: number; skip: number; page: number;
}

export default function WinnersPage() {
  const [d, setD] = useState<Data | null>(null);
  const [q, setQ] = useState("");
  const [skip, setSkip] = useState(0);
  const [filter, setFilter] = useState<"all" | "unpaid" | "paid">("all");
  const [loading, setLoading] = useState(true);
  const [msgTarget, setMsgTarget] = useState<MessageTarget | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryMsg, setRetryMsg] = useState<{ key: string; text: string; ok: boolean } | null>(null);
  // Cash / in-person payment: two-tap confirm so it can't be fired by accident.
  const [cashKey, setCashKey] = useState<string | null>(null);
  const [cashBusy, setCashBusy] = useState<string | null>(null);
  const [cashMsg, setCashMsg] = useState<{ key: string; text: string; ok: boolean } | null>(null);

  const load = useCallback((query: string, sk: number, f: string) => {
    setLoading(true);
    fetch(`/api/admin/winners?q=${encodeURIComponent(query)}&skip=${sk}&filter=${f}`)
      .then((r) => r.json())
      .then((j) => { if (j.stats) setD(j); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Admin retry of a customer's outstanding balance (charges their card on file).
  const retryCharge = async (clerkUserId: string) => {
    setRetrying(clerkUserId);
    setRetryMsg(null);
    try {
      const res = await fetch("/api/admin/charge-owed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkUserId }),
      });
      const data = await res.json();
      if (data.success) {
        setRetryMsg({ key: clerkUserId, text: data.coveredByCredit ? "Covered by Bid Bucks" : "Charged", ok: true });
        load(q.trim(), skip, filter);
      } else {
        setRetryMsg({ key: clerkUserId, text: data.error || "Could not charge.", ok: false });
      }
    } catch {
      setRetryMsg({ key: clerkUserId, text: "Something went wrong.", ok: false });
    } finally {
      setRetrying(null);
    }
  };

  // Record an in-person CASH payment for everything this customer owes. No card is
  // charged; it just marks their balance paid (cash) so items flow to pickup and the
  // money shows in Reports.
  const markCash = async (clerkUserId: string) => {
    setCashBusy(clerkUserId);
    setCashMsg(null);
    try {
      const res = await fetch("/api/admin/mark-cash-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkUserId }),
      });
      const data = await res.json();
      if (data.success) {
        setCashKey(null);
        const moved = Number(data.movedToPickup ?? 0);
        setCashMsg({
          key: clerkUserId,
          text: moved > 0 ? `Marked paid in cash. ${moved} lot${moved !== 1 ? "s" : ""} moved out of shipping to pickup (no shipping charged).` : "Marked paid in cash",
          ok: true,
        });
        load(q.trim(), skip, filter);
      } else {
        setCashMsg({ key: clerkUserId, text: data.error || "Could not mark cash.", ok: false });
      }
    } catch {
      setCashMsg({ key: clerkUserId, text: "Something went wrong.", ok: false });
    } finally {
      setCashBusy(null);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => load(q.trim(), skip, filter), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, skip, filter, load]);

  // Any change of search or filter starts back at page 1.
  const changeQ = (v: string) => { setQ(v); setSkip(0); };
  const changeFilter = (v: "all" | "unpaid" | "paid") => { setFilter(v); setSkip(0); };

  const stats = d?.stats;

  return (
    <>
      <PageHeader
        title="Payments"
        sub={stats && stats.owedTotal > 0 ? `${fmtMoney(stats.owedTotal)} still to collect` : undefined}
      />

      <PageBody>
        {/* Who owes: the only thing that needs action */}
        {d && d.owed.length > 0 && (
          <Panel tone="red" title="Who owes">
            <ul className="divide-y divide-[#f0e6d6]">
              {d.owed.map((o) => (
                <li key={o.clerkUserId} className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Initials name={o.name} />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[#241a12] truncate">{o.name}</div>
                      <div className="text-[15px] text-[#8a7559]">
                        {o.itemCount} item{o.itemCount !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="font-display text-2xl font-black text-[#a1321f] tabular-nums shrink-0">
                      {fmtMoney(o.amount)}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Btn
                      tone="green"
                      size="sm"
                      className="flex-1"
                      onClick={() => retryCharge(o.clerkUserId)}
                      disabled={retrying === o.clerkUserId}
                    >
                      {retrying === o.clerkUserId ? "Charging…" : "Retry charge"}
                    </Btn>
                    {o.phone && (
                      <Btn
                        tone="blue"
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setMsgTarget({ clerkUserId: o.clerkUserId, name: o.name, phone: o.phone })}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3.5h12v8H5l-3 2.5z"/></svg>
                        Text
                      </Btn>
                    )}
                  </div>
                  {/* Cash / in-person is rare: lives under More, with a two-tap confirm (it's money). */}
                  <Disclosure label="More" className="mt-2">
                    <div className="p-3">
                      {cashKey === o.clerkUserId ? (
                        <div className="flex gap-2">
                          <Btn
                            tone="green"
                            size="sm"
                            className="flex-1"
                            onClick={() => markCash(o.clerkUserId)}
                            disabled={cashBusy === o.clerkUserId}
                          >
                            {cashBusy === o.clerkUserId ? "Marking…" : `Confirm cash ${fmtMoney(o.amount)}`}
                          </Btn>
                          <Btn tone="slate" variant="outline" size="sm" onClick={() => setCashKey(null)}>
                            Cancel
                          </Btn>
                        </div>
                      ) : (
                        <Btn
                          tone="green"
                          variant="outline"
                          size="sm"
                          full
                          onClick={() => { setCashKey(o.clerkUserId); setCashMsg(null); }}
                        >
                          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="16" height="10" rx="2" /><circle cx="10" cy="10" r="2.2" /></svg>
                          Mark paid — cash
                        </Btn>
                      )}
                    </div>
                  </Disclosure>
                  {retryMsg && retryMsg.key === o.clerkUserId && (
                    <Notice tone={retryMsg.ok ? "green" : "red"} className="mt-2">{retryMsg.text}</Notice>
                  )}
                  {cashMsg && cashMsg.key === o.clerkUserId && (
                    <Notice tone={cashMsg.ok ? "green" : "red"} className="mt-2">{cashMsg.text}</Notice>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {/* Search + filter */}
        <Toolbar>
          <SearchBox
            type="text"
            value={q}
            onChange={(e) => changeQ(e.target.value)}
            placeholder="Search winner or item"
            className="flex-1 min-w-[12rem]"
          />
          <Segmented
            value={filter}
            onChange={changeFilter}
            options={[
              { value: "all", label: "All" },
              { value: "unpaid", label: "Unpaid" },
              { value: "paid", label: "Paid" },
            ]}
          />
        </Toolbar>

        {/* Wins */}
        <Panel title="Wins" sub={d ? `${d.total.toLocaleString()} total` : undefined}>
          {loading && !d ? (
            <p className="px-4 py-8 text-center text-[#8a7559]">Loading…</p>
          ) : !d || d.feed.length === 0 ? (
            <Empty text={q ? "No matches." : "No wins yet."} />
          ) : (
            <ul className="divide-y divide-[#f0e6d6]">
              {d.feed.map((w) => {
                // Sold items open the winner's INVOICE, never the item editor.
                const href = w.auctionId
                  ? `/invoice/${w.auctionId}?user=${encodeURIComponent(w.clerkUserId)}`
                  : undefined;
                return (
                  <li key={w.id}>
                    <Row
                      href={href}
                      leading={
                        w.photo ? (
                          <span className="w-11 h-11 rounded-xl overflow-hidden bg-[#f4ede1] grid place-items-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={w.photo} alt="" className="w-full h-full object-cover" />
                          </span>
                        ) : (
                          <Initials name={w.name} size={44} />
                        )
                      }
                      title={w.title}
                      sub={w.name}
                      trailing={
                        <>
                          <div><Money value={w.amount} /></div>
                          <div className="mt-1">
                            <Pill tone={w.state === "paid" ? "green" : w.state === "comped" ? "slate" : "red"}>
                              {w.state === "paid" ? "Paid" : w.state === "comped" ? "Comp" : "Unpaid"}
                            </Pill>
                          </div>
                        </>
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )}

          {/* Pagination: the list never grows unbounded. */}
          {d && d.total > d.page && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[#f0e6d6]">
              <Btn
                tone="slate"
                variant="outline"
                size="sm"
                onClick={() => setSkip(Math.max(0, skip - d.page))}
                disabled={skip === 0}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3L5 8l5 5" /></svg>
                Prev
              </Btn>
              <span className="text-[15px] text-[#8a7559] tabular-nums">
                {skip + 1}–{Math.min(skip + d.page, d.total)} of {d.total.toLocaleString()}
              </span>
              <Btn
                tone="slate"
                variant="outline"
                size="sm"
                onClick={() => setSkip(skip + d.page)}
                disabled={skip + d.page >= d.total}
              >
                Next
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3l5 5-5 5" /></svg>
              </Btn>
            </div>
          )}
        </Panel>
      </PageBody>
      <MessageSheet target={msgTarget} onClose={() => setMsgTarget(null)} />
    </>
  );
}
