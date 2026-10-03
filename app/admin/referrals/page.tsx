"use client";
import { useEffect, useState, useCallback } from "react";
import { Pill, Panel, Btn, Empty, StatCard, PageHeader, PageBody, SearchBox, Row, Initials, Input, Money, Eyebrow, type Tone } from "../ui";
import { fmtMoney } from "../format";

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
      <PageHeader title="Referrals" sub="Bid Bucks — who's earned credit, and what you owe." />

      <PageBody>
        {error && (
          <Panel tone="red">
            <Empty text="Couldn't load referrals." sub="Check your connection and try again." action={<Btn tone="slate" variant="outline" onClick={load}>Try again</Btn>} />
          </Panel>
        )}

        {loading ? (
          <p className="text-[#8a7559] py-8 text-center">Loading…</p>
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
              <Panel title="Negative balances" sub="These need correcting" tone="red">
                <ul className="divide-y divide-[#f0e6d6]">
                  {owing.map((b) => (
                    <li key={b.clerkUserId}>
                      <Row
                        leading={<Initials name={nameOf(b)} size={36} />}
                        title={nameOf(b)}
                        trailing={<span className="text-lg"><Money value={b.balance} /></span>}
                      />
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            <SearchBox
              type="text"
              value={q}
              onChange={(e) => { setQ(e.target.value); setBalLimit(25); setRefLimit(25); }}
              placeholder="Search name, email or code…"
            />

            {/* Balances as rows — the old table was 560px wide on a 375px screen,
                which pushed the Adjust button completely off the side. */}
            <Panel title="Balances" sub={`${filteredBalances.length} ${filteredBalances.length === 1 ? "person" : "people"}`}>
              {sortedBalances.length === 0 ? (
                <Empty text="No balances yet." sub={ql ? "Nobody matches that search." : "Balances appear once someone earns or spends Bid Bucks."} />
              ) : (
                <>
                  <ul className="divide-y divide-[#f0e6d6]">
                    {sortedBalances.slice(0, balLimit).map((b) => (
                      <li key={b.clerkUserId}>
                        <Row
                          leading={<Initials name={nameOf(b)} />}
                          title={nameOf(b)}
                          sub={`earned ${fmtMoney(b.earned)} · used ${fmtMoney(b.redeemed)}`}
                          trailing={
                            <div className="flex flex-col items-end gap-1">
                              <span className={`text-xl font-extrabold tabular-nums ${
                                b.balance < 0 ? "text-[#a1321f]" : b.balance > 0 ? "text-[#2f5d3a]" : "text-[#a3927b]"
                              }`}>
                                {b.balance < 0 ? "−" : ""}{fmtMoney(b.balance)}
                              </span>
                              <Btn
                                tone="slate"
                                variant="ghost"
                                size="sm"
                                className="-mr-2"
                                disabled={busyId === b.clerkUserId}
                                onClick={() => { setAdjusting(b); setAdjAmount(""); setAdjReason(""); setAdjError(null); }}
                              >
                                {busyId === b.clerkUserId ? "Working…" : "Adjust"}
                              </Btn>
                            </div>
                          }
                        />
                      </li>
                    ))}
                  </ul>
                  {sortedBalances.length > balLimit && (
                    <div className="border-t border-[#f0e6d6]">
                      <Btn tone="slate" variant="ghost" full className="rounded-none" onClick={() => setBalLimit((n) => n + 25)}>
                        Show more ({sortedBalances.length - balLimit} left)
                      </Btn>
                    </div>
                  )}
                </>
              )}
            </Panel>

            {/* The full audit log is a lookup tool, not the main event — collapsed. */}
            <Panel>
              <button
                type="button"
                onClick={() => setShowLog((v) => !v)}
                className="w-full px-4 sm:px-5 min-h-[56px] flex items-center justify-between gap-3 hover:bg-[#faf5ea] transition-colors"
              >
                <span className="font-display text-lg font-black text-[#241a12]">
                  Referral history <span className="text-[#a3927b] font-semibold text-base">({filteredReferrals.length})</span>
                </span>
                <span className={`text-[#a3927b] transition-transform ${showLog ? "rotate-180" : ""}`}>
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
                </span>
              </button>
              {showLog && (
                filteredReferrals.length === 0 ? (
                  <Empty text="No referrals yet." sub="Every invite someone sends shows up here." />
                ) : (
                  <>
                    <ul className="divide-y divide-[#f0e6d6] border-t border-[#f0e6d6]">
                      {filteredReferrals.slice(0, refLimit).map((r) => (
                        <li key={r.id}>
                          <Row
                            leading={<Initials name={nameOf(r.referrer)} size={36} />}
                            title={nameOf(r.referrer)}
                            sub={`invited ${nameOf(r.referred)} · ${fmtDate(r.createdAt)}${r.earnedAt ? ` · earned ${fmtDate(r.earnedAt)}` : ""}`}
                            trailing={<Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>}
                          />
                          {r.blockedReason && (
                            <p className="px-4 pb-3 -mt-1 text-sm text-[#a1321f]">{r.blockedReason}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                    {filteredReferrals.length > refLimit && (
                      <div className="border-t border-[#f0e6d6]">
                        <Btn tone="slate" variant="ghost" full className="rounded-none" onClick={() => setRefLimit((n) => n + 25)}>
                          Show more ({filteredReferrals.length - refLimit} left)
                        </Btn>
                      </div>
                    )}
                  </>
                )
              )}
            </Panel>
          </>
        )}
      </PageBody>

      {/* Adjust dialog — replaces two stacked window.prompt() calls that silently
          did nothing in the installed app. Shows the resulting balance before you commit. */}
      {adjusting && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => setAdjusting(null)}>
          <div
            className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl border border-[#e6dac6] p-5 pb-8 sm:pb-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl font-black text-[#241a12]">Adjust Bid Bucks</h3>
            <p className="text-base text-[#8a7559] mt-0.5 truncate">{nameOf(adjusting)}</p>

            <div className="mt-4 flex items-center justify-between bg-[#f4ede1] border border-[#e6dac6] rounded-xl px-4 py-3">
              <span className="text-base text-[#6f5b46]">Balance now</span>
              <span className="text-xl"><Money value={adjusting.balance} /></span>
            </div>

            <label className="block mt-4">
              <Eyebrow className="mb-1.5">Add or remove</Eyebrow>
              <Input
                type="number"
                inputMode="decimal"
                autoFocus
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
                placeholder="5 to add, -5 to remove"
              />
            </label>

            <div className="flex gap-2 mt-2">
              {[5, 10, -5].map((n) => (
                <Btn
                  key={n}
                  type="button"
                  tone={n < 0 ? "red" : "green"}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setAdjAmount(String(n))}
                >
                  {n > 0 ? `+$${n}` : `−$${Math.abs(n)}`}
                </Btn>
              ))}
            </div>

            <label className="block mt-3">
              <Eyebrow className="mb-1.5">Reason (optional)</Eyebrow>
              <Input
                type="text"
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                placeholder="Shows in the ledger"
              />
            </label>

            {/* Show the outcome before committing — this is real money. */}
            {Number.isFinite(Number(adjAmount)) && Number(adjAmount) !== 0 && (
              <div className="mt-3 flex items-center justify-between bg-[#241a12] text-[#fbf4e6] rounded-xl px-4 py-3">
                <span className="text-base">New balance</span>
                <span className="font-display text-xl font-black tabular-nums">
                  {adjusting.balance + Number(adjAmount) < 0 ? "−" : ""}
                  {fmtMoney(adjusting.balance + Number(adjAmount))}
                </span>
              </div>
            )}

            {adjError && <p className="text-base font-semibold text-[#a1321f] mt-3">{adjError}</p>}

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
