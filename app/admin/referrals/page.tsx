"use client";
import { useEffect, useState, useCallback } from "react";

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

const STATUS_STYLE: Record<Referral["status"], string> = {
  EARNED: "bg-green-100 text-green-700 border-green-200",
  PENDING: "bg-amber-100 text-amber-700 border-amber-200",
  CAPPED: "bg-[#efe3d0] text-[#6f5b46] border-[#cdbda3]",
  BLOCKED: "bg-red-100 text-red-700 border-red-200",
};

function nameOf(p: Person) {
  return p.name || p.email || p.phone || `${p.clerkUserId.slice(0, 10)}…`;
}
const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;

export default function AdminReferralsPage() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [balLimit, setBalLimit] = useState(50);
  const [refLimit, setRefLimit] = useState(50);

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

  const adjust = async (b: Balance) => {
    const raw = window.prompt(
      `Adjust Bid Bucks for ${nameOf(b)}.\nCurrent balance: ${money(b.balance)}\n\nEnter a dollar amount (use a minus sign to remove). Example: 5 or -5`,
      ""
    );
    if (raw == null) return;
    const amount = Number(raw.trim());
    if (!Number.isFinite(amount) || amount === 0) {
      alert("Enter a non-zero number, e.g. 5 or -5.");
      return;
    }
    const reason = window.prompt("Reason (optional, shows in the ledger):", "") ?? "";
    setBusyId(b.clerkUserId);
    try {
      const res = await fetch("/api/admin/referrals/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkUserId: b.clerkUserId, amount, reason }),
      });
      const data = await res.json();
      if (data.success) {
        load();
      } else {
        alert(data.error || "Could not adjust that balance.");
      }
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const ql = q.trim().toLowerCase();
  const filteredBalances = ql
    ? balances.filter((b) => [b.name, b.email, b.phone].filter(Boolean).join(" ").toLowerCase().includes(ql))
    : balances;
  const filteredReferrals = ql
    ? referrals.filter((r) =>
        [r.referrer.name, r.referrer.email, r.referred.name, r.referred.email, r.code]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(ql)
      )
    : referrals;

  return (
    <>
      <header className="border-b border-[#e3d6bf] px-6 sm:px-8 py-5">
        <h1 className="text-2xl sm:text-3xl font-semibold">Referrals &amp; Bid Bucks</h1>
        <p className="text-base text-[#6f5b46] mt-1">
          Track every invite, see who&apos;s earned, and manually correct any balance.
        </p>
      </header>

      <div className="flex-1 px-6 sm:px-8 py-6 overflow-auto space-y-8">
        {error && (
          <div className="bg-white border border-[#e3d6bf] rounded-xl p-6 text-center">
            <p className="text-[#6f5b46]">Couldn&apos;t load referrals.</p>
            <button onClick={load} className="mt-3 bg-[#6c4d39] hover:bg-[#563e2c] text-white text-sm font-semibold px-5 py-2.5 rounded-xl">Try again</button>
          </div>
        )}

        {loading ? (
          <p className="text-[#8a7559]">Loading…</p>
        ) : (
          <>
            <input
              type="text"
              value={q}
              onChange={(e) => { setQ(e.target.value); setBalLimit(50); setRefLimit(50); }}
              placeholder="Search by name or email…"
              className="w-full sm:max-w-sm bg-white border border-[#cdbda3] rounded-xl px-4 py-2.5 text-base text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39]"
            />

            {/* Balances */}
            <section>
              <h2 className="text-lg font-semibold mb-3">Bid Bucks balances</h2>
              {filteredBalances.length === 0 ? (
                <p className="text-[#8a7559] text-sm">{balances.length === 0 ? "No credit activity yet." : "No matches."}</p>
              ) : (
                <div className="bg-white border border-[#e3d6bf] rounded-xl overflow-x-auto">
                  <table className="w-full min-w-[560px]">
                    <thead>
                      <tr className="border-b border-[#e3d6bf] text-left text-xs font-semibold uppercase tracking-wide text-[#4a3a2b]">
                        <th className="px-4 py-3">Bidder</th>
                        <th className="px-4 py-3">Earned</th>
                        <th className="px-4 py-3">Redeemed</th>
                        <th className="px-4 py-3">Balance</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBalances.slice(0, balLimit).map((b) => (
                        <tr key={b.clerkUserId} className="border-b border-[#e3d6bf] last:border-0">
                          <td className="px-4 py-3">
                            <div className="font-medium text-[#241a12]">{nameOf(b)}</div>
                            {b.email && <div className="text-xs text-[#8a7559]">{b.email}</div>}
                          </td>
                          <td className="px-4 py-3 text-green-700 font-medium">{money(b.earned)}</td>
                          <td className="px-4 py-3 text-[#6f5b46]">{money(b.redeemed)}</td>
                          <td className="px-4 py-3 font-bold text-[#241a12]">{money(b.balance)}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => adjust(b)}
                              disabled={busyId === b.clerkUserId}
                              className="bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] text-[#241a12] text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                            >
                              {busyId === b.clerkUserId ? "Working…" : "Adjust"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredBalances.length > balLimit && (
                    <div className="px-4 py-3 border-t border-[#e3d6bf]">
                      <button onClick={() => setBalLimit((n) => n + 50)} className="text-sm font-semibold text-[#6c4d39] hover:text-[#563e2c]">
                        Show more ({filteredBalances.length - balLimit} left)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Referrals */}
            <section>
              <h2 className="text-lg font-semibold mb-3">All referrals ({referrals.length})</h2>
              {filteredReferrals.length === 0 ? (
                <p className="text-[#8a7559] text-sm">{referrals.length === 0 ? "No referrals yet." : "No matches."}</p>
              ) : (
                <div className="bg-white border border-[#e3d6bf] rounded-xl overflow-x-auto">
                  <table className="w-full min-w-[680px]">
                    <thead>
                      <tr className="border-b border-[#e3d6bf] text-left text-xs font-semibold uppercase tracking-wide text-[#4a3a2b]">
                        <th className="px-4 py-3">Inviter</th>
                        <th className="px-4 py-3">Invited bidder</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Joined</th>
                        <th className="px-4 py-3">Earned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReferrals.slice(0, refLimit).map((r) => (
                        <tr key={r.id} className="border-b border-[#e3d6bf] last:border-0">
                          <td className="px-4 py-3">
                            <div className="font-medium text-[#241a12]">{nameOf(r.referrer)}</div>
                            <div className="text-xs text-[#8a7559] font-mono">{r.code}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-[#241a12]">{nameOf(r.referred)}</div>
                            {r.referred.email && <div className="text-xs text-[#8a7559]">{r.referred.email}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-bold uppercase tracking-wide border px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLE[r.status]}`}>
                              {r.status}
                            </span>
                            {r.status === "BLOCKED" && r.blockedReason && (
                              <div className="text-xs text-red-600 mt-1">{r.blockedReason}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[#6f5b46] text-sm">
                            {new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-4 py-3 text-[#6f5b46] text-sm">
                            {r.earnedAt ? new Date(r.earnedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredReferrals.length > refLimit && (
                    <div className="px-4 py-3 border-t border-[#e3d6bf]">
                      <button onClick={() => setRefLimit((n) => n + 50)} className="text-sm font-semibold text-[#6c4d39] hover:text-[#563e2c]">
                        Show more ({filteredReferrals.length - refLimit} left)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
