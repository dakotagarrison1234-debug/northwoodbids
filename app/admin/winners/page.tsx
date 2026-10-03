"use client";
import { useState, useEffect, useCallback } from "react";
import { fmtMoney, fmtMoney0 } from "../format";
import {
  Pill, Panel, Empty, PageHeader, PageBody, ActionCard, StatCard, Segmented, SearchBox,
  Btn, Row, Money, Initials, Notice, Progress, Eyebrow, type Tone,
} from "../ui";
import { IcoTrophy } from "@/app/components/BidIcons";
import MessageSheet, { type MessageTarget } from "../MessageSheet";

interface LeaderRow { name: string; value: number; items?: number }
interface OwedRow { clerkUserId: string; name: string; phone: string; email: string; itemCount: number; amount: number }
interface FeedRow {
  id: string; itemId: string; title: string; photo: string | null;
  auctionId: string | null; auctionTitle: string | null;
  amount: number; wonAt: string; clerkUserId: string; name: string;
  state: "paid" | "unpaid" | "comped";
}
interface Data {
  stats: {
    totalWon: number; winCount: number; winnerCount: number; avgWin: number;
    owedTotal: number; owedPeople: number;
    biggest: { amount: number; title: string; name: string } | null;
  };
  leaders: { spend: LeaderRow[]; wins: LeaderRow[]; bids: LeaderRow[]; live: LeaderRow[] };
  owed: OwedRow[];
  feed: FeedRow[];
  total: number; skip: number; page: number;
}

/** Top-three ranks get a coloured badge; everyone else is quiet. */
const RANK_TONE: Tone[] = ["amber", "slate", "leather"];

