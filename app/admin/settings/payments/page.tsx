"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface OrgStripeStatus {
  id: string;
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  platformFeePercent: number;
  taxPercent: number;
  taxExempt: boolean;
}

function StatusDot({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full mr-2 ${
        enabled ? "bg-[#a4592a]" : "bg-[#cdbda3]"
      }`}
    />
  );
}

function PaymentsContent() {
  const [org, setOrg] = useState<OrgStripeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const searchParams = useSearchParams();

  const fetchOrg = useCallback(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then(async (d) => {
        if (!d.org) return;
        setOrg(d.org);
        // Sync live status from Stripe if the account exists but isn't fully
        // enabled yet — fallback in case the Connect webhook was missed.
        if (d.org.stripeAccountId && !d.org.stripeChargesEnabled) {
          try {
            const syncRes = await fetch(`/api/orgs/${d.org.id}/stripe/sync`, { method: "POST" });
            const s = await syncRes.json();
            if (s.synced) {
              setOrg((prev) =>
                prev
                  ? {
                      ...prev,
                      stripeChargesEnabled: s.stripeChargesEnabled,
                      stripePayoutsEnabled: s.stripePayoutsEnabled,
                      stripeDetailsSubmitted: s.stripeDetailsSubmitted,
                    }
                  : prev
              );
            }
          } catch {
            // best-effort — webhook remains the primary mechanism
          }
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchOrg();

    const onboarded = searchParams.get("onboarded");
    const refresh = searchParams.get("refresh");

    if (onboarded === "1") {
      setMsg({
        text: "Setup submitted — your account is being reviewed by Stripe. This page will update automatically once approved.",
        ok: true,
      });
    } else if (refresh === "1") {
      setMsg({
        text: "Your onboarding link expired. Click below to get a new one.",
        ok: false,
      });
    }
  }, [fetchOrg, searchParams]);

  const handleConnect = async () => {
    if (!org) return;
    setConnecting(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/orgs/${org.id}/stripe/onboard`, { method: "POST" });
      let d: { url?: string; error?: string };
      try {
        d = await res.json();
      } catch {
        d = { error: `Server error (HTTP ${res.status}). Check Vercel logs.` };
      }
      if (d.url) {
        window.location.href = d.url;
      } else {
        setMsg({ text: d.error || "Failed to start onboarding.", ok: false });
        setConnecting(false);
      }
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Something went wrong. Try again.", ok: false });
      setConnecting(false);
    }
  };

  const handleDashboard = async () => {
    if (!org) return;
    setConnecting(true);
    try {
      const res = await fetch(`/api/orgs/${org.id}/stripe/dashboard-link`, { method: "POST" });
      const d = await res.json();
      if (d.url) {
        window.open(d.url, "_blank");
      } else {
        setMsg({ text: d.error || "Could not open dashboard.", ok: false });
      }
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Something went wrong. Try again.", ok: false });
    } finally {
      setConnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[#8a7559]">Loading…</p>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[#8a7559]">Could not load payment settings.</p>
      </div>
    );
  }

  const isLive = org.stripeChargesEnabled;
  const hasAccount = !!org.stripeAccountId;
  const isPending = hasAccount && !isLive;

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold mb-6">Payments</h1>

      {/* Connection status card */}
      <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 mb-5">
        <h2 className="text-sm font-semibold text-[#6f5b46] uppercase tracking-wider mb-4">
          Stripe Connection
        </h2>

        {isLive ? (
          /* ── LIVE ── */
          <div className="space-y-4">
            <div className="flex items-center">
              <StatusDot enabled={true} />
              <span className="text-[#241a12] font-semibold">Connected and live</span>
            </div>
            <div className="text-sm text-[#6f5b46] space-y-1">
              <div className="flex items-center">
                <StatusDot enabled={org.stripeChargesEnabled} />
                Accepting charges
              </div>
              <div className="flex items-center">
                <StatusDot enabled={org.stripePayoutsEnabled} />
                Payouts enabled
              </div>
            </div>
            <p className="text-xs text-[#8a7559]">
              Payments are processed directly — no platform fee.
            </p>
            <button
              onClick={handleDashboard}
              disabled={connecting}
              className="bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] text-[#241a12] text-sm px-5 py-2.5 rounded-xl disabled:opacity-50 transition-colors"
            >
              {connecting ? "Opening…" : "Manage payout details"}
            </button>
          </div>
        ) : isPending ? (
          /* ── PENDING / INCOMPLETE ── */
          <div className="space-y-4">
            <div className="flex items-center">
              <StatusDot enabled={false} />
              <span className="text-amber-600 font-semibold">Onboarding incomplete</span>
            </div>
            <p className="text-sm text-[#6f5b46]">
              You started connecting Stripe but haven&apos;t finished. Resume to start accepting
              payments.
            </p>
            <p className="text-xs text-[#8a7559]">
              Payments are processed directly — no platform fee.
            </p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="bg-[#a4592a] hover:bg-[#843f1c] disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              {connecting ? "Loading…" : "Resume Stripe setup"}
            </button>
          </div>
        ) : (
          /* ── NOT CONNECTED ── */
          <div className="space-y-4">
            <div className="flex items-center">
              <StatusDot enabled={false} />
              <span className="text-[#4a3a2b] font-semibold">Not connected</span>
            </div>
            <p className="text-sm text-[#6f5b46]">
              Payments are processed directly through Northwood Bids&apos; Stripe account. Bidders are
              charged automatically when an auction closes.
            </p>
            <p className="text-xs text-[#8a7559]">
              No platform fee — bidders pay the winning bid plus any applicable tax.
            </p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="bg-[#a4592a] hover:bg-[#843f1c] disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              {connecting ? "Loading…" : "Connect Stripe"}
            </button>
          </div>
        )}
      </div>

      {msg && (
        <p
          className={`text-sm px-4 py-3 rounded-xl mb-4 ${
            msg.ok
              ? "bg-[#a4592a]/10 text-[#a4592a] border border-[#a4592a]/20"
              : "bg-yellow-500/10 text-amber-600 border border-yellow-500/20"
          }`}
        >
          {msg.text}
        </p>
      )}

      {/* Tax status — read-only, set by Northwood Bids */}
      <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 mb-5">
        <h2 className="text-sm font-semibold text-[#6f5b46] uppercase tracking-wider mb-1">
          Sales Tax
        </h2>
        <p className="text-xs text-[#8a7559] mb-3">
          Tax status is configured by Northwood Bids.
        </p>
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${org.taxExempt ? "bg-[#a4592a]" : "bg-amber-400"}`} />
          <span className="text-sm text-[#4a3a2b]">
            {org.taxExempt
              ? "Tax exempt — no sales tax collected"
              : `Sales tax: ${Number(org.taxPercent)}% added to each winning bid`}
          </span>
        </div>
      </div>

      {/* Info block */}
      <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-[#6f5b46] uppercase tracking-wider mb-3">
          How it works
        </h2>
        <ul className="text-sm text-[#6f5b46] space-y-2">
          <li>Payments are processed directly through Northwood Bids&apos; Stripe account.</li>
          <li>There is no platform fee — bidders pay the winning bid plus any applicable tax.</li>
          <li>Winners are charged automatically when the auction closes — no manual steps.</li>
          <li>Funds are deposited into the business&apos;s bank account on a rolling daily schedule.</li>
          <li>Northwood Bids is the merchant of record and appears on bidder receipts.</li>
        </ul>
      </div>
    </div>
  );
}

export default function PaymentsSettingsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><p className="text-[#8a7559]">Loading…</p></div>}>
      <PaymentsContent />
    </Suspense>
  );
}
