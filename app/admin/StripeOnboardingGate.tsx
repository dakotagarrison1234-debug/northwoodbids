"use client";
import { useState } from "react";
import Link from "next/link";

interface Props {
  orgId: string;
  hasStripeAccount: boolean;
  chargesEnabled: boolean;
}

/**
 * Shown to org admins/owners who haven't completed Stripe onboarding.
 * - No stripeAccountId  → full-screen interstitial (blocks the UI)
 * - Has account but not live → dismissible banner at top
 */
export default function StripeOnboardingGate({ orgId, hasStripeAccount, chargesEnabled }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (chargesEnabled) return null;

  const handleConnect = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/stripe/onboard`, { method: "POST" });
      const d = await res.json();
      if (d.url) window.location.href = d.url;
    } catch {
      setLoading(false);
    }
  };

  // Full-screen interstitial — shown once, before they start onboarding
  if (!hasStripeAccount) {
    return (
      <div className="fixed inset-0 z-50 bg-[#faf8f4]/95 backdrop-blur-sm flex items-center justify-center p-6">
        <div className="bg-white border border-[#e5e0d5] rounded-2xl p-8 max-w-md w-full text-center space-y-5">
          {/* Stripe icon */}
          <div className="w-14 h-14 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M13.1 8.6c0-1.3 1-1.8 2.7-1.8 2.4 0 5.5.7 7.9 2V3.2C21.3 2.4 18.9 2 16.5 2c-5.4 0-9 2.9-9 7.7 0 7.5 10.3 6.3 10.3 9.5 0 1.5-1.3 2-3.1 2-2.7 0-6.1-.8-8.8-2.1v5.7c3 1.3 6 1.8 8.8 1.8 5.5 0 9.3-2.7 9.3-7.6C24 11 13.1 12.5 13.1 8.6z"
                fill="#6366f1"
              />
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-bold text-[#1a1916] mb-2">Connect Stripe to go live</h2>
            <p className="text-sm text-[#6b6659]">
              Northwood Bids uses Stripe Connect so bidders pay your business directly. You keep the
              funds — we collect a 20% platform fee automatically.
            </p>
          </div>

          <div className="text-left bg-[#f2efe8]/60 rounded-xl p-4 space-y-2 text-sm text-[#6b6659]">
            <div className="flex gap-2.5">
              <span className="text-[#09a7ad] shrink-0">✓</span>
              <span>Bidders pay you directly — you&apos;re the merchant of record</span>
            </div>
            <div className="flex gap-2.5">
              <span className="text-[#09a7ad] shrink-0">✓</span>
              <span>Funds deposited daily to your bank account</span>
            </div>
            <div className="flex gap-2.5">
              <span className="text-[#09a7ad] shrink-0">✓</span>
              <span>Takes about 5 minutes to set up</span>
            </div>
          </div>

          <button
            onClick={handleConnect}
            disabled={loading}
            className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-[#1a1916] font-semibold py-3 px-6 rounded-xl transition-colors"
          >
            {loading ? "Loading…" : "Connect Stripe — Get Started"}
          </button>

          <p className="text-xs text-[#8c8778]">
            You can also set this up later in{" "}
            <Link href="/admin/settings/payments" className="text-[#8c8778] hover:text-[#6b6659] underline">
              Settings → Payments
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // Banner — shown when they started but haven't finished
  if (dismissed) return null;

  return (
    <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 text-sm">
      <span className="text-amber-500">
        <span className="font-semibold">Stripe setup incomplete.</span>{" "}
        Finish connecting your account to publish auctions.
      </span>
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={handleConnect}
          disabled={loading}
          className="bg-yellow-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold px-4 py-1.5 rounded-lg text-xs transition-colors"
        >
          {loading ? "Loading…" : "Resume setup"}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-yellow-500/60 hover:text-amber-600 transition-colors"
          aria-label="Dismiss"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 3l10 10M13 3L3 13"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
