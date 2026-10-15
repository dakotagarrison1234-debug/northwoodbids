"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { IcoBox, IcoCheck } from "@/app/components/BidIcons";
import { PineMark } from "@/app/components/Illustrations";
import ShipModeSwitch, { type ShipMode } from "@/app/components/ShipModeSwitch";
import ShippingAddressModal, { type ShipAddress } from "@/app/components/ShippingAddressModal";
import { OpenBoxCard, ShippedBoxCard } from "@/app/components/ShippingBoxFull";
import { useShippingBoxes, money } from "@/app/components/YourBoxCard";
import { HOW_IT_WORKS, SHIP_FINE_PRINT, TIERS, ZONE_LABEL, fmtCents } from "@/lib/shipping/tiers";

type Charge = {
  id: string; itemId: string; title: string; cents: number; createdAt: string;
  status: "PAID" | "PENDING" | "FAILED" | "REFUNDED";
  /** Shipping given back after the lot left its box (the row stays, struck through). */
  refunded: boolean;
  box: { id: string; status: string; location: string | null } | null;
};

/** Short column heads for the price table (the long names are in ZONE_LABEL). */
const ZONE_SHORT: Record<1 | 2 | 3, string> = { 1: "MI", 2: "Mid & East", 3: "West" };

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric", year: "numeric" });

function IcoChevL() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#6c4d39]">{children}</div>;
}

