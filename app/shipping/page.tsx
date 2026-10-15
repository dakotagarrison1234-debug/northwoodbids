"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import ShipModeSwitch, { type ShipMode } from "@/app/components/ShipModeSwitch";
import ShippingAddressModal, { type ShipAddress } from "@/app/components/ShippingAddressModal";
import { BoxCard, ClosesPill, EmptyBoxCard, IconTiles, PastBoxRow } from "@/app/components/ShippingBoxFull";
import { useShippingBoxes } from "@/app/components/YourBoxCard";
import { HOW_IT_WORKS, TIERS, fmtCents } from "@/lib/shipping/tiers";

const FINE_PRINT = "Prices by weight and distance · lower 48 · no refunds once the label prints";

/**
 * /shipping — the buyer's box. Title + closes pill, the box card (or the empty
 * card), the three-tile pitch, the Pickup / Ship switch with the address, past
 * boxes, one line of fine print. Signed out: title, tiles, Sign in.
 */
export default function ShippingPage() {
  const { isSignedIn, isLoaded } = useUser();
  const { boxes, reload } = useShippingBoxes(true, isLoaded && !!isSignedIn);
  const [mode, setMode] = useState<ShipMode | null>(null);
  const [address, setAddress] = useState<ShipAddress | null | undefined>(undefined);
  const [zone, setZone] = useState<1 | 2 | 3 | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(false);
  // True when the modal opened from a Ship tap: saving the address then flips the mode.
  const [shipAfterSave, setShipAfterSave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMode = useCallback(() => {
    // Can't read the mode: show Pickup (the default) rather than a skeleton forever.
    return fetch("/api/shipping/choice").then((r) => (r.ok ? r.json() : null)).then((d) => setMode(d?.mode === "SHIP" ? "SHIP" : "PICKUP")).catch(() => setMode("PICKUP"));
  }, []);
  const loadAddress = useCallback(() => {
    return fetch("/api/shipping/address").then((r) => (r.ok ? r.json() : null)).then((d) => {
      setAddress((d?.address as ShipAddress | null) ?? null);
      setZone(d?.zone ?? null);
    }).catch(() => setAddress(null));
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    loadMode(); loadAddress();
  }, [isLoaded, isSignedIn, loadMode, loadAddress]);

  const commit = async (next: ShipMode) => {
    if (busy) return;
    const prev = mode;
    setMode(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/shipping/choice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choice: next }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) {
        setMode(prev);
        if (d.needsAddress) { setShipAfterSave(true); setModal(true); return; }
        setError(d.error || "Couldn't save that.");
      }
    } catch {
      setMode(prev);
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const pick = (next: ShipMode) => {
    if (next === mode) return;
    // Address still loading: don't open the modal (or commit) on a guess.
    if (next === "SHIP" && address === undefined) return;
    if (next === "SHIP" && !address) { setShipAfterSave(true); setModal(true); return; }
    void commit(next);
  };

  const open = (boxes ?? []).filter((b) => b.status === "OPEN");
  const past = (boxes ?? []).filter((b) => b.status === "CLOSED" || b.status === "PACKING" || b.status === "SHIPPED" || b.status === "DELIVERED").slice(0, 10);
  const z = zone ?? 1;
  const baseCents = TIERS[0].cents[z - 1];

  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      <div className="max-w-[420px] sm:max-w-[560px] mx-auto px-4 py-6 space-y-3">
        {/* Title + the closes pill (one open box; two boxes carry their own) */}
        <div className="flex items-center justify-between gap-3 min-h-[36px]">
          <h1 className="font-display text-[24px] font-black leading-none">Your box</h1>
          {open.length === 1 && <ClosesPill box={open[0]} />}
        </div>

        {!isLoaded ? (
          <div className="h-40 rounded-[18px] bg-white border border-[#e3d6bf] animate-pulse" aria-hidden="true" />
        ) : !isSignedIn ? (
          <>
            <IconTiles />
            <Link href="/sign-in?redirect_url=/shipping" className="flex items-center justify-center w-full bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold text-sm rounded-xl min-h-[48px] transition-colors nb-focus">
              Sign in
            </Link>
          </>
        ) : (
          <>
            {/* The box */}
            {boxes === null ? (
              <div className="h-40 rounded-[18px] bg-white border border-[#e3d6bf] animate-pulse" aria-hidden="true" />
            ) : open.length === 0 ? (
              <EmptyBoxCard zone={z} />
            ) : (
              open.map((b) => <BoxCard key={b.id} box={b} reload={reload} header={open.length > 1} />)
            )}

            <IconTiles />

            {/* Pickup or Ship + where */}
            <section className="bg-white border border-[#e3d6bf] rounded-[18px] p-4 space-y-3">
              {mode === null ? (
                <div className="h-[52px] rounded-2xl bg-[#f4ede1] animate-pulse" aria-hidden="true" />
              ) : (
                <ShipModeSwitch mode={mode} onPick={pick} shipPrice={`from ${fmtCents(baseCents)}`} busy={busy} size="sm" />
              )}
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm text-[#6f5b46]">
                  {address === undefined ? "Checking your address" : address ? <>to <span className="font-semibold text-[#241a12]">{address.city}, {address.state}</span></> : "No address yet"}
                </p>
                <button
                  type="button"
                  onClick={() => { setShipAfterSave(false); setModal(true); }}
                  className="shrink-0 text-sm font-bold text-[#6c4d39] hover:bg-[#faf5ea] border border-[#e3d6bf] rounded-xl px-3.5 min-h-[44px] transition-colors nb-focus"
                >
                  {address ? "Change" : "Add address"}
                </button>
              </div>
              {error && <p className="text-sm text-red-700 font-semibold">{error}</p>}
            </section>

            {/* Past boxes */}
            {past.length > 0 && (
              <section className="bg-white border border-[#e3d6bf] rounded-[18px] overflow-hidden">
                <ul className="divide-y divide-[#efe3d0]">
                  {past.map((b) => <PastBoxRow key={b.id} box={b} />)}
                </ul>
              </section>
            )}
          </>
        )}

        <p className="text-[12px] text-[#8a7559] text-center leading-snug pt-1">{FINE_PRINT}</p>
      </div>

      {modal && (
        <ShippingAddressModal
          initial={address ?? null}
          howItWorks={HOW_IT_WORKS}
          onClose={() => { setModal(false); setShipAfterSave(false); }}
          onSaved={(a) => {
            setModal(false);
            setAddress(a);
            loadAddress();
            if (shipAfterSave && mode !== "SHIP") void commit("SHIP");
            setShipAfterSave(false);
          }}
        />
      )}
    </main>
  );
}
