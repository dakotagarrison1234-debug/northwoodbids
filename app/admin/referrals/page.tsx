"use client";
import { useEffect, useState, useCallback } from "react";
import { Pill, Panel, Btn, Empty, StatCard, fmtMoney, type Tone } from "../ui";

type Person = { clerkUserId: string; name: string | null; email: string | null; phone: string | null };
type Referral = {
  id: string;
  status: "PENDING" | "EARNED" | "CAPPED" | "BLOCKED";
  blockedReason: string | null;
  code: string;
  createdAt: string;
  earnedAt: string | null;
  referrer: Person;
  referred: Person;
};
type Balance = Person & { balance: number; earned: number; redeemed: number };

// Plain words, not raw enum names — "CAPPED" means nothing to a human.
const STATUS: Record<Referral["status"], { label: string; tone: Tone }> = {
  EARNED: { label: "Earned", tone: "green" },
  PENDING: { label: "Waiting", tone: "amber" },
  CAPPED: { label: "At limit", tone: "slate" },
  BLOCKED: { label: "Blocked", tone: "red" },
};

function nameOf(p: Person) {
  return p.name || p.email || p.phone || `${p.clerkUserId.slice(0, 10)}…`;
}
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });

export default function AdminReferralsPage() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [balLimit, setBalLimit] = useState(25);
  const [refLimit, setRefLimit] = useState(25);
  const [showLog, setShowLog] = useState(false);
  // In-app adjust dialog. window.prompt() is blocked in the installed PWA, which
  // meant the only money-adjustment control on this screen did nothing at all.
  const [adjusting, setAdjusting] = useState<Balance | null>(null);
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjError, setAdjError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch("/api/admin/referrals")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setReferrals(d.referrals ?? []);
        setBalances(d.balances ?? []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitAdjust = async () => {
    if (!adjusting) return;
    const amount = Number(adjAmount.trim());
    if (!Number.isFinite(amount) || amount === 0) {
      setAdjError("Enter a non-zero number, like 5 or -5.");
      return;
    }
    setAdjError(null);
    setBusyId(adjusting.clerkUserId);
    try {
      const res = await fetch("/api/admin/referrals/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkUserId: adjusting.clerkUserId, amount, reason: adjReason }),
      });
      const data = await res.json();
      if (data.success) {
        setAdjusting(null);
        setAdjAmount("");
        setAdjReason("");
        load();
      } else {
        setAdjError(data.error || "Could not adjust that balance.");
      }
    } catch {
      setAdjError("Something went wrong. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const ql = q.trim().toLowerCase();
  const match = (parts: (string | null)[]) => parts.filter(Boolean).join(" ").toLowerCase().includes(ql);
  const filteredBalances = ql ? balances.filter((b) => match([b.name, b.email, b.phone])) : balances;
  const filteredReferrals = ql
    ? referrals.filter((r) => match([r.referrer.name, r.referrer.email, r.referred.name, r.referred.email, r.code]))
    : referrals;

  // The aggregates an admin actually needs — outstanding Bid Bucks is real money
  // owed, and it was never shown anywhere before.
  const outstanding = balances.reduce((s, b) => s + Math.max(0, b.balance), 0);
  const owing = balances.filter((b) => b.balance < 0);
  const pendingCount = referrals.filter((r) => r.status === "PENDING").length;
  const blockedCount = referrals.filter((r) => r.status === "BLOCKED").length;

  // Biggest balances first — that's who matters when you're checking liability.
  const sortedBalances = [...filteredBalances].sort((a, b) => b.balance - a.balance);

  return (
    <>
      <header className="border-b border-slate-200 bg-white px-4 sm:px-8 py-4">
        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900">Bid Bucks</h1>
        <p className="text-base text-slate-500 mt-0.5">Who&apos;s earned credit, and what you owe.</p>
      </header>

      <div className="flex-1 px-4 sm:px-8 py-5 overflow-auto space-y-4 max-w-2xl w-full">
        {error && (
          <Panel>
            <Empty text="Couldn't load referrals." action={<Btn tone="slate" onClick={load}>Try again</Btn>} />
          </Panel>
        )}

        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : (
          <>
            {/* Headline: what this screen is actually for. */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Credit outstanding"
                value={fmtMoney(outstanding)}
                sub="Bid Bucks people can still spend"
                tone={outstanding > 0 ? "amber" : "green"}
              />
              <StatCard
                label="Waiting to earn"
                value={pendingCount}
                sub={blockedCount > 0 ? `${blockedCount} blocked` : "No blocked referrals"}
                tone={blockedCount > 0 ? "red" : "slate"}
              />
            </div>

            {owing.length > 0 && (
              <Panel title="Negative balances" sub="These need correcting">
                <ul className="divide-y divide-slate-100">
                  {owing.map((b) => (
                    <li key={b.clerkUserId} className="px-4 py-3 flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-semibold text-slate-900">{nameOf(b)}</span>
                      <span className="shrink-0 font-extrabold text-red-600 tabular-nums">
                        −{fmtMoney(b.balance)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            <input
              type="text"
              value={q}
              onChange={(e) => { setQ(e.target.value); setBalLimit(25); setRefLimit(25); }}
              placeholder="Search name, email or code…"
              className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 min-h-[48px] text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400"
            />

            {/* Balances as cards — the old table was 560px wide on a 375px screen,
                which pushed the Adjust button completely off the side. */}
            <Panel title="Balances" sub={`${filteredBalances.length} ${filteredBalances.length === 1 ? "person" : "people"}`}>
              {sortedBalances.length === 0 ? (
                <Empty text="No balances yet." />
              ) : (
                <>
                  <ul className="divide-y divide-slate-100">
                    {sortedBalances.slice(0, balLimit).map((b) => (
                      <li key={b.clerkUserId} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-900 truncate">{nameOf(b)}</div>
                            <div className="text-sm text-slate-500 truncate">
                              earned {fmtMoney(b.earned)} · used {fmtMoney(b.redeemed)}
                            </div>
                          </div>
                          <div className={`shrink-0 text-xl font-extrabold tabular-nums ${
                            b.balance < 0 ? "text-red-600" : b.balance > 0 ? "text-green-700" : "text-slate-400"
                          }`}>
                            {b.balance < 0 ? "−" : ""}{fmtMoney(b.balance)}
                          </div>
                        </div>
                        <Btn
                          tone="slate"
                          variant="outline"
                          full
                          className="mt-2.5"
                          disabled={busyId === b.clerkUserId}
                          onClick={() => { setAdjusting(b); setAdjAmount(""); setAdjReason(""); setAdjError(null); }}
                        >
                          {busyId === b.clerkUserId ? "Working…" : "Adjust balance"}
                        </Btn>
                      </li>
                    ))}
                  </ul>
                  {sortedBalances.length > balLimit && (
                    <button
                      onClick={() => setBalLimit((n) => n + 25)}
                      className="w-full min-h-[48px] text-base font-bold text-slate-600 border-t border-slate-100"
                    >
                      Show more ({sortedBalances.length - balLimit} left)
                    </button>
                  )}
                </>
              )}
            </Panel>

            {/* The full audit log is a lookup tool, not the main event — collapsed. */}
            <Panel>
              <button
                onClick={() => setShowLog((v) => !v)}
                className="w-full px-4 min-h-[52px] flex items-center justify-between gap-3"
              >
                <span className="text-lg font-bold text-slate-900">
                  Referral history <span className="text-slate-400 font-normal">({filteredReferrals.length})</span>
                </span>
                <span className={`text-slate-400 transition-transform ${showLog ? "rotate-180" : ""}`}>
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
                </span>
              </button>
              {showLog && (
                filteredReferrals.length === 0 ? (
                  <Empty text="No referrals yet." />
                ) : (
                  <>
                    <ul className="divide-y divide-slate-100 border-t border-slate-100">
                      {filteredReferrals.slice(0, refLimit).map((r) => (
                        <li key={r.id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 truncate">{nameOf(r.referrer)}</div>
                              <div className="text-sm text-slate-500 truncate">invited {nameOf(r.referred)}</div>
                              <div className="text-xs text-slate-400 mt-0.5">
                                {fmtDate(r.createdAt)}
                                {r.earnedAt ? ` · earned ${fmtDate(r.earnedAt)}` : ""}
                              </div>
                            </div>
                            <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>
                          </div>
                          {r.blockedReason && (
                            <p className="text-sm text-red-600 mt-1.5">{r.blockedReason}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                    {filteredReferrals.length > refLimit && (
                      <button
                        onClick={() => setRefLimit((n) => n + 25)}
                        className="w-full min-h-[48px] text-base font-bold text-slate-600 border-t border-slate-100"
                      >
                        Show more ({filteredReferrals.length - refLimit} left)
                      </button>
                    )}
                  </>
                )
              )}
            </Panel>
          </>
        )}
      </div>

      {/* Adjust dialog — replaces two stacked window.prompt() calls that silently
          did nothing in the installed app. Shows the resulting balance before you commit. */}
      {adjusting && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => setAdjusting(null)}>
          <div
            className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-5 pb-8 sm:pb-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-slate-900">Adjust Bid Bucks</h3>
            <p className="text-base text-slate-500 mt-0.5 truncate">{nameOf(adjusting)}</p>

            <div className="mt-4 flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
              <span className="text-base text-slate-600">Balance now</span>
              <span className={`text-xl font-extrabold tabular-nums ${adjusting.balance < 0 ? "text-red-600" : "text-slate-900"}`}>
                {adjusting.balance < 0 ? "−" : ""}{fmtMoney(adjusting.balance)}
              </span>
            </div>

            <label className="block mt-4">
              <span className="block text-sm font-bold text-slate-600 mb-1.5">Add or remove</span>
              <input
                type="number"
                inputMode="decimal"
                autoFocus
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
                placeholder="5 to add, -5 to remove"
                className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 min-h-[48px] text-base focus:outline-none focus:border-slate-400"
              />
            </label>

            <div className="flex gap-2 mt-2">
              {[5, 10, -5].map((n) => (
                <button
                  key={n}
                  onClick={() => setAdjAmount(String(n))}
                  className={`flex-1 min-h-[44px] rounded-xl border-2 font-bold text-base ${
                    n < 0 ? "border-red-200 text-red-700 bg-red-50" : "border-green-200 text-green-700 bg-green-50"
                  }`}
                >
                  {n > 0 ? `+$${n}` : `−$${Math.abs(n)}`}
                </button>
              ))}
            </div>

            <label className="block mt-3">
              <span className="block text-sm font-bold text-slate-600 mb-1.5">Reason (optional)</span>
              <input
                type="text"
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                placeholder="Shows in the ledger"
                className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 min-h-[48px] text-base focus:outline-none focus:border-slate-400"
              />
            </label>

            {/* Show the outcome before committing — this is real money. */}
            {Number.isFinite(Number(adjAmount)) && Number(adjAmount) !== 0 && (
              <div className="mt-3 flex items-center justify-between bg-slate-900 text-white rounded-xl px-4 py-3">
                <span className="text-base">New balance</span>
                <span className="text-xl font-extrabold tabular-nums">
                  {adjusting.balance + Number(adjAmount) < 0 ? "−" : ""}
                  {fmtMoney(adjusting.balance + Number(adjAmount))}
                </span>
              </div>
            )}

            {adjError && <p className="text-base text-red-600 mt-3">{adjError}</p>}

            <div className="flex gap-3 mt-5">
              <Btn tone="slate" variant="outline" full onClick={() => setAdjusting(null)}>Cancel</Btn>
              <Btn tone="green" full onClick={submitAdjust} disabled={busyId === adjusting.clerkUserId}>
                {busyId === adjusting.clerkUserId ? "Saving…" : "Save"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
