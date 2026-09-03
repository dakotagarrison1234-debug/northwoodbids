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

function Ticket({ state }: { state: CouponState }) {
  if (state === "available") {
    return (
      <div className="nb-bb-pop relative rounded-xl p-3 text-center text-[#7a2e00] overflow-hidden shadow-[0_6px_16px_-6px_rgba(255,120,0,0.7)]" style={{ background: "linear-gradient(160deg,#ffe08a,#ffb300)" }}>
        <div className="nb-bb-shine absolute inset-0 pointer-events-none" />
        <p className="relative font-display text-2xl font-black leading-none">$5</p>
        <p className="relative text-[9px] font-black uppercase tracking-wider mt-1">Ready! 🔥</p>
      </div>
    );
  }
  if (state === "redeemed") {
    return (
      <div className="relative rounded-xl border-2 border-[#cdbda3] bg-[#efe3d0] text-[#8a7559] p-3 text-center">
        <p className="font-display text-2xl font-black leading-none line-through decoration-2">$5</p>
        <p className="text-[9px] font-black uppercase tracking-wider mt-1">Used ✓</p>
      </div>
    );
  }
  return (
    <div className="relative rounded-xl border-2 border-dashed border-[#e0b3a0] bg-white/50 text-[#c08a6a] p-3 text-center">
      <p className="font-display text-2xl font-black leading-none opacity-60">$5</p>
      <p className="text-[9px] font-black uppercase tracking-wider mt-1">🔒 Locked</p>
    </div>
  );
}

