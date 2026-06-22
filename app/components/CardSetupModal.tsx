"use client";
import { useEffect, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";

interface Props {
  orgId: string;
  stripeAccountId?: string | null; // unused (direct-charge model); kept for caller compatibility
  onSuccess: () => void;
  onClose: () => void;
}

/**
 * Collects and saves a payment card with Stripe's modern Payment Element —
 * separate, roomy Card number / Expiry / CVC fields that play nicely with phone
 * autofill. Payments run on the platform account (no Connect).
 */
export default function CardSetupModal({ orgId, onSuccess, onClose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripeRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elementsRef = useRef<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let paymentEl: any = null;

    (async () => {
      try {
        const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
        if (!stripe || cancelled) return;
        stripeRef.current = stripe;

        // SetupIntent up front so the Payment Element can mount against it.
        const res = await fetch(`/api/orgs/${orgId}/stripe/setup-intent`, { method: "POST" });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          if (!cancelled) setError(d.error || "Couldn't start card setup. Please try again.");
          return;
        }
        const { clientSecret } = await res.json();
        if (cancelled || !clientSecret) return;

        const appearance = {
          theme: "stripe" as const,
          variables: {
            colorPrimary: "#6c4d39",
            colorText: "#241a12",
            colorTextPlaceholder: "#b3a085",
            colorBackground: "#ffffff",
            fontFamily: "inherit",
            fontSizeBase: "16px",   // 16px stops iOS from zooming the field
            borderRadius: "12px",
            spacingUnit: "4px",
          },
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const elements = (stripe as any).elements({ clientSecret, appearance });
        elementsRef.current = elements;
        paymentEl = elements.create("payment", {
          layout: { type: "tabs", defaultCollapsed: false },
          fields: { billingDetails: { address: { country: "never", postalCode: "auto" } } },
        });
        if (mountRef.current && !cancelled) {
          paymentEl.mount(mountRef.current);
          paymentEl.on("ready", () => { if (!cancelled) setReady(true); });
        }
      } catch {
        if (!cancelled) setError("Couldn't load the card form. Please try again.");
      }
    })();

    return () => {
      cancelled = true;
      try { paymentEl?.unmount?.(); } catch { /* ignore */ }
    };
  }, [orgId]);

  const handleSave = async () => {
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements) return;
    setSaving(true);
    setError(null);
    try {
      const result = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
        confirmParams: { return_url: typeof window !== "undefined" ? window.location.href : undefined },
      });
      if (result.error) {
        setError(result.error.message || "Card setup failed. Please check your details.");
        return;
      }
      const pm = result.setupIntent?.payment_method;
      const pmId = typeof pm === "string" ? pm : pm?.id;
      if (!pmId) {
        setError("Card setup incomplete. Please try again.");
        return;
      }
      const pmRes = await fetch(`/api/orgs/${orgId}/stripe/payment-method`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodId: pmId }),
      });
      if (!pmRes.ok) {
        const d = await pmRes.json().catch(() => ({}));
        setError(d.error || "Failed to save card.");
        return;
      }
      onSuccess();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#241a12]/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white border border-[#e3d6bf] rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-md max-h-[92vh] overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#6c4d39]/10 border border-[#6c4d39]/20 rounded-xl flex items-center justify-center shrink-0 text-[#6c4d39]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
              </svg>
            </div>
            <h2 className="font-bold text-lg text-[#241a12]">Add a card</h2>
          </div>
          <button onClick={onClose} className="text-[#8a7559] hover:text-[#6f5b46] transition-colors p-2 -m-2 rounded-lg" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 2l12 12M14 2L2 14"/></svg>
          </button>
        </div>

        <p className="text-sm text-[#6f5b46] mb-5">
          You won&apos;t be charged now — your card is charged automatically only if you win.
        </p>

        {/* Payment Element mounts here */}
        <div ref={mountRef} className="min-h-[44px] mb-4" />

        {!ready && !error && (
          <div className="flex items-center gap-2 text-[#8a7559] text-sm mb-4">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#cdbda3" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="#6c4d39" strokeWidth="3" strokeLinecap="round" /></svg>
            Loading secure card form…
          </div>
        )}

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving || !ready}
          className="w-full bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-base transition-colors"
        >
          {saving ? "Saving…" : "Save card"}
        </button>

        <p className="text-xs text-[#8a7559] mt-3 text-center flex items-center justify-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
          Secured by Stripe
        </p>
      </div>
    </div>
  );
}
