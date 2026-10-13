"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IcoTruck } from "./BidIcons";

export type ShipAddress = {
  name: string; street1: string; street2: string | null; city: string; state: string; zip: string; phone: string | null;
};

/**
 * First tap on "Ship": where it's going, plus how shipping works in three lines.
 * Save → POST /api/shipping/address (lower 48 only, EasyPost-verified when the
 * key is set) → onSaved. If the buyer already has an OPEN box (its address is
 * frozen), the modal says the change applies to their next box before closing.
 * Bottom sheet on phones, centered card on desktop.
 */
export default function ShippingAddressModal({
  initial,
  howItWorks,
  onSaved,
  onClose,
}: {
  initial?: Partial<ShipAddress> | null;
  howItWorks: string[];
  onSaved: (address: ShipAddress) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    street1: initial?.street1 ?? "",
    street2: initial?.street2 ?? "",
    city: initial?.city ?? "",
    state: initial?.state ?? "",
    zip: initial?.zip ?? "",
    phone: initial?.phone ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Saved while a box is open: hold the sheet to show the "next box" note.
  const [savedForNext, setSavedForNext] = useState<ShipAddress | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: k === "state" ? e.target.value.toUpperCase().slice(0, 2) : e.target.value }));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/shipping/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) {
        setError(d.error || "Couldn't save that address.");
        return;
      }
      if (d.appliesToNextBox) { setSavedForNext(d.address as ShipAddress); return; }
      onSaved(d.address as ShipAddress);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full bg-white border border-[#cdbda3] rounded-xl px-3.5 py-2.5 text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39] text-base";
  const label = "block text-[11px] font-black uppercase tracking-[0.14em] text-[#8a7559] mb-1";

  return createPortal(
    <div
      className="fixed inset-0 z-[9500] bg-[#241a12]/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ship-address-title"
    >
      <div className="bg-[#fbf4e6] w-full sm:max-w-md max-h-[94vh] rounded-t-3xl sm:rounded-3xl shadow-[0_24px_60px_-24px_rgba(36,26,18,0.7)] overflow-hidden border border-[#e3d6bf] nb-rise flex flex-col">
        {/* Header band */}
        <div className="relative px-5 pt-5 pb-4 text-[#f6ecda] shrink-0" style={{ background: "linear-gradient(140deg,#241a12,#3a2a1b)" }}>
          <div className="sm:hidden mx-auto mb-3 h-1 w-10 rounded-full bg-[#f6ecda]/30" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f0a35a] inline-flex items-center gap-1.5">
                <IcoTruck className="w-3.5 h-3.5" /> Ship it
              </p>
              <h2 id="ship-address-title" className="font-display text-xl font-black leading-tight mt-0.5">Where should your box go?</h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-full grid place-items-center text-[#f6ecda]/70 hover:text-[#f6ecda] hover:bg-white/10 transition-colors shrink-0 -mr-1 -mt-1"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        {savedForNext ? (
          <div className="px-5 pt-4 pb-5 space-y-3">
            <p className="text-sm font-semibold text-[#241a12]">Address saved.</p>
            <p className="text-sm text-[#4a3a2b] leading-snug">
              Your open box keeps the address it opened with — this one applies to your next box.
            </p>
            <button
              onClick={() => onSaved(savedForNext)}
              className="w-full bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold py-3 rounded-xl transition-colors"
            >
              Got it
            </button>
          </div>
        ) : (
        <div className="overflow-y-auto px-5 pt-4 pb-5 space-y-3">
          {/* How it works — three lines, nothing more. */}
          <ol className="space-y-1.5 text-sm text-[#4a3a2b]">
            {howItWorks.map((line, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#6c4d39] text-[#f6ecda] text-[11px] font-black grid place-items-center shrink-0 mt-0.5 tabular-nums">{i + 1}</span>
                <span className="leading-snug">{line}</span>
              </li>
            ))}
          </ol>

          <div className="border-t border-[#e3d6bf] pt-3 space-y-2.5">
            <div>
              <label htmlFor="ship-name" className={label}>Name</label>
              <input id="ship-name" value={form.name} onChange={set("name")} autoComplete="name" className={field} />
            </div>
            <div>
              <label htmlFor="ship-street1" className={label}>Street</label>
              <input id="ship-street1" value={form.street1} onChange={set("street1")} autoComplete="address-line1" className={field} />
            </div>
            <div>
              <label htmlFor="ship-street2" className={label}>Apt / unit <span className="normal-case tracking-normal font-semibold">(optional)</span></label>
              <input id="ship-street2" value={form.street2} onChange={set("street2")} autoComplete="address-line2" className={field} />
            </div>
            <div className="grid grid-cols-[1fr_60px_minmax(9ch,104px)] gap-2">
              <div>
                <label htmlFor="ship-city" className={label}>City</label>
                <input id="ship-city" value={form.city} onChange={set("city")} autoComplete="address-level2" className={field} />
              </div>
              <div>
                <label htmlFor="ship-state" className={label}>State</label>
                <input id="ship-state" value={form.state} onChange={set("state")} autoComplete="address-level1" maxLength={2} placeholder="MI" className={`${field} uppercase text-center !px-2`} />
              </div>
              <div>
                <label htmlFor="ship-zip" className={label}>ZIP</label>
                <input id="ship-zip" value={form.zip} onChange={set("zip")} autoComplete="postal-code" inputMode="numeric" maxLength={10} className={`${field} tabular-nums !px-2.5 min-w-[9ch]`} />
              </div>
            </div>
            <div>
              <label htmlFor="ship-phone" className={label}>Phone <span className="normal-case tracking-normal font-semibold">(optional, for the carrier)</span></label>
              <input id="ship-phone" value={form.phone} onChange={set("phone")} autoComplete="tel" inputMode="tel" className={field} />
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-3.5 py-2.5">{error}</div>
          )}

          <button
            onClick={save}
            disabled={saving}
            className="w-full bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
          >
            {saving ? "Saving…" : "Save address"}
          </button>
          <p className="text-[11px] text-[#8a7559] text-center">Lower 48 only. Nothing is charged until you win a lot with Ship selected.</p>
        </div>
        )}
      </div>
    </div>,
    document.body
  );
}
