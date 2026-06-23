"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Referral = {
  name: string;
  status: "PENDING" | "EARNED" | "CAPPED";
  createdAt: string;
  earnedAt: string | null;
};

type Summary = {
  code: string;
  link: string;
  balance: number;
  earnedCount: number;
  cap: number;
  pendingCount: number;
  totalRedeemed: number;
  referrals: Referral[];
};

function StatusBadge({ status }: { status: Referral["status"] }) {
  const map = {
    EARNED: { label: "Earned $5", cls: "bg-green-100 text-green-700 border-green-200" },
    PENDING: { label: "Waiting on first win", cls: "bg-amber-100 text-amber-700 border-amber-200" },
    CAPPED: { label: "Counted (cap reached)", cls: "bg-[#efe3d0] text-[#6f5b46] border-[#cdbda3]" },
  }[status];
  return (
    <span className={`text-xs font-bold uppercase tracking-wide border px-2 py-0.5 rounded-full whitespace-nowrap ${map.cls}`}>
      {map.label}
    </span>
  );
}

export default function ReferPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch("/api/referral/summary")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Summary) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  };

  const share = async () => {
    if (!data) return;
    const shareData = {
      title: "Northwood Bids",
      text: "Join me on Northwood Bids and start bidding on local deals.",
      url: data.link,
    };
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share(shareData); return; } catch { /* user cancelled */ }
    }
    copy();
  };

  return (
    <main className="flex-1 safe-x px-6 sm:px-8 py-8 max-w-3xl mx-auto w-full">
      {/* Heading */}
      <div className="flex items-center gap-3 mb-1.5">
        <div className="w-10 h-10 rounded-xl bg-[#6c4d39] text-white flex items-center justify-center shrink-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#241a12] leading-none">Bid Bucks</h1>
          <p className="text-sm text-[#6f5b46] mt-1">Invite friends. Earn $5 off your bill when they win.</p>
        </div>
      </div>

      {error && (
        <div className="mt-6 bg-white border border-[#e3d6bf] rounded-2xl p-6 text-center">
          <p className="text-[#6f5b46]">Couldn&apos;t load your Bid Bucks just now.</p>
          <button onClick={load} className="mt-3 bg-[#6c4d39] hover:bg-[#563e2c] text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
            Try again
          </button>
        </div>
      )}

      {loading && !data && (
        <div className="mt-6 space-y-4">
          <div className="nb-skeleton h-28 rounded-2xl" />
          <div className="nb-skeleton h-40 rounded-2xl" />
        </div>
      )}

      {data && (
        <>
          {/* Balance + progress */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-[#6c4d39] text-white rounded-2xl p-5 relative overflow-hidden">
              <p className="text-[#e7dcc6] text-xs font-bold uppercase tracking-wider">Your balance</p>
              <p className="font-display text-4xl font-extrabold mt-1">${data.balance.toFixed(0)}</p>
              <p className="text-[#e7dcc6] text-sm mt-1">
                {data.balance >= 5
                  ? "$5 comes off your next bill automatically"
                  : "Earn $5 when a friend wins their first item"}
              </p>
            </div>
            <div className="bg-white border border-[#e3d6bf] rounded-2xl p-5">
              <p className="text-[#8a7559] text-xs font-bold uppercase tracking-wider">Rewards earned</p>
              <p className="font-display text-4xl font-extrabold text-[#241a12] mt-1">
                {data.earnedCount}<span className="text-[#b3a085] text-2xl"> / {data.cap}</span>
              </p>
              <div className="mt-3 h-2 rounded-full bg-[#efe3d0] overflow-hidden">
                <div className="h-full bg-[#6c4d39] rounded-full transition-all" style={{ width: `${(data.earnedCount / data.cap) * 100}%` }} />
              </div>
              <p className="text-[#6f5b46] text-sm mt-2">
                {data.earnedCount >= data.cap
                  ? "You've maxed out referral rewards — thank you!"
                  : `${data.cap - data.earnedCount} more friend${data.cap - data.earnedCount !== 1 ? "s" : ""} can earn you $5 each`}
              </p>
            </div>
          </div>

          {/* Share */}
          <div className="mt-4 bg-white border border-[#e3d6bf] rounded-2xl p-5">
            <p className="text-[#241a12] font-semibold">Share your invite link</p>
            <p className="text-[#6f5b46] text-sm mt-0.5">Anyone who signs up with your link is tied to you.</p>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                readOnly
                value={data.link}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 bg-[#efe3d0] border border-[#e3d6bf] rounded-xl px-4 py-3 text-[#241a12] text-sm focus:outline-none focus:border-[#6c4d39]/60 min-w-0"
              />
              <div className="flex gap-2">
                <button onClick={copy} className="flex-1 sm:flex-none bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] text-[#241a12] text-sm font-semibold px-4 py-3 rounded-xl transition-colors whitespace-nowrap">
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button onClick={share} className="flex-1 sm:flex-none bg-[#6c4d39] hover:bg-[#563e2c] text-white text-sm font-semibold px-5 py-3 rounded-xl transition-colors whitespace-nowrap">
                  Share
                </button>
              </div>
            </div>
            <p className="text-[#8a7559] text-xs mt-3">
              Your code: <span className="font-mono font-bold text-[#6c4d39] tracking-wider">{data.code}</span>
            </p>
          </div>

          {/* How it works */}
          <div className="mt-4 bg-white border border-[#e3d6bf] rounded-2xl p-5">
            <p className="text-[#241a12] font-semibold mb-3">How it works</p>
            <ol className="space-y-3">
              {[
                ["Share your link", "Send your invite link to a friend who hasn't joined Northwood Bids yet."],
                ["They sign up & bid", "They create an account through your link and start bidding."],
                ["They win & pay", "The moment they win an item and their card is charged, you get $5 in Bid Bucks."],
                ["You save automatically", "$5 comes off your next bill of $5 or more — no codes to enter."],
              ].map(([title, body], i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-[#efe3d0] text-[#6c4d39] font-bold text-sm flex items-center justify-center">{i + 1}</span>
                  <div>
                    <p className="text-[#241a12] font-semibold text-sm">{title}</p>
                    <p className="text-[#6f5b46] text-sm">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Tracking */}
          <div className="mt-4 bg-white border border-[#e3d6bf] rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[#241a12] font-semibold">Your invites</p>
              {data.totalRedeemed > 0 && (
                <span className="text-xs text-[#6f5b46]">${data.totalRedeemed.toFixed(0)} used so far</span>
              )}
            </div>

            {data.referrals.length === 0 ? (
              <p className="text-[#8a7559] text-sm mt-3">No invites yet. Share your link above to get started.</p>
            ) : (
              <div className="mt-3 divide-y divide-[#efe3d0]">
                {data.referrals.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-[#241a12] font-medium text-sm truncate">{r.name}</p>
                      <p className="text-[#8a7559] text-xs">
                        Joined {new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fine print */}
          <div className="mt-4 text-[#8a7559] text-xs leading-relaxed">
            <p className="font-semibold text-[#6f5b46] mb-1">The fine print</p>
            <p>
              You earn $5 only after a bidder you invited wins an item and their payment goes through — not just for signing up or bidding.
              One $5 credit applies per bill, and only to bills of $5 or more. You can earn from up to {data.cap} different friends.
              Invites must be new bidders; self-referrals and accounts sharing your phone number or payment card don&apos;t qualify.
              Bid Bucks have no cash value and can&apos;t be withdrawn.
            </p>
          </div>

          <div className="mt-6 text-center">
            <Link href="/dashboard" className="text-[#6c4d39] hover:text-[#563e2c] text-sm font-semibold underline underline-offset-2">
              Back to My Bids
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
