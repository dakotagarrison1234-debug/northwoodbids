"use client";
import { useState, useEffect } from "react";

interface OrgInfo {
  id: string;
  taxPercent: number;
  platformFeePercent: number;
  taxExempt: boolean;
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
        setOrg({
          id: data.org.id,
          taxPercent: Number(data.org.taxPercent),
          platformFeePercent: Number(data.org.platformFeePercent),
          taxExempt: !!data.org.taxExempt,
        });
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

      {/* Status */}
      <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 sm:p-7 mb-5">
        <h2 className="text-sm font-semibold text-[#6f5b46] uppercase tracking-wider mb-4">Status</h2>
        <div className="flex items-center mb-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 bg-[#5f7a45]" />
          <span className="text-[#241a12] font-semibold text-base">Active — accepting payments</span>
        </div>
        <p className="text-base text-[#6f5b46]">
          Payments run directly through your Stripe account. Winners are charged automatically
          when an auction closes — winning bid + buyer&apos;s premium + tax.
        </p>
        <a
          href="https://dashboard.stripe.com"
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-4 bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] text-[#241a12] text-base font-semibold px-6 py-3.5 rounded-xl transition-colors"
        >
          Open Stripe Dashboard
        </a>
      </div>

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

            {banner && (
              <div
                className={`rounded-xl px-4 py-3.5 text-base font-medium ${
                  banner.kind === "success"
                    ? "bg-[#5f7a45]/10 border border-[#5f7a45]/30 text-[#3f5430]"
                    : "bg-red-50 border border-red-200 text-red-700"
                }`}
              >
                {banner.text}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white text-base font-semibold px-7 py-3.5 rounded-xl transition-colors"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 sm:p-7">
        <h2 className="text-sm font-semibold text-[#6f5b46] uppercase tracking-wider mb-3">How it works</h2>
        <ul className="text-base text-[#6f5b46] space-y-2 list-disc pl-5">
          <li>Payments run directly through your Stripe account.</li>
          <li>Winners are charged automatically the moment an auction closes.</li>
          {org && (
            <li>
              Bidders pay the winning bid + {Number(org.platformFeePercent)}% buyer&apos;s premium
              {org.taxExempt ? " (no sales tax)" : ` + ${Number(org.taxPercent)}% sales tax`}.
            </li>
          )}
          <li>Payouts and bank details are managed in your Stripe Dashboard.</li>
        </ul>
      </div>
    </div>
  );
}
