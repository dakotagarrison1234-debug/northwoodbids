"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { IcoTruck } from "./BidIcons";
import ShippingAddressModal, { type ShipAddress } from "./ShippingAddressModal";

type Choice = "PICKUP" | "SHIP";

type Quote =
  | { eligible: false }
  | {
      eligible: true;
      fromCents: number;
      exactCents: number | null;
      joinsOpenBox: boolean;
      zone: 1 | 2 | 3 | null;
      needsAddress: boolean;
      signedIn: boolean;
      choice: Choice | null;
      howItWorks: string[];
    };

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

function IcoPin({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

/**
 * Pickup / Ship — the choice a bidder makes BEFORE bidding on a ship-eligible lot.
 * Nothing is charged until they win. Renders nothing for pickup-only lots.
 *
 * Full mode: two boxes side by side with a one-liner under them. Compact mode
 * (Quick Bid): one row, two pills. Same API either way:
 *   GET  /api/shipping/quote?itemId=   → price + current choice
 *   POST /api/shipping/choice          → remember it
 * First tap on Ship without an address opens ShippingAddressModal.
 */
export default function ShipChoice({
  itemId,
  locationName,
  compact = false,
  onRequireSignIn,
  onChoice,
  className = "",
}: {
  itemId: string;
  locationName?: string | null;
  compact?: boolean;
  onRequireSignIn?: () => void;
  onChoice?: (choice: Choice) => void;
  className?: string;
}) {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [choice, setChoice] = useState<Choice>("PICKUP");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddress, setShowAddress] = useState(false);
  const [savedAddress, setSavedAddress] = useState<Partial<ShipAddress> | null>(null);

  const load = useCallback(() => {
    return fetch(`/api/shipping/quote?itemId=${encodeURIComponent(itemId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((q: Quote | null) => {
        if (!q) return;
        setQuote(q);
        // A remembered "Ship" with no address on file can't actually ship — show Pickup.
        if (q.eligible) setChoice(q.choice === "SHIP" && !q.needsAddress ? "SHIP" : "PICKUP");
      })
      .catch(() => {});
  }, [itemId]);

  useEffect(() => {
    if (!isLoaded) return;
    load();
  }, [load, isLoaded, isSignedIn]);

  const requireSignIn = () => {
    if (onRequireSignIn) onRequireSignIn();
    else router.push(`/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`);
  };

  const commit = async (next: Choice) => {
    if (busy) return;
    const prev = choice;
    setChoice(next); // optimistic
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/shipping/choice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, choice: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) {
        setChoice(prev);
        if (d.needsAddress) { setShowAddress(true); return; }
        setError(d.error || "Couldn't save that.");
        return;
      }
      onChoice?.(next);
      // Refresh the price (a saved address or an open box can change it).
      load();
    } catch {
      setChoice(prev);
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const pick = (next: Choice) => {
    if (!isSignedIn) {
      if (next === "SHIP") requireSignIn();
      return;
    }
    if (next === choice) return;
    if (next === "SHIP" && quote?.eligible && quote.needsAddress) {
      // Prefill from anything already on file (e.g. a non-lower-48 address they typed before).
      fetch("/api/shipping/address").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.address) setSavedAddress(d.address); }).catch(() => {});
      setShowAddress(true);
      return;
    }
    void commit(next);
  };

  if (!quote || !quote.eligible) return null;

  const shipPrice =
    quote.exactCents != null
      ? quote.joinsOpenBox && quote.exactCents === 0
        ? "+$0 — rides in your open box"
        : quote.joinsOpenBox
        ? `+${fmt(quote.exactCents)}`
        : fmt(quote.exactCents)
      : `from ${fmt(quote.fromCents)} in Michigan`;
  // Compact pills haven't the room for the full "rides in your open box" line.
  const shipPriceShort =
    quote.exactCents != null
      ? quote.joinsOpenBox ? `+${fmt(quote.exactCents)}` : fmt(quote.exactCents)
      : `from ${fmt(quote.fromCents)} in MI`;
  const pickupSub = locationName ? `Free · ${locationName}` : "Free";

  const sel = "border-[#6c4d39] bg-[#f6ecda] shadow-[0_0_0_1px_rgba(108,77,57,0.25)]";
  const unsel = "border-[#e3d6bf] bg-white hover:border-[#6c4d39]/40";

  const modal = showAddress && (
    <ShippingAddressModal
      initial={savedAddress}
      howItWorks={quote.howItWorks}
      onClose={() => setShowAddress(false)}
      onSaved={() => {
        setShowAddress(false);
        void commit("SHIP");
      }}
    />
  );

  if (compact) {
    return (
      <div className={className}>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Pickup or ship">
          <button
            type="button"
            role="radio"
            aria-checked={choice === "PICKUP"}
            disabled={busy}
            onClick={() => pick("PICKUP")}
            className={`flex items-center justify-center gap-1.5 rounded-full border-2 px-3 py-2 text-sm font-bold transition-colors disabled:opacity-70 ${choice === "PICKUP" ? sel : unsel} text-[#241a12]`}
          >
            <IcoPin className="w-3.5 h-3.5 text-[#6c4d39]" /> Pickup <span className="text-[#8a7559] font-semibold">free</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={choice === "SHIP"}
            disabled={busy}
            onClick={() => pick("SHIP")}
            className={`flex items-center justify-center gap-1.5 rounded-full border-2 px-3 py-2 text-sm font-bold transition-colors disabled:opacity-70 ${choice === "SHIP" ? sel : unsel} text-[#241a12]`}
          >
            <IcoTruck className="w-3.5 h-3.5 text-[#6c4d39]" /> Ship <span className="text-[#8a7559] font-semibold tabular-nums">{shipPriceShort}</span>
          </button>
        </div>
        {choice === "SHIP" && quote.joinsOpenBox && !error && (
          <p className="text-[11px] text-[#8a7559] mt-1">Rides in your open box.</p>
        )}
        {error && <p className="text-[11px] text-red-700 mt-1">{error}</p>}
        {modal}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Pickup or ship">
        <button
          type="button"
          role="radio"
          aria-checked={choice === "PICKUP"}
          disabled={busy}
          onClick={() => pick("PICKUP")}
          className={`text-left rounded-2xl border-2 px-3.5 py-3 transition-colors disabled:opacity-70 ${choice === "PICKUP" ? sel : unsel}`}
        >
          <div className="flex items-center gap-1.5 font-display font-bold text-[15px] text-[#241a12] leading-none">
            <IcoPin className="w-4 h-4 text-[#6c4d39]" /> Pickup
          </div>
          <div className="text-xs text-[#6f5b46] mt-1.5 leading-snug">{pickupSub}</div>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={choice === "SHIP"}
          disabled={busy}
          onClick={() => pick("SHIP")}
          className={`text-left rounded-2xl border-2 px-3.5 py-3 transition-colors disabled:opacity-70 ${choice === "SHIP" ? sel : unsel}`}
        >
          <div className="flex items-center gap-1.5 font-display font-bold text-[15px] text-[#241a12] leading-none">
            <IcoTruck className="w-4 h-4 text-[#6c4d39]" /> Ship
          </div>
          <div className="text-xs text-[#6f5b46] mt-1.5 leading-snug tabular-nums">{shipPrice}</div>
        </button>
      </div>
      {choice === "SHIP" && !error && (
        <p className="text-[11px] text-[#8a7559] mt-1.5 leading-snug">Win more this week and they ride in the same box — you only pay the difference if it moves up a weight band.</p>
      )}
      {error && <p className="text-[11px] text-red-700 mt-1.5">{error}</p>}
      {modal}
    </div>
  );
}
