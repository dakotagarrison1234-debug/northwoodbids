"use client";
import { useEffect, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";

interface Props {
  orgId: string;
  stripeAccountId: string;
  onSuccess: () => void;
  onClose: () => void;
}

/**
 * Modal that collects and saves a payment card using Stripe.js Elements.
 * Initializes on the org's CONNECTED Stripe account so the card is usable
 * for off-session charges on that account at auction close.
 *
 * Uses vanilla Stripe.js (no @stripe/react-stripe-js dependency needed).
 */
export default function CardSetupModal({ orgId, stripeAccountId, onSuccess, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<ReturnType<typeof import("@stripe/stripe-js").loadStripe> extends Promise<infer T> ? T : never>(null);
  const cardElementRef = useRef<{ destroy: () => void } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!, {
        stripeAccount: stripeAccountId,
      });
      if (!stripe || cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (stripeRef as any).current = stripe;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const elements = (stripe as any).elements();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const card = elements.create("card", {
        style: {
          base: {
            color: "#f9fafb",
            fontSize: "16px",
            fontFamily: "inherit",
            "::placeholder": { color: "#4b5563" },
          },
          invalid: { color: "#f87171" },
        },
      });

      if (cardRef.current && !cancelled) {
        card.mount(cardRef.current);
        cardElementRef.current = card;
        setReady(true);
      }
    }

    init();

    return () => {
      cancelled = true;
      cardElementRef.current?.destroy();
      cardElementRef.current = null;
    };
  }, [stripeAccountId]);

  const handleSave = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = (stripeRef as any).current;
    const card = cardElementRef.current;
    if (!stripe || !card) return;

    setSaving(true);
    setError(null);

    try {
      // 1. Get a SetupIntent from the server
      const siRes = await fetch(`/api/orgs/${orgId}/stripe/setup-intent`, { method: "POST" });
      if (!siRes.ok) {
        const d = await siRes.json();
        setError(d.error || "Could not start card setup.");
        return;
      }
      const { clientSecret } = await siRes.json();

      // 2. Confirm the setup — Stripe Elements collects + tokenises the card
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (stripe as any).confirmCardSetup(clientSecret, {
        payment_method: { card },
      });

      if (result.error) {
        setError(result.error.message || "Card setup failed.");
        return;
      }

      const paymentMethodId = result.setupIntent?.payment_method;
      if (!paymentMethodId) {
        setError("Card setup incomplete. Please try again.");
        return;
      }

      // 3. Save the payment method ID to our DB
      const pmRes = await fetch(`/api/orgs/${orgId}/stripe/payment-method`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodId }),
      });
      if (!pmRes.ok) {
        const d = await pmRes.json();
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
    <div className="fixed inset-0 z-50 bg-[#f1e7d5]/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#6c4d39]/10 border border-[#6c4d39]/20 rounded-xl flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6f8a4f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2"/>
                <line x1="1" y1="10" x2="23" y2="10"/>
              </svg>
            </div>
            <h2 className="font-bold text-base text-[#241a12]">Add Payment Card</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#8a7559] hover:text-[#6f5b46] transition-colors p-1 rounded-lg"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 2l12 12M14 2L2 14"/>
            </svg>
          </button>
        </div>

        <p className="text-sm text-[#6f5b46] mb-5">
          A card is required to bid. You won&apos;t be charged until you win — your card is charged automatically when the auction closes.
        </p>

        {/* Stripe card element mount point */}
        <div
          ref={cardRef}
          className={`bg-[#efe3d0] border rounded-xl px-4 py-3.5 mb-4 min-h-[46px] transition-colors ${
            error ? "border-red-500/50" : "border-[#cdbda3] focus-within:border-[#6c4d39]/50"
          } ${!ready ? "opacity-50" : ""}`}
        />

        {error && (
          <p className="text-red-600 text-sm mb-4">{error}</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving || !ready}
          className="w-full bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
        >
          {saving ? "Saving…" : "Save Card & Continue"}
        </button>

        <p className="text-xs text-[#8a7559] mt-3 text-center">
          Secured by Stripe · Your card number is never sent to our servers.
        </p>
      </div>
    </div>
  );
}
