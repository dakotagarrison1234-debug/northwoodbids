"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import ShipModeSwitch, { type ShipMode } from "./ShipModeSwitch";
import ShippingAddressModal from "./ShippingAddressModal";
import FreeBlocks from "./FreeBlocks";
import FillBar from "./FillBar";
import { fmtCents, headroom, type Headroom, type ShipPresetKey } from "@/lib/shipping/tiers";

type Quote =
  | { eligible: false; signedIn: boolean; mode: ShipMode | null }
  | {
      eligible: true;
      fromCents: number;
      exactCents: number | null;
      joinsOpenBox: boolean;
      zone: 1 | 2 | 3 | null;
      needsAddress: boolean;
      box: { id: string; weightOz: number; zone: 1 | 2 | 3; headroom: Headroom } | null;
      lot: { preset: ShipPresetKey; weightOz: number };
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
 * The Ship segment carries the live number for THIS lot (FREE when it rides in
 * the open box). With Ship selected, the free blocks say how many more of each
 * size ride free and the fill bar shows how full the box is — the size badge
 * on the photo plus those blocks are the whole explanation. Quick Bid (compact)
 * gets the switch and the blocks only. First tap on Ship without an address
 * opens ShippingAddressModal.
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

  // The live number for THIS lot: exact, delta, FREE (rides in the open box), or "from".
  const shipPrice =
    quote.exactCents == null
      ? `from ${fmtCents(quote.fromCents)}`
      : quote.joinsOpenBox
      ? quote.exactCents === 0 ? "FREE" : `+${fmtCents(quote.exactCents)}`
      : fmtCents(quote.exactCents);

  // What the blocks and bar draw: the open box this lot would join, or — with
  // no box to join — a fresh box holding just this lot.
  const zone = quote.box?.zone ?? quote.zone ?? 1;
  const weightOz = quote.box ? quote.box.weightOz : quote.lot.weightOz;
  const fits = quote.box ? quote.box.headroom.fits : headroom(quote.lot.weightOz, zone).fits;
  // This lot is the one that tips the box into the next price: its own block says so.
  const step =
    quote.box && quote.joinsOpenBox && (quote.exactCents ?? 0) > 0 && quote.lot.preset !== "CUSTOM"
      ? { key: quote.lot.preset, cents: quote.exactCents as number }
      : null;

  return (
    <div className={className}>
      <ShipModeSwitch mode={mode} onPick={pick} shipPrice={shipPrice} busy={busy} size={compact ? "sm" : "md"} />
      {mode === "SHIP" && (
        <div className="mt-2 space-y-2">
          <FreeBlocks fits={fits} step={step} />
          {!compact && (
            <div className="flex items-center gap-3">
              <FillBar weightOz={weightOz} zone={zone} height={6} className="flex-1 min-w-0" />
              <Link href="/shipping" className="shrink-0 inline-flex items-center min-h-[44px] text-[13px] text-[#8a7559] hover:text-[#6c4d39] underline underline-offset-2 nb-focus rounded">
                Shipping
              </Link>
            </div>
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