/** Horizontal bar leaderboard — rank, avatar, name, bar, value. Reads at a glance. */
function Board({
  title, sub, rows, format, tone: t,
}: { title: string; sub: string; rows: LeaderRow[]; format: (n: number) => string; tone: Tone }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Panel title={title} sub={sub}>
      {rows.length === 0 ? (
        <Empty text="Nothing here yet." sub="Leaders show up once people win and bid." />
      ) : (
        <ul className="px-4 py-3 space-y-3">
          {rows.map((r, i) => (
            <li key={r.name + i} className="flex items-center gap-3">
              <span className="w-6 shrink-0 text-center text-sm font-black tabular-nums text-[#a3927b]">{i + 1}</span>
              <Initials name={r.name} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="truncate font-bold text-[#241a12]">{r.name}</span>
                  <span className="shrink-0 font-extrabold tabular-nums text-[#241a12]">
                    {format(r.value)}
                    {r.items != null && <span className="text-sm font-normal text-[#8a7559]"> · {r.items}</span>}
                  </span>
                </div>
                <Progress value={r.value / max} tone={i < 3 ? RANK_TONE[i] : t} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function WinnersPage() {
  const [d, setD] = useState<Data | null>(null);
  const [q, setQ] = useState("");
  const [skip, setSkip] = useState(0);
  const [filter, setFilter] = useState<"all" | "unpaid" | "paid">("all");
  const [tab, setTab] = useState<"money" | "leaders">("money");
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
  // money shows in the Sales + Cash reports.
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
        setCashMsg({ key: clerkUserId, text: "Marked paid in cash", ok: true });
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
  useEffect(() => { setSkip(0); }, [q, filter]);

  const stats = d?.stats;
  const paidShare = stats && stats.totalWon > 0 ? Math.max(0, 1 - stats.owedTotal / stats.totalWon) : 1;

  return (
    <>
      <PageHeader
        title="Winners & payments"
        sub={stats && stats.owedTotal > 0 ? `${fmtMoney(stats.owedTotal)} still to collect.` : "Everyone's paid up."}
      />

      <PageBody>
        {/* ── Money owed: the only thing that needs action ── */}
        {stats && stats.owedTotal > 0 && (
          <ActionCard
            href="#owed"
            tone="red"
            count={fmtMoney(stats.owedTotal)}
            label="Not collected"
            sub={`${stats.owedPeople} ${stats.owedPeople === 1 ? "person owes" : "people owe"} you — card declined or pending`}
          />
        )}

        {/* ── Headline stats ── */}
        {stats && (
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total won" value={fmtMoney0(stats.totalWon)} sub={`${stats.winCount} items`} tone="green" />
            <StatCard label="Winners" value={stats.winnerCount} sub={`${fmtMoney0(stats.avgWin)} average`} />
          </div>
        )}

        {/* Paid vs owed ratio */}
        {stats && stats.totalWon > 0 && (
          <div className="rounded-2xl bg-white border border-[#e6dac6] p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <Eyebrow>Collected</Eyebrow>
              <span className="text-sm font-bold tabular-nums text-[#241a12]">{Math.round(paidShare * 100)}%</span>
            </div>
            <Progress value={paidShare} tone={stats.owedTotal > 0 ? "amber" : "green"} />
          </div>
        )}

        {/* ── Biggest win — a bit of fun ── */}
        {stats?.biggest && (
          <div className="rounded-2xl bg-[#241a12] text-[#fbf4e6] p-4 flex items-center gap-4">
            <span className="w-12 h-12 rounded-2xl bg-[#f0a35a]/15 text-[#f0a35a] grid place-items-center shrink-0">
              <IcoTrophy className="w-6 h-6" />
            </span>
            <div className="min-w-0 flex-1">
              <Eyebrow className="!text-[#b9a688]">Biggest win ever</Eyebrow>
              <div className="font-display text-2xl font-black tabular-nums leading-tight mt-0.5">{fmtMoney0(stats.biggest.amount)}</div>
              <div className="text-sm text-[#d9c7ab] truncate">{stats.biggest.name} · {stats.biggest.title}</div>
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "money", label: "Wins & payments" },
            { value: "leaders", label: "Leaderboards" },
          ]}
        />

        {tab === "leaders" ? (
          <div className="space-y-4">
            <Board title="Top spenders" sub="Most money won, all time" rows={d?.leaders.spend ?? []} format={fmtMoney0} tone="green" />
            <Board title="Most wins" sub="Items taken home" rows={d?.leaders.wins ?? []} format={(v) => String(v)} tone="blue" />
            <Board title="Most bids placed" sub="Who's most active" rows={d?.leaders.bids ?? []} format={(v) => String(v)} tone="amber" />
            <Board title="Leading right now" sub="Winning live items — money in the air" rows={d?.leaders.live ?? []} format={fmtMoney0} tone="leather" />
          </div>
        ) : (
          <>
            {/* ── Who owes ── */}
            {d && d.owed.length > 0 && (
              <div id="owed" className="scroll-mt-4">
                <Panel tone="red" title="Who owes you" sub={`${d.owed.length} ${d.owed.length === 1 ? "person" : "people"}`}>
                  <ul className="divide-y divide-[#f0e6d6]">
                    {d.owed.map((o) => (
                      <li key={o.clerkUserId} className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <Initials name={o.name} />
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-[#241a12] truncate">{o.name}</div>
                            <div className="text-sm text-[#8a7559]">
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
                        {/* Cash / in-person — two-tap confirm (it's money). */}
                        {cashKey === o.clerkUserId ? (
                          <div className="flex gap-2 mt-2">
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
                            className="mt-2"
                            onClick={() => { setCashKey(o.clerkUserId); setCashMsg(null); }}
                          >
                            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="16" height="10" rx="2" /><circle cx="10" cy="10" r="2.2" /></svg>
                            Mark paid — cash
                          </Btn>
                        )}
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
              </div>
            )}

            {/* ── Search + filter ── */}
            <SearchBox
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search winner or item…"
            />
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "unpaid", label: "Unpaid" },
                { value: "paid", label: "Paid" },
              ]}
            />

            {/* ── Wins feed ── */}
            <Panel title="Wins" sub={d ? `${d.total.toLocaleString()} total` : ""}>
              {loading && !d ? (
                <p className="px-4 py-8 text-center text-[#8a7559]">Loading…</p>
              ) : !d || d.feed.length === 0 ? (
                <Empty
                  text={q ? "No matches." : "No wins yet."}
                  sub={q ? "Try a different name or item." : "Wins land here as auctions close."}
                />
              ) : (
                <ul className="divide-y divide-[#f0e6d6]">
                  {d.feed.map((w) => {
                    // Sold items open the winner's INVOICE — never the item editor.
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

              {/* Pagination — the list never grows unbounded. */}
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
                  <span className="text-sm text-[#8a7559] tabular-nums">
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
          </>
        )}
      </PageBody>
      <MessageSheet target={msgTarget} onClose={() => setMsgTarget(null)} />
    </>
  );
}
