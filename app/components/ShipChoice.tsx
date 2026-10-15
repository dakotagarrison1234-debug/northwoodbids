"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import ShipModeSwitch, { type ShipMode } from "./ShipModeSwitch";
import ShippingAddressModal from "./ShippingAddressModal";
import BandMeter from "./BandMeter";
import { fmtCents, headroomState, roomLine, type Headroom } from "@/lib/shipping/tiers";

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
 * The Ship segment carries the live number for THIS lot. Under the switch,
 * one optional line about the open box it would join — and nothing else.
 * First tap on Ship without an address opens ShippingAddressModal.
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

  // The live number for THIS lot: exact, delta, Free (rides in the open box), or "from".
  const shipPrice =
    quote.exactCents == null
      ? `from ${fmtCents(quote.fromCents)}`
      : quote.joinsOpenBox
      ? quote.exactCents === 0 ? "Free" : `+${fmtCents(quote.exactCents)}`
      : fmtCents(quote.exactCents);

  // One optional line under the switch, only with Ship selected and an open box to join.
  let room: React.ReactNode = null;
  if (mode === "SHIP" && quote.box) {
    const st = headroomState(quote.box.headroom);
    const small = compact ? "text-[12px]" : "text-[13px]";
    if (st.kind === "room" || st.kind === "top-room") {
      const line = roomLine(st.fits);
      room = (
        <div className="flex items-center gap-2.5 min-w-0">
          <BandMeter weightOz={quote.box.weightOz} zone={quote.box.zone} slim className="flex-1 min-w-[56px]" />
          {line && <span className={`${small} font-semibold text-[#2f5d3a] whitespace-nowrap`}>{line}</span>}
        </div>
      );
    } else if (st.kind === "full") {
      room = <p className={`${small} text-[#6f5b46]`}>Next lot: <span className="font-bold text-[#241a12] tabular-nums">+{fmtCents(st.stepCents)}</span></p>;
    } else {
      room = <p className={`${small} text-[#6f5b46]`}>Full — the next lot starts a new box</p>;
    }
  }

  return (
    <div className={className}>
      <ShipModeSwitch mode={mode} onPick={pick} shipPrice={shipPrice} busy={busy} size={compact ? "sm" : "md"} />
      {(room || !compact) && (
        <div className={`flex items-center justify-between gap-3 ${compact ? "mt-1.5" : "mt-2"}`}>
          <div className="min-w-0 flex-1">{room}</div>
          {!compact && (
            <Link href="/shipping#how" className="shrink-0 inline-flex items-center min-h-[44px] text-[13px] text-[#8a7559] hover:text-[#6c4d39] underline underline-offset-2 nb-focus rounded">
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