function StatusBadge({ status }: { status: Referral["status"] }) {
  const map = {
    EARNED: { label: "💰 Earned $5", cls: "bg-green-100 text-green-700 border-green-200" },
    PENDING: { label: "⏳ Almost…", cls: "bg-amber-100 text-amber-700 border-amber-200" },
    CAPPED: { label: "Counted", cls: "bg-[#efe3d0] text-[#6f5b46] border-[#cdbda3]" },
  }[status];
  return (
    <span className={`text-xs font-black uppercase tracking-wide border px-2 py-0.5 rounded-full whitespace-nowrap ${map.cls}`}>
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
    } catch { /* clipboard blocked — field is selectable */ }
  };

  const share = async () => {
    if (!data) return;
    const shareData = {
      title: "Northwood Bids",
      text: "🎁 Join me on Northwood Bids — brand-name deals for pennies, and we BOTH cash in!",
      url: data.link,
    };
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share(shareData); return; } catch { /* cancelled */ }
    }
    copy();
  };

  const maxDollars = data ? data.cap * 5 : 25;
  const earnedDollars = data ? data.earnedCount * 5 : 0;
  const availDollars = data ? data.availableCount * 5 : 0;
  const pct = Math.min(100, (earnedDollars / maxDollars) * 100);

  return (
    <main className="flex-1 safe-x px-4 sm:px-8 py-6 max-w-3xl mx-auto w-full">
      <style>{`
        @keyframes nbBBshine { 0%{transform:translateX(-130%)} 55%,100%{transform:translateX(240%)} }
        .nb-bb-shine{ background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.55) 50%,transparent 65%); animation:nbBBshine 3s ease-in-out infinite; }
        @keyframes nbBBpulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
        .nb-bb-pulse{ animation:nbBBpulse 1.25s ease-in-out infinite; }
        @keyframes nbBBfloat { 0%,100%{transform:translateY(0) rotate(-10deg)} 50%{transform:translateY(-12px) rotate(10deg)} }
        .nb-bb-float{ animation:nbBBfloat 3.4s ease-in-out infinite; }
        @keyframes nbBBpop { 0%{transform:scale(.6);opacity:0} 60%{transform:scale(1.12)} 100%{transform:scale(1);opacity:1} }
        .nb-bb-pop{ animation:nbBBpop .45s cubic-bezier(.2,1.3,.4,1) both; }
        @media (prefers-reduced-motion: reduce){ .nb-bb-shine,.nb-bb-pulse,.nb-bb-float{animation:none} }
      `}</style>

      {error && (
        <div className="mt-6 bg-white border border-[#e3d6bf] rounded-2xl p-6 text-center">
          <p className="text-[#6f5b46]">Couldn&apos;t load your Bid Bucks just now.</p>
          <button onClick={load} className="mt-3 bg-[#6c4d39] hover:bg-[#563e2c] text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">Try again</button>
        </div>
      )}

      {loading && !data && (
        <div className="mt-2 space-y-4">
          <div className="nb-skeleton h-64 rounded-3xl" />
          <div className="nb-skeleton h-40 rounded-2xl" />
        </div>
      )}

      {data && (
        <>
          {/* ── LOUD HERO ─────────────────────────────────────────────────── */}
          <div
            className="relative overflow-hidden rounded-3xl px-5 sm:px-8 pt-7 pb-6 text-center text-white shadow-[0_22px_55px_-18px_rgba(225,29,72,0.65)]"
            style={{ background: "linear-gradient(140deg,#ff2d55 0%,#ff6a00 48%,#ffc21f 100%)" }}
          >
            <div className="nb-bb-shine absolute inset-0 pointer-events-none" />
            {/* floating coins */}
            <span className="nb-bb-float absolute left-4 top-5 text-2xl select-none" style={{ animationDelay: "0s" }}>🪙</span>
            <span className="nb-bb-float absolute right-5 top-10 text-xl select-none" style={{ animationDelay: ".6s" }}>💵</span>
            <span className="nb-bb-float absolute left-8 bottom-6 text-xl select-none" style={{ animationDelay: "1.1s" }}>✨</span>
            <span className="nb-bb-float absolute right-8 bottom-8 text-2xl select-none" style={{ animationDelay: "1.6s" }}>🎁</span>

            <div className="relative">
              <span className="inline-block bg-black/25 backdrop-blur-sm text-white text-[11px] font-black uppercase tracking-[0.18em] px-3 py-1 rounded-full">
                🔥 Everyone wins · limited
              </span>
              <h1 className="font-display font-black leading-[0.92] mt-3 drop-shadow-[0_2px_0_rgba(0,0,0,0.15)]">
                <span className="block text-[2.6rem] sm:text-6xl">FREE $5</span>
                <span className="block text-xl sm:text-2xl mt-1 font-extrabold">every time a friend wins</span>
              </h1>
              <p className="mt-3 text-base sm:text-lg font-bold text-white/95">
                Stack up to <span className="bg-white text-[#e11d48] px-2 py-0.5 rounded-lg font-black">${maxDollars} OFF</span> — just share your link! 🤯
              </p>

              {/* Progress toward the max */}
              <div className="mt-5 mx-auto max-w-sm">
                <div className="flex items-end justify-between text-white/90 text-xs font-black mb-1">
                  <span>${earnedDollars} earned</span>
                  <span>${maxDollars} max</span>
                </div>
                <div className="h-4 rounded-full bg-black/25 overflow-hidden ring-2 ring-white/40">
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{ width: `${pct}%`, background: "linear-gradient(90deg,#fff6c9,#ffd23f)" }}
                  />
                </div>
              </div>

              {/* Big claim button */}
              <button
                onClick={share}
                className="nb-bb-pulse mt-6 w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-[#e11d48] font-black text-lg px-10 py-4 rounded-2xl shadow-[0_10px_25px_-8px_rgba(0,0,0,0.5)] active:scale-95 transition-transform"
              >
                📣 SHARE &amp; GRAB $5
              </button>
              <p className="mt-2 text-xs font-bold text-white/85">
                {availDollars > 0 ? `💰 You've got $${availDollars} waiting to come off your next win!` : "It's free money. Seriously."}
              </p>
            </div>
          </div>

          {/* Coupon stash */}
          <div className="mt-5 bg-white border border-[#e3d6bf] rounded-2xl p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[#241a12] font-black text-lg">🎟️ Your $5 tickets</p>
              <p className="text-sm font-bold text-[#e11d48]">
                {data.availableCount > 0 ? `${data.availableCount} READY` : data.redeemedCount >= data.cap ? "All used" : "None yet"}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-2 sm:gap-3">
              {data.coupons.map((c, i) => (<Ticket key={i} state={c} />))}
            </div>
            <p className="text-[#6f5b46] text-sm mt-3">
              {data.availableCount > 0 ? (
                <>You have <strong className="text-[#e11d48]">${availDollars}</strong> ready — a $5 ticket comes off your next winning bill automatically. No codes. 🙌</>
              ) : data.earnedCount >= data.cap ? (
                "You maxed it out — legend. Thanks for spreading the word! 👑"
              ) : (
                "Grab a $5 ticket every time a friend you invited wins & pays. Up to 5!"
              )}
            </p>
          </div>

          {/* Share link */}
          <div className="mt-4 bg-white border border-[#e3d6bf] rounded-2xl p-5">
            <p className="text-[#241a12] font-black">🔗 Your magic link</p>
            <p className="text-[#6f5b46] text-sm mt-0.5">Anyone who joins with it is tied to you — forever.</p>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                readOnly
                value={data.link}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 bg-[#efe3d0] border border-[#e3d6bf] rounded-xl px-4 py-3 text-[#241a12] text-sm focus:outline-none focus:border-[#6c4d39]/60 min-w-0"
              />
              <div className="flex gap-2">
                <button onClick={copy} className="flex-1 sm:flex-none bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] text-[#241a12] text-sm font-bold px-4 py-3 rounded-xl transition-colors whitespace-nowrap">
                  {copied ? "Copied! ✓" : "Copy"}
                </button>
                <button onClick={share} className="flex-1 sm:flex-none text-white text-sm font-black px-5 py-3 rounded-xl transition-transform active:scale-95 whitespace-nowrap" style={{ background: "linear-gradient(135deg,#ff2d55,#ff6a00)" }}>
                  Share 🚀
                </button>
              </div>
            </div>
            <p className="text-[#8a7559] text-xs mt-3">
              Your code: <span className="font-mono font-black text-[#e11d48] tracking-wider">{data.code}</span>
            </p>
          </div>

          {/* Coupons used */}
          {data.redemptions.length > 0 && (
            <div className="mt-4 bg-white border border-[#e3d6bf] rounded-2xl p-5">
              <p className="text-[#241a12] font-black">💸 Money you&apos;ve saved</p>
              <div className="mt-3 divide-y divide-[#efe3d0]">
                {data.redemptions.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-[#241a12] text-sm font-medium truncate">{r.auctionTitle}</p>
                      <p className="text-[#8a7559] text-xs">{new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
                    </div>
                    <span className="text-green-700 font-black text-sm whitespace-nowrap">−${r.amount.toFixed(0)} 🎉</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* How it works */}
          <div className="mt-4 bg-white border border-[#e3d6bf] rounded-2xl p-5">
            <p className="text-[#241a12] font-black mb-3">⚡ 4 steps to free money</p>
            <ol className="space-y-3">
              {[
                ["Blast your link", "Fire it to a friend who's not on Northwood Bids yet. Text, DM, story — anywhere."],
                ["They join & bid", "They sign up through your link and start scoring deals."],
                ["They win & pay", "The second they win an item and their card is charged — ka-ching, you get $5."],
                ["You save, automatically", "Your $5 comes off your NEXT winning bill. No codes, no hoops."],
              ].map(([title, body], i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-full text-white font-black text-sm flex items-center justify-center" style={{ background: "linear-gradient(135deg,#ff2d55,#ff6a00)" }}>{i + 1}</span>
                  <div>
                    <p className="text-[#241a12] font-bold text-sm">{title}</p>
                    <p className="text-[#6f5b46] text-sm">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Invites */}
          <div className="mt-4 bg-white border border-[#e3d6bf] rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[#241a12] font-black">👥 Your crew</p>
              {data.totalRedeemed > 0 && (<span className="text-xs font-bold text-[#6f5b46]">${data.totalRedeemed.toFixed(0)} saved so far</span>)}
            </div>
            {data.referrals.length === 0 ? (
              <p className="text-[#8a7559] text-sm mt-3">No invites yet — share your link above and start stacking! 💪</p>
            ) : (
              <div className="mt-3 divide-y divide-[#efe3d0]">
                {data.referrals.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-[#241a12] font-medium text-sm truncate">{r.name}</p>
                      <p className="text-[#8a7559] text-xs">Joined {new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
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
            <Link href="/dashboard" className="text-[#6c4d39] hover:text-[#563e2c] text-sm font-semibold underline underline-offset-2">Back to My Bids</Link>
          </div>
        </>
      )}
    </main>
  );
}
