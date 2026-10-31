"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import ShipModeSwitch, { type ShipMode } from "./ShipModeSwitch";
import ShippingAddressModal from "./ShippingAddressModal";
import BoxSpots from "./BoxSpots";
import { addCents, fmtCents, type ShipPresetKey } from "@/lib/shipping/tiers";

type Quote =
  | { eligible: false; signedIn: boolean; mode: ShipMode | null }
  | {
      eligible: true;
      fromCents: number;
      exactCents: number | null;
      joinsOpenBox: boolean;
      zone: 1 | 2 | 3 | null;
      needsAddress: boolean;
      /** The buyer's box at this lot's warehouse: spots won (open box) + spots they're winning now. */
      box: { wonSpots: number; wonLots: number; winningSpots: number; winningLots: number } | null;
      lot: { preset: ShipPresetKey; spots: number };
      signedIn: boolean;
      mode: ShipMode | null;
      howItWorks: string[];
    };

/**
 * Pickup / Ship on a lot that can ship. The mode is the buyer's ONE setting:
 * flip it here and every lot they win follows it until they flip it back.
 * Nothing is charged until they win. A pickup-only lot renders nothing — unless
 * the buyer is in Ship mode, then one line says this one is pickup.
 *
 *   GET  /api/shipping/quote?itemId=   → this lot's price + the buyer's mode
 *   POST /api/shipping/choice          → set the mode
 *
 * Shipping is priced per BOX, never per lot: everything won in a night rides in
 * one box. So the Ship segment says what THIS lot adds to the buyer's box
 * (FREE / +$3.00 / the box price when it would start one), and with Ship
 * selected BoxSpots draws the box: spots already won, spots they're winning
 * right now, this lot, the two box prices that matter, and one sentence
 * ("Win this and 5 more small lots still fit for $9.99 total"). Quick Bid
 * (compact) gets the switch and the box without the price rows. First tap on
 * Ship without an address opens ShippingAddressModal.
 */
export default function ShipChoice({
  itemId,
  compact = false,
  onRequireSignIn,
  onChoice,
  className = "",
}: {
  itemId: string;
  /** Unused since the switch went label-light; kept so callers don't change. */
  locationName?: string | null;
  compact?: boolean;
  onRequireSignIn?: () => void;
  onChoice?: (choice: ShipMode) => void;
  className?: string;
}) {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [mode, setMode] = useState<ShipMode>("PICKUP");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddress, setShowAddress] = useState(false);

  const load = useCallback(() => {
    return fetch(`/api/shipping/quote?itemId=${encodeURIComponent(itemId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((q: Quote | null) => {
        if (!q) return;
        setQuote(q);
        // Ship with no address on file can't actually ship — show Pickup.
        if (q.eligible) setMode(q.mode === "SHIP" && !q.needsAddress ? "SHIP" : "PICKUP");
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

  const commit = async (next: ShipMode) => {
    if (busy) return;
    const prev = mode;
    setMode(next); // optimistic
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
        setMode(prev);
        if (d.needsAddress) { setShowAddress(true); return; }
        setError(d.error || "Couldn't save that.");
        return;
      }
      onChoice?.(next);
      // Refresh the price (a saved address or an open box can change it).
      load();
    } catch {
      setMode(prev);
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const pick = (next: ShipMode) => {
    if (!isSignedIn) {
      if (next === "SHIP") requireSignIn();
      return;
    }
    if (next === mode) return;
    if (next === "SHIP" && quote?.eligible && quote.needsAddress) {
      // No usable address on file (GET /api/shipping/address would be null too), so the modal opens blank.
      setShowAddress(true);
      return;
    }
    void commit(next);
  };

  if (!quote) return null;
  if (!quote.eligible) {
    // In Ship mode, say why this lot won't ride in the box; otherwise stay quiet.
    if (quote.mode !== "SHIP") return null;
    return (
      <div className={className}>
        <p className={`${compact ? "text-[12px]" : "text-[13px]"} text-[#6f5b46]`}>Pickup only — too big or heavy to ship</p>
      </div>
    );
  }

  // What THIS lot adds to the buyer's box, counting what they've won (the open
  // box) and what they're winning right now. Anonymous / no address: "from".
  const zone: 1 | 2 | 3 = quote.zone ?? 1;
  const base = quote.box ? quote.box.wonSpots + quote.box.winningSpots : 0;
  const adds = quote.box ? addCents(base, base + quote.lot.spots, zone) : null;
  const shipPrice =
    adds == null ? `from ${fmtCents(quote.fromCents)}`
    : base === 0 ? `${fmtCents(adds)} box`
    : adds === 0 ? "FREE"
    : `+${fmtCents(adds)}`;

  return (
    <div className={className}>
      <ShipModeSwitch mode={mode} onPick={pick} shipPrice={shipPrice} busy={busy} size={compact ? "sm" : "md"} />
      {mode === "SHIP" && (
        <div className="mt-2 rounded-2xl bg-white border border-[#e3d6bf] px-3.5 py-3">
          <BoxSpots
            zone={zone}
            wonSpots={quote.box?.wonSpots ?? 0}
            winningSpots={quote.box?.winningSpots ?? 0}
            winningLots={quote.box?.winningLots ?? 0}
            thisSpots={quote.lot.spots}
            title={quote.box ? "Your box" : "Box prices (Michigan)"}
            compact={compact}
          />
          {!compact && (
            <Link href="/shipping" className="inline-flex items-center min-h-[44px] text-[13px] text-[#8a7559] hover:text-[#6c4d39] underline underline-offset-2 nb-focus rounded">
              How shipping works
            </Link>
          )}
        </div>
      )}
      {error && <p className="text-[12px] text-red-700 mt-1.5">{error}</p>}
      {showAddress && (
        <ShippingAddressModal
          initial={null}
          howItWorks={quote.howItWorks}
          onClose={() => setShowAddress(false)}
          onSaved={() => {
            setShowAddress(false);
            void commit("SHIP");
          }}
        />
      )}
    </div>
  );
}
