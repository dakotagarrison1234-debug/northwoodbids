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
 * Collects and saves a payment card with three clean, individually-styled Stripe
 * fields — Card number / Expiry / CVC — instead of the busy tabbed Payment Element
 * (which drags in the Link email prompt, wallet buttons and extra tabs that look
 * cluttered and off-putting). Big text, plenty of room, one clear "Save card".
 * Payments run on the platform account (no Connect).
 */
export default function CardSetupModal({ orgId, onSuccess, onClose }: Props) {
  const numberRef = useRef<HTMLDivElement>(null);
  const expiryRef = useRef<HTMLDivElement>(null);
  const cvcRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripeRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardNumberRef = useRef<any>(null);
  const clientSecretRef = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els: any[] = [];

    (async () => {
      try {
        const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
        if (!stripe || cancelled) return;
        stripeRef.current = stripe;

        // SetupIntent (used at confirm time; not needed to create the fields).
        const res = await fetch(`/api/orgs/${orgId}/stripe/setup-intent`, { method: "POST" });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          if (!cancelled) setError(d.error || "Couldn't start card setup. Please try again.");
          return;
        }
        const { clientSecret } = await res.json();
        if (cancelled || !clientSecret) return;
        clientSecretRef.current = clientSecret;

        const style = {
          base: {
            color: "#241a12",
            fontFamily: "inherit",
            fontWeight: "500",
            fontSize: "17px",
            fontSmoothing: "antialiased",
            "::placeholder": { color: "#c2b298" },
          },
          invalid: { color: "#dc2626", iconColor: "#dc2626" },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const elements = (stripe as any).elements();
        const cardNumber = elements.create("cardNumber", { style, showIcon: true, placeholder: "Card number" });
        const cardExpiry = elements.create("cardExpiry", { style });
        const cardCvc = elements.create("cardCvc", { style, placeholder: "CVC" });
        cardNumberRef.current = cardNumber;
        els.push(cardNumber, cardExpiry, cardCvc);

        if (cancelled) return;
        if (numberRef.current) cardNumber.mount(numberRef.current);
        if (expiryRef.current) cardExpiry.mount(expiryRef.current);
        if (cvcRef.current) cardCvc.mount(cvcRef.current);
        cardNumber.on("ready", () => { if (!cancelled) setReady(true); });
      } catch {
        if (!cancelled) setError("Couldn't load the card form. Please try again.");
      }
    })();

    return () => {
      cancelled = true;
      els.forEach((e) => { try { e.unmount?.(); } catch { /* ignore */ } });
    };
  }, [orgId]);

  const handleSave = async () => {
    const stripe = stripeRef.current;
    const card = cardNumberRef.current;
    const clientSecret = clientSecretRef.current;
    if (!stripe || !card || !clientSecret) return;
    setSaving(true);
    setError(null);
    try {
      const result = await stripe.confirmCardSetup(clientSecret, { payment_method: { card } });
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
    } catch (err) {
      console.error("[card setup] save failed:", err);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#241a12]/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Focus/error styling for the Stripe field wrappers (Stripe adds these classes). */}
      <style>{`
        .nb-card-field { transition: border-color .15s, box-shadow .15s; }
        .nb-card-field.StripeElement--focus { border-color:#6c4d39; box-shadow:0 0 0 3px rgba(108,77,57,0.14); background:#fff; }
        .nb-card-field.StripeElement--invalid { border-color:#dc2626; }
      `}</style>

      <div className="bg-white border border-[#e3d6bf] rounded-t-3xl sm:rounded-3xl p-6 sm:p-7 w-full sm:max-w-md max-h-[92vh] overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-7 shadow-2xl">
        <div className="flex items-start justify-between mb-1">
          <h2 className="font-display font-black text-2xl text-[#241a12]">Add your card</h2>
          <button onClick={onClose} className="text-[#8a7559] hover:text-[#6f5b46] transition-colors p-2 -m-2 rounded-lg" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 2l12 12M14 2L2 14"/></svg>
          </button>
        </div>

        <p className="text-sm text-[#6f5b46] mb-6 leading-relaxed">
          You won&apos;t be charged now. We only charge this card automatically if you win.
        </p>

        {/* Card number */}
        <label className="block text-sm font-bold text-[#6f5b46] mb-1.5">Card number</label>
        <div ref={numberRef} className="nb-card-field bg-[#faf5ea] border border-[#cdbda3] rounded-xl px-4 py-3.5 mb-4" />

        {/* Expiry + CVC */}
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <label className="block text-sm font-bold text-[#6f5b46] mb-1.5">Expiry</label>
            <div ref={expiryRef} className="nb-card-field bg-[#faf5ea] border border-[#cdbda3] rounded-xl px-4 py-3.5" />
          </div>
          <div>
            <label className="block text-sm font-bold text-[#6f5b46] mb-1.5">CVC</label>
            <div ref={cvcRef} className="nb-card-field bg-[#faf5ea] border border-[#cdbda3] rounded-xl px-4 py-3.5" />
          </div>
        </div>

        {!ready && !error && (
          <div className="flex items-center gap-2 text-[#8a7559] text-sm mt-4">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#cdbda3" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="#6c4d39" strokeWidth="3" strokeLinecap="round" /></svg>
            Loading secure card fields…
          </div>
        )}

        {error && <p className="text-red-600 text-sm mt-4 font-medium">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving || !ready}
          className="w-full mt-6 bg-[#6c4d39] hover:bg-[#563e2c] active:scale-[0.99] disabled:opacity-50 text-white font-black py-4 rounded-xl text-base transition-all shadow-[0_8px_24px_-8px_rgba(108,77,57,0.6)]"
        >
          {saving ? "Saving…" : "Save card"}
        </button>

        <p className="text-xs text-[#8a7559] mt-3.5 text-center flex items-center justify-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
          Encrypted &amp; secured by Stripe
        </p>
      </div>
    </div>
  );
}