/** One section card, the site's panel: eyebrow, slab title, body. */
function Panel({ id, eyebrow, title, aside, children }: { id?: string; eyebrow?: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-end justify-between gap-3 mb-2.5">
        <div className="min-w-0">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h2 className="font-display text-xl font-black text-[#241a12] leading-tight">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** HOW_IT_WORKS + the price table + the one-line fine print. Public — shows signed out too. */
function HowItWorks({ zone }: { zone: 1 | 2 | 3 | null }) {
  return (
    <div className="bg-white border border-[#e3d6bf] rounded-2xl px-4 sm:px-5 py-4 sm:py-5 space-y-4">
      <ol className="space-y-2 text-sm text-[#4a3a2b]">
        {HOW_IT_WORKS.map((line, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-[#6c4d39] text-[#f6ecda] text-[11px] font-black grid place-items-center shrink-0 mt-0.5 tabular-nums">{i + 1}</span>
            <span className="leading-snug">{line}</span>
          </li>
        ))}
      </ol>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-[13px] tabular-nums border-separate border-spacing-0">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.12em] text-[#8a7559]">
              <th className="text-left font-bold pb-1.5 pr-2">Box weight</th>
              {([1, 2, 3] as const).map((z) => (
                <th key={z} className={`text-right font-bold pb-1.5 pl-2 whitespace-nowrap ${zone === z ? "text-[#6c4d39]" : ""}`}>
                  {ZONE_SHORT[z]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIERS.map((t) => (
              <tr key={t.maxOz} className="border-t border-[#efe3d0]">
                <td className="py-1.5 pr-2 text-[#241a12] font-semibold border-t border-[#efe3d0] whitespace-nowrap">{t.label}</td>
                {t.cents.map((c, zi) => (
                  <td key={zi} className={`py-1.5 pl-2 text-right border-t border-[#efe3d0] ${zone === zi + 1 ? "font-black text-[#241a12]" : "text-[#4a3a2b]"}`}>{fmtCents(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {zone && <p className="text-[12px] text-[#6c4d39] font-semibold mt-1.5">{ZONE_SHORT[zone]} = {ZONE_LABEL[zone]} (you)</p>}
      </div>
      <p className="text-[12px] text-[#8a7559] leading-snug">{SHIP_FINE_PRINT}</p>
    </div>
  );
}

export default function ShippingPage() {
  const { isSignedIn, isLoaded } = useUser();
  const { boxes, reload } = useShippingBoxes(true, isLoaded && !!isSignedIn);
  const [mode, setMode] = useState<ShipMode | null>(null);
  const [address, setAddress] = useState<ShipAddress | null | undefined>(undefined);
  const [zone, setZone] = useState<1 | 2 | 3 | null>(null);
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(false);
  // True when the modal opened from a Ship tap: saving the address then flips the mode.
  const [shipAfterSave, setShipAfterSave] = useState(false);
  const [note, setNote] = useState<string | null>(null);
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
  const loadCharges = useCallback(() => {
    return fetch("/api/shipping/charges").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && Array.isArray(d.charges)) setCharges(d.charges); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    loadMode(); loadAddress(); loadCharges();
  }, [isLoaded, isSignedIn, loadMode, loadAddress, loadCharges]);

  // "/shipping#how" from the item page: the gated panels above the section land
  // after Clerk loads, which can shift it after the router's own hash scroll — so scroll again.
  useEffect(() => {
    if (!isLoaded || window.location.hash !== "#how") return;
    document.getElementById("how")?.scrollIntoView({ block: "start" });
  }, [isLoaded]);

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
        return;
      }
      setNote(next === "SHIP" ? "Ship it is. Every lot you win ships until you switch back." : "Pickup it is. Every lot you win waits at the warehouse.");
      setTimeout(() => setNote(null), 5000);
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

  const openBoxes = (boxes ?? []).filter((b) => b.status === "OPEN" || b.status === "CLOSED" || b.status === "PACKING");
  const shipped = (boxes ?? []).filter((b) => b.status === "SHIPPED" || b.status === "DELIVERED");
  const hasOpen = (boxes ?? []).some((b) => b.status === "OPEN");
  // "Open box" only while every box here is still taking wins; closed/packing ones make it "Boxes".
  const boxesTitle = openBoxes.every((b) => b.status === "OPEN") ? (openBoxes.length === 1 ? "Open box" : "Open boxes") : "Boxes";
  const baseCents = TIERS[0].cents[(zone ?? 1) - 1];

  const header = (
    <div className="flex items-end justify-between gap-3 mb-2">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#a85f28]">
          <PineMark className="w-3.5 h-3.5" /> Owosso &amp; Gladwin
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-black leading-[0.95] tracking-tight mt-1">Shipping</h1>
      </div>
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-[#6c4d39] hover:text-[#563e2c] font-semibold shrink-0 nb-focus rounded">
        <IcoChevL /> Your bids
      </Link>
    </div>
  );
  const sub = <p className="text-sm text-[#6f5b46] mb-6">One box per warehouse. Keep winning for 7 days and lots ride together.</p>;

  // The page itself (header, How it works, the price table) is public and renders
  // at once; only the buyer's own panels wait on Clerk / sign-in.
  const signedIn = isLoaded && !!isSignedIn;
  const gate = !isLoaded ? (
    <div className="h-28 rounded-2xl bg-white border border-[#e3d6bf] animate-pulse" aria-hidden="true" />
  ) : !isSignedIn ? (
    <div className="bg-white border border-[#e3d6bf] rounded-2xl px-5 py-5 flex items-center justify-between gap-3 flex-wrap">
      <p className="text-sm text-[#6f5b46]">Sign in to see your boxes, room left and tracking.</p>
      <Link href="/sign-in?redirect_url=/shipping" className="inline-flex items-center bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors nb-focus">
        Sign in
      </Link>
    </div>
  ) : null;

  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-6 sm:py-8 space-y-7">
        <div>
          {header}
          {sub}

          {/* ── Pickup or Ship ── */}
          {gate ?? (
          <Panel title="Pickup or Ship">
            <div className="bg-white border border-[#e3d6bf] rounded-2xl px-4 sm:px-5 py-4 space-y-3">
              {mode === null ? (
                <div className="h-14 rounded-2xl bg-[#f4ede1] animate-pulse" aria-hidden="true" />
              ) : (
                <ShipModeSwitch mode={mode} onPick={pick} shipPrice={`from ${fmtCents(baseCents)}`} busy={busy} />
              )}
              <p className="text-[13px] text-[#8a7559]">Sticks until you change it. Lots that can&apos;t ship are pickup.</p>
              {hasOpen && mode === "PICKUP" && <p className="text-[13px] text-[#8a7559]">Your open box still ships as planned.</p>}
              {note && (
                <p className="text-sm font-semibold text-[#2f5d3a] bg-[#4a7c59]/10 border border-[#4a7c59]/25 rounded-xl px-3.5 py-2.5 flex items-center gap-2" role="status">
                  <IcoCheck className="w-4 h-4 shrink-0" /> {note}
                </p>
              )}
              {error && <p className="text-sm text-red-700 font-semibold">{error}</p>}
              <div className="border-t border-[#efe3d0] pt-3 flex items-center justify-between gap-3">
                <div className="min-w-0 text-sm">
                  {address === undefined ? (
                    <p className="text-[#8a7559]">Checking your address</p>
                  ) : address ? (
                    <p className="text-[#241a12] truncate">
                      Ships to <span className="font-semibold">{address.street1}{address.street2 ? `, ${address.street2}` : ""}, {address.city} {address.state}</span>
                    </p>
                  ) : (
                    <p className="text-[#8a7559]">No address yet. Lower 48 only.</p>
                  )}
                  {hasOpen && address && <p className="text-[13px] text-[#8a7559] mt-0.5">Open boxes keep their address.</p>}
                </div>
                <button
                  type="button"
                  onClick={() => { setShipAfterSave(false); setModal(true); }}
                  className="shrink-0 text-sm font-bold text-[#6c4d39] hover:bg-[#faf5ea] border border-[#e3d6bf] rounded-xl px-3.5 py-2 min-h-[44px] transition-colors nb-focus"
                >
                  {address ? "Change" : "Add"}
                </button>
              </div>
            </div>
          </Panel>
          )}
        </div>

        {signedIn && (<>
        {/* ── Boxes ── */}
        <Panel title={boxesTitle}>
          {boxes === null ? (
            <div className="h-28 rounded-2xl bg-white border border-[#e3d6bf] animate-pulse" aria-hidden="true" />
          ) : openBoxes.length === 0 ? (
            <div className="bg-white border border-[#e3d6bf] rounded-2xl px-5 py-5 flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-[#faf5ea] border border-[#e3d6bf] text-[#6c4d39] flex items-center justify-center shrink-0"><IcoBox className="w-5 h-5" /></span>
              <div className="text-sm text-[#6f5b46]">
                <p className="font-display font-bold text-[#241a12] text-base">No open box</p>
                <p className="mt-0.5 leading-relaxed">{mode === "SHIP" ? "Your next win opens one. It stays open 7 days." : "Pick Ship. Your next win opens one."}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {openBoxes.map((b) => <OpenBoxCard key={b.id} box={b} reload={reload} />)}
            </div>
          )}
        </Panel>

        {/* ── Shipped ── */}
        {shipped.length > 0 && (
          <Panel title="Shipped">
            <div className="space-y-4">
              {shipped.map((b) => <ShippedBoxCard key={b.id} box={b} />)}
            </div>
          </Panel>
        )}

        {/* ── Charges ── */}
        <Panel
          title="Charges"
          aside={charges && charges.length > 0 ? (
            <span className="text-sm text-[#6f5b46] tabular-nums shrink-0">
              {money(charges.filter((c) => c.status === "PAID" && !c.refunded).reduce((s, c) => s + c.cents, 0))} paid
            </span>
          ) : undefined}
        >
          <div className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden">
            {charges === null ? (
              <div className="h-16 animate-pulse" aria-hidden="true" />
            ) : charges.length === 0 ? (
              <p className="px-5 py-4 text-sm text-[#6f5b46]">No shipping charges yet. Shipping is billed with the win, never before.</p>
            ) : (
              <ul className="divide-y divide-[#efe3d0]">
                {charges.map((c) => {
                  const refunded = c.status === "REFUNDED" || c.refunded;
                  return (
                  <li key={c.id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 text-sm">
                    <span className="w-[5.5rem] shrink-0 text-[#8a7559] tabular-nums text-[13px]">{fmtDay(c.createdAt)}</span>
                    <span className="min-w-0 flex-1 truncate text-[#241a12]">
                      {c.title}
                      {c.box?.location ? <span className="text-[#8a7559]"> · {c.box.location}</span> : null}
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className={`font-bold ${refunded ? "line-through text-[#8a7559]" : "text-[#241a12]"}`}>{money(c.cents)}</span>
                      {refunded && <span className="block text-[11px] text-[#8a7559]">Refunded</span>}
                      {!refunded && (c.status === "PENDING" || c.status === "FAILED") && <span className="block text-[11px] text-[#8a4f1c] font-semibold">Unpaid</span>}
                    </span>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Panel>
        </>)}

        {/* ── How it works — public, renders before Clerk resolves ── */}
        <Panel id="how" title="How it works">
          <HowItWorks zone={signedIn ? zone : null} />
        </Panel>

        <div className="flex flex-wrap gap-2.5 pb-6">
          <Link href="/pickup" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6f5b46] hover:text-[#241a12] bg-white border border-[#e3d6bf] hover:border-[#cdbda3] px-4 py-2 rounded-xl transition-colors nb-focus">
            <IcoBox className="w-4 h-4" /> Pickup
          </Link>
          <Link href="/auctions" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6f5b46] hover:text-[#241a12] bg-white border border-[#e3d6bf] hover:border-[#cdbda3] px-4 py-2 rounded-xl transition-colors nb-focus">
            Live auctions
          </Link>
        </div>
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
            else { setNote("Address saved."); setTimeout(() => setNote(null), 5000); }
            setShipAfterSave(false);
          }}
        />
      )}
    </main>
  );
}
