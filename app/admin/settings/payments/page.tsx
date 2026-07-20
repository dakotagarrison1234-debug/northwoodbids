"use client";
import { useState, useEffect } from "react";

interface OrgInfo {
  id: string;
  taxPercent: number;
  platformFeePercent: number;
  taxExempt: boolean;
  // Real Stripe state. The status block used to be hardcoded to "Active", so it
  // would happily claim you were accepting payments while charges were disabled.
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

export default function PaymentsSettingsPage() {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable draft values (strings so inputs stay controlled)
  const [premium, setPremium] = useState("");
  const [tax, setTax] = useState("");
  const [taxExempt, setTaxExempt] = useState(false);

  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.org) {
          const o: OrgInfo = {
            id: d.org.id,
            taxPercent: Number(d.org.taxPercent),
            platformFeePercent: Number(d.org.platformFeePercent),
            taxExempt: !!d.org.taxExempt,
            chargesEnabled: !!d.org.stripeChargesEnabled,
            payoutsEnabled: !!d.org.stripePayoutsEnabled,
          };
          setOrg(o);
          setPremium(String(o.platformFeePercent));
          setTax(String(o.taxPercent));
          setTaxExempt(o.taxExempt);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!org) return;
    const premiumNum = Number(premium);
    const taxNum = Number(tax);
    if (!Number.isFinite(premiumNum) || premiumNum < 0 || premiumNum > 100) {
      setBanner({ kind: "error", text: "Buyer's premium must be a number between 0 and 100." });
      return;
    }
    if (!taxExempt && (!Number.isFinite(taxNum) || taxNum < 0 || taxNum > 100)) {
      setBanner({ kind: "error", text: "Sales tax must be a number between 0 and 100." });
      return;
    }
    setSaving(true);
    setBanner(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: org.id,
          platformFeePercent: premiumNum,
          taxPercent: taxNum,
          taxExempt,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setOrg((prev) => ({
          id: data.org.id,
          taxPercent: Number(data.org.taxPercent),
          platformFeePercent: Number(data.org.platformFeePercent),
          taxExempt: !!data.org.taxExempt,
          // Saving fees doesn't change Stripe state — keep what we loaded.
          chargesEnabled: data.org.stripeChargesEnabled ?? prev?.chargesEnabled ?? false,
          payoutsEnabled: data.org.stripePayoutsEnabled ?? prev?.payoutsEnabled ?? false,
        }));
        setBanner({ kind: "success", text: "Saved! Your payment settings are updated." });
      } else {
        setBanner({ kind: "error", text: data.error || "Could not save. Please try again." });
      }
    } catch {
      setBanner({ kind: "error", text: "Something went wrong. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6">Payments</h1>

      {/* Status — read from the real Stripe flags, not hardcoded. */}
      {org && (
        <div className={`border-2 rounded-2xl p-5 mb-5 ${
          org.chargesEnabled ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
        }`}>
          <div className="flex items-center gap-2.5">
            <span className={`w-3 h-3 rounded-full shrink-0 ${org.chargesEnabled ? "bg-green-600" : "bg-red-600"}`} />
            <span className={`font-bold text-lg ${org.chargesEnabled ? "text-green-800" : "text-red-800"}`}>
              {org.chargesEnabled ? "Taking payments" : "NOT taking payments"}
            </span>
          </div>
          <p className={`text-base mt-1.5 ${org.chargesEnabled ? "text-green-900" : "text-red-900"}`}>
            {org.chargesEnabled
              ? "Winners are charged automatically when an auction closes."
              : "Stripe isn't accepting charges on your account. Auctions can't be opened and winners can't be billed until this is fixed."}
          </p>
          {org.chargesEnabled && !org.payoutsEnabled && (
            <p className="text-base text-amber-800 bg-amber-100 border border-amber-200 rounded-xl px-3 py-2 mt-3">
              Payouts are paused — money is being collected but Stripe isn&apos;t transferring it to your bank yet.
            </p>
          )}
          <a
            href="https://dashboard.stripe.com"
            target="_blank"
            rel="noreferrer"
            className="mt-4 w-full inline-flex items-center justify-center min-h-[48px] px-5 rounded-xl bg-white border-2 border-slate-200 text-slate-800 font-bold text-base"
          >
            Open Stripe dashboard ↗
          </a>
        </div>
      )}

      {/* Editable fees & tax */}
      <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 sm:p-7 mb-5">
        <h2 className="text-sm font-semibold text-[#6f5b46] uppercase tracking-wider mb-4">Fees &amp; Sales Tax</h2>

        {loading || !org ? (
          <p className="text-base text-[#8a7559]">Loading…</p>
        ) : (
          <div className="space-y-6">
            {/* Buyer's premium */}
            <div>
              <label htmlFor="premium" className="text-base font-semibold text-[#241a12] mb-1.5 block">
                Buyer&apos;s premium
              </label>
              <p className="text-base text-[#6f5b46] mb-2">
                An extra percentage added on top of each winning bid. The winner pays this.
              </p>
              <div className="relative max-w-[10rem]">
                <input
                  id="premium"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="0.01"
                  value={premium}
                  onChange={(e) => setPremium(e.target.value)}
                  className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl pl-4 pr-10 py-3.5 text-lg text-[#241a12] focus:outline-none focus:border-[#6c4d39]"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8a7559] text-lg">%</span>
              </div>
            </div>

            {/* Sales tax */}
            <div>
              <label htmlFor="tax" className="text-base font-semibold text-[#241a12] mb-1.5 block">
                Sales tax
              </label>
              <p className="text-base text-[#6f5b46] mb-2">
                The percentage of sales tax added to each winning bid.
              </p>
              <div className="relative max-w-[10rem]">
                <input
                  id="tax"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="0.01"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                  disabled={taxExempt}
                  className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl pl-4 pr-10 py-3.5 text-lg text-[#241a12] focus:outline-none focus:border-[#6c4d39] disabled:opacity-50"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8a7559] text-lg">%</span>
              </div>
            </div>

            {/* Tax-exempt toggle */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={taxExempt}
                onChange={(e) => setTaxExempt(e.target.checked)}
                className="mt-1 w-6 h-6 rounded border-[#cdbda3] text-[#6c4d39] focus:ring-[#6c4d39]"
              />
              <span>
                <span className="text-base font-semibold text-[#241a12] block">Tax exempt</span>
                <span className="text-base text-[#6f5b46]">
                  Turn this on if your organization does not collect sales tax. No tax will be added to winning bids.
                </span>
              </span>
            </label>

            {/* A worked example makes these two numbers real. Live-updates as you
                type, so you see the effect before you commit to it. */}
            {(() => {
              const p = Number(premium) || 0;
              const t = taxExempt ? 0 : Number(tax) || 0;
              const bid = 100;
              const prem = bid * p / 100;
              const taxAmt = (bid + prem) * t / 100;
              const total = bid + prem + taxAmt;
              const f = (n: number) => "$" + n.toFixed(2);
              return (
                <div className="bg-slate-900 text-white rounded-2xl p-4">
                  <div className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                    On a $100 winning bid
                  </div>
                  <div className="space-y-1.5 text-base">
                    <div className="flex justify-between"><span className="text-slate-300">Winning bid</span><span className="tabular-nums">{f(bid)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-300">+ Your premium ({p}%)</span><span className="tabular-nums text-green-400">{f(prem)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-300">+ Sales tax ({t}%)</span><span className="tabular-nums">{f(taxAmt)}</span></div>
                    <div className="flex justify-between pt-2 mt-1 border-t border-slate-700 font-bold text-lg">
                      <span>Buyer pays</span><span className="tabular-nums">{f(total)}</span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-400 mt-3">
                    You keep the bid plus {f(prem)} premium. The {f(taxAmt)} tax goes to Michigan.
                  </p>
                </div>
              );
            })()}

            {banner && (
              <div
                className={`rounded-xl px-4 py-3.5 text-base font-bold border-2 ${
                  banner.kind === "success"
                    ? "bg-green-50 border-green-200 text-green-800"
                    : "bg-red-50 border-red-200 text-red-700"
                }`}
              >
                {banner.text}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full min-h-[52px] bg-slate-900 active:bg-slate-800 disabled:opacity-50 text-white text-base font-bold rounded-xl transition-colors"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        )}
      </div>

      {/* The old "How it works" card repeated the status card almost word for word
          and pushed the actual settings into the middle of the page. Removed —
          the worked example above says the same thing with real numbers. */}
      <p className="text-sm text-slate-500 mt-4">
        Bank details and payouts are managed in your Stripe dashboard.
      </p>
    </div>
  );
}
