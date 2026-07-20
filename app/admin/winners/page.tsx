"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fmtMoney, fmtMoney0 } from "../format";
import { Pill, Panel, Empty } from "../ui";

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

const MEDALS = ["🥇", "🥈", "🥉"];

/** Horizontal bar leaderboard — rank, name, bar, value. Reads at a glance. */
function Board({
  title, sub, rows, format, color,
}: { title: string; sub: string; rows: LeaderRow[]; format: (n: number) => string; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Panel title={title} sub={sub}>
      {rows.length === 0 ? (
        <Empty text="Nothing here yet." />
      ) : (
        <ul className="px-4 py-3 space-y-2.5">
          {rows.map((r, i) => (
            <li key={r.name + i}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="min-w-0 flex items-center gap-1.5">
                  <span className="w-6 shrink-0 text-center text-sm font-bold text-slate-400">
                    {MEDALS[i] ?? i + 1}
                  </span>
                  <span className="truncate font-semibold text-slate-900">{r.name}</span>
                </span>
                <span className="shrink-0 font-extrabold tabular-nums text-slate-900">
                  {format(r.value)}
                  {r.items != null && <span className="text-sm font-normal text-slate-400"> · {r.items}</span>}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden ml-7">
                <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
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

  const load = useCallback((query: string, sk: number, f: string) => {
    setLoading(true);
    fetch(`/api/admin/winners?q=${encodeURIComponent(query)}&skip=${sk}&filter=${f}`)
      .then((r) => r.json())
      .then((j) => { if (j.stats) setD(j); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q.trim(), skip, filter), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, skip, filter, load]);

  // Any change of search or filter starts back at page 1.
  useEffect(() => { setSkip(0); }, [q, filter]);

  const stats = d?.stats;

  return (
    <>
      <header className="border-b border-slate-200 bg-white px-4 sm:px-8 py-4">
        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900">Winners &amp; Payments</h1>
      </header>

      <div className="px-4 sm:px-8 py-5 space-y-4 max-w-2xl w-full">

        {/* ── Money owed: the only thing that needs action ── */}
        {stats && stats.owedTotal > 0 && (
          <Link
            href="#owed"
            className="block rounded-2xl border-2 border-red-200 bg-red-50 p-4 active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold uppercase tracking-wide text-red-700">Not collected</div>
                <div className="text-3xl font-extrabold text-red-600 tabular-nums mt-0.5">
                  {fmtMoney(stats.owedTotal)}
                </div>
                <div className="text-sm text-red-800 mt-0.5">
                  {stats.owedPeople} {stats.owedPeople === 1 ? "person" : "people"} owe you
                </div>
              </div>
              <span className="text-red-300 text-2xl">›</span>
            </div>
          </Link>
        )}

        {/* ── Headline stats ── */}
        {stats && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-4">
              <div className="text-sm font-bold uppercase tracking-wide text-slate-500">Total won</div>
              <div className="text-2xl font-extrabold text-green-700 tabular-nums mt-0.5">{fmtMoney0(stats.totalWon)}</div>
              <div className="text-sm text-slate-500 mt-0.5">{stats.winCount} items</div>
            </div>
            <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
              <div className="text-sm font-bold uppercase tracking-wide text-slate-500">Winners</div>
              <div className="text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5">{stats.winnerCount}</div>
              <div className="text-sm text-slate-500 mt-0.5">{fmtMoney0(stats.avgWin)} average</div>
            </div>
          </div>
        )}

        {/* ── Biggest win — a bit of fun ── */}
        {stats?.biggest && (
          <div className="rounded-2xl bg-slate-900 text-white p-4 flex items-center gap-4">
            <span className="text-3xl shrink-0">🏆</span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Biggest win ever</div>
              <div className="text-2xl font-extrabold tabular-nums leading-tight">{fmtMoney0(stats.biggest.amount)}</div>
              <div className="text-sm text-slate-300 truncate">
                {stats.biggest.name} · {stats.biggest.title}
              </div>
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-2">
          {([
            { k: "money", label: "Wins & payments" },
            { k: "leaders", label: "Leaderboards" },
          ] as const).map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`flex-1 min-h-[48px] rounded-xl border-2 font-bold text-base transition-colors ${
                tab === t.k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "leaders" ? (
          <div className="space-y-4">
            <Board title="Top spenders" sub="Most money won, all time" rows={d?.leaders.spend ?? []} format={fmtMoney0} color="#16a34a" />
            <Board title="Most wins" sub="Items taken home" rows={d?.leaders.wins ?? []} format={(v) => String(v)} color="#0284c7" />
            <Board title="Most bids placed" sub="Who's most active" rows={d?.leaders.bids ?? []} format={(v) => String(v)} color="#c47b3e" />
            <Board title="Leading right now" sub="Winning live items — money in the air" rows={d?.leaders.live ?? []} format={fmtMoney0} color="#7c3aed" />
          </div>
        ) : (
          <>
            {/* ── Who owes ── */}
            {d && d.owed.length > 0 && (
              <div id="owed" className="scroll-mt-4">
                <Panel title="Who owes you" sub={`${d.owed.length} ${d.owed.length === 1 ? "person" : "people"}`}>
                  <ul className="divide-y divide-slate-100">
                    {d.owed.map((o) => (
                      <li key={o.clerkUserId} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">{o.name}</div>
                            <div className="text-sm text-slate-500">
                              {o.itemCount} item{o.itemCount !== 1 ? "s" : ""}
                            </div>
                          </div>
                          <div className="text-xl font-extrabold text-red-600 tabular-nums shrink-0">
                            {fmtMoney(o.amount)}
                          </div>
                        </div>
                        <div className="flex gap-2 mt-2.5">
                          {o.phone && (
                            <a href={`tel:${o.phone}`} className="flex-1 min-h-[44px] inline-flex items-center justify-center rounded-xl border-2 border-slate-200 bg-white font-bold text-base text-slate-700">
                              Call
                            </a>
                          )}
                          {o.email && (
                            <a href={`mailto:${o.email}`} className="flex-1 min-h-[44px] inline-flex items-center justify-center rounded-xl border-2 border-slate-200 bg-white font-bold text-base text-slate-700">
                              Email
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>
            )}

            {/* ── Search + filter ── */}
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search winner or item…"
              className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 min-h-[48px] text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400"
            />
            <div className="flex gap-2">
              {([
                { k: "all", label: "All" },
                { k: "unpaid", label: "Unpaid" },
                { k: "paid", label: "Paid" },
              ] as const).map((f) => (
                <button
                  key={f.k}
                  onClick={() => setFilter(f.k)}
                  className={`flex-1 min-h-[44px] rounded-xl border-2 font-bold text-base transition-colors ${
                    filter === f.k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* ── Wins feed ── */}
            <Panel title="Wins" sub={d ? `${d.total.toLocaleString()} total` : ""}>
              {loading && !d ? (
                <p className="px-4 py-8 text-center text-slate-500">Loading…</p>
              ) : !d || d.feed.length === 0 ? (
                <Empty text={q ? "No matches." : "No wins yet."} />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {d.feed.map((w) => {
                    // Sold items open the winner's INVOICE — never the item editor.
                    const href = w.auctionId
                      ? `/invoice/${w.auctionId}?user=${encodeURIComponent(w.clerkUserId)}`
                      : null;
                    const row = (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-slate-100 grid place-items-center">
                          {w.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={w.photo} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[10px] text-slate-400">—</span>
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900 truncate">{w.title}</div>
                          <div className="text-sm text-slate-500 truncate">{w.name}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-extrabold text-slate-900 tabular-nums">{fmtMoney0(w.amount)}</div>
                          <div className="mt-0.5">
                            <Pill tone={w.state === "paid" ? "green" : w.state === "comped" ? "slate" : "red"}>
                              {w.state === "paid" ? "Paid" : w.state === "comped" ? "Comp" : "Unpaid"}
                            </Pill>
                          </div>
                        </div>
                      </div>
                    );
                    return (
                      <li key={w.id}>
                        {href ? <Link href={href} className="block active:bg-slate-50">{row}</Link> : row}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Pagination — the list never grows unbounded. */}
              {d && d.total > d.page && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100">
                  <button
                    onClick={() => setSkip(Math.max(0, skip - d.page))}
                    disabled={skip === 0}
                    className="min-h-[44px] px-4 rounded-xl border-2 border-slate-200 bg-white font-bold text-base text-slate-700 disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <span className="text-sm text-slate-500 tabular-nums">
                    {skip + 1}–{Math.min(skip + d.page, d.total)} of {d.total.toLocaleString()}
                  </span>
                  <button
                    onClick={() => setSkip(skip + d.page)}
                    disabled={skip + d.page >= d.total}
                    className="min-h-[44px] px-4 rounded-xl border-2 border-slate-200 bg-white font-bold text-base text-slate-700 disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              )}
            </Panel>
          </>
        )}
      </div>
    </>
  );
}
