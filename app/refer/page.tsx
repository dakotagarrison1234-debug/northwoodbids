"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Referral = {
  name: string;
  status: "PENDING" | "EARNED" | "CAPPED";
  createdAt: string;
  earnedAt: string | null;
};

type CouponState = "available" | "redeemed" | "locked";

type Summary = {
  code: string;
  link: string;
  balance: number;
  earnedCount: number;
  redeemedCount: number;
  availableCount: number;
  cap: number;
  pendingCount: number;
  totalRedeemed: number;
  coupons: CouponState[];
  redemptions: { amount: number; date: string; auctionTitle: string }[];
  referrals: Referral[];
};

function Coupon({ state }: { state: CouponState }) {
  if (state === "available") {
    return (
      <div className="relative rounded-xl border-2 border-[#6c4d39] bg-[#6c4d39] text-white p-3 text-center overflow-hidden">
        <p className="font-display text-2xl font-extrabold leading-none">$5</p>
        <p className="text-[10px] font-bold uppercase tracking-wider mt-1 text-[#e7dcc6]">Available</p>
      </div>
    );
  }
  if (state === "redeemed") {
    return (
      <div className="relative rounded-xl border-2 border-[#cdbda3] bg-[#efe3d0] text-[#8a7559] p-3 text-center overflow-hidden">
        <p className="font-display text-2xl font-extrabold leading-none line-through decoration-2">$5</p>
        <p className="text-[10px] font-bold uppercase tracking-wider mt-1">Redeemed</p>
      </div>
    );
  }
  return (
    <div className="relative rounded-xl border-2 border-dashed border-[#cdbda3] bg-white/40 text-[#b3a085] p-3 text-center">
      <p className="font-display text-2xl font-extrabold leading-none">$5</p>
      <p className="text-[10px] font-bold uppercase tracking-wider mt-1">Locked</p>
    </div>
  );
}

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
          {/* Coupon book */}
          <div className="mt-6 bg-white border border-[#e3d6bf] rounded-2xl p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[#241a12] font-semibold">Your $5 coupons</p>
              <p className="text-sm text-[#6f5b46]">
                {data.availableCount > 0
                  ? `${data.availableCount} available`
                  : data.redeemedCount >= data.cap
                  ? "All used"
                  : "None yet"}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-2 sm:gap-3">
              {data.coupons.map((c, i) => (
                <Coupon key={i} state={c} />
              ))}
            </div>
            <p className="text-[#6f5b46] text-sm mt-3">
              {data.availableCount > 0 ? (
                <>You have <strong className="text-[#241a12]">${(data.availableCount * 5).toFixed(0)}</strong> ready — one $5 coupon comes off each winning bill automatically.</>
              ) : data.earnedCount >= data.cap ? (
                "You've earned all 5 coupons — thanks for spreading the word!"
              ) : (
                "Earn a $5 coupon each time a friend you invited wins and pays. Up to 5."
              )}
            </p>
          </div>

          {/* Coupons used */}
          {data.redemptions.length > 0 && (
            <div className="mt-4 bg-white border border-[#e3d6bf] rounded-2xl p-5">
              <p className="text-[#241a12] font-semibold">Coupons used</p>
              <div className="mt-3 divide-y divide-[#efe3d0]">
                {data.redemptions.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-[#241a12] text-sm font-medium truncate">{r.auctionTitle}</p>
                      <p className="text-[#8a7559] text-xs">
                        {new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    <span className="text-green-700 font-semibold text-sm whitespace-nowrap">−${r.amount.toFixed(0)} off</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                ["They win & pay", "The moment they win an item and their card is charged, you get a $5 coupon."],
                ["You save automatically", "Your $5 coupon comes off your NEXT winning bill of $5 or more — not the auction it was earned in. No codes to enter."],
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
              You earn a $5 coupon only after a bidder you invited wins an item and their payment goes through — not just for signing up or bidding.
              Coupons apply to your <strong className="text-[#6f5b46]">next</strong> winning bill, not the auction they were earned in, and only one $5 coupon comes off any single bill (bills of $5 or more).
              You can earn from up to {data.cap} different friends. Invites must be new bidders; self-referrals and accounts sharing your phone number or payment card don&apos;t qualify.
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
