"use client";
import { useState, useEffect } from "react";
import { PageHeader, PageBody, Panel, Btn, Input, Notice, Eyebrow, Disclosure } from "../../ui";

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
        setBanner({ kind: "success", text: "Saved." });
      } else {
        setBanner({ kind: "error", text: data.error || "Could not save. Please try again." });
      }
    } catch {
      setBanner({ kind: "error", text: "Something went wrong. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  // A worked example makes the two percentages real. Live-updates as you type.
  const p = Number(premium) || 0;
  const t = taxExempt ? 0 : Number(tax) || 0;
  const bid = 100;
  const prem = bid * p / 100;
  const taxAmt = (bid + prem) * t / 100;
  const total = bid + prem + taxAmt;
  const f = (n: number) => "$" + n.toFixed(2);

  return (
    <>
      <PageHeader title="Settings" />

      <PageBody>
        {/* Status — read from the real Stripe flags, not hardcoded. */}
        {org && (
          <Panel tone={org.chargesEnabled ? "green" : "red"}>
            <div className={`p-4 sm:p-5 ${org.chargesEnabled ? "bg-[#e6f1e8]" : "bg-[#fbeae6]"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className={`w-3 h-3 rounded-full shrink-0 ${org.chargesEnabled ? "bg-[#4a7c59]" : "bg-[#c0392b]"}`} />
                  <span className={`font-display font-black text-xl ${org.chargesEnabled ? "text-[#2f5d3a]" : "text-[#a1321f]"}`}>
                    {org.chargesEnabled ? "Taking payments" : "Not taking payments"}
                  </span>
                </div>
                <a
                  href="https://dashboard.stripe.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-white border-2 border-[#d9c7ab] text-[#563e2c] hover:bg-[#faf5ea] font-bold text-[15px] transition-colors"
                >
                  Open Stripe dashboard
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12L12 4M6 4h6v6" /></svg>
                </a>
              </div>
              {org.chargesEnabled && !org.payoutsEnabled && (
                <Notice tone="amber" className="mt-3">
                  Payouts are paused — Stripe isn&apos;t transferring money to your bank yet.
                </Notice>
              )}
            </div>
          </Panel>
        )}

        {/* Editable fees & tax */}
        <Panel title="Fees and sales tax">
          <div className="p-4 sm:p-5">
            {loading || !org ? (
              <p className="text-[#8a7559]">Loading…</p>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="premium" className="font-bold text-[#241a12] mb-1 block">
                      Buyer&apos;s premium
                    </label>
                    <div className="relative">
                      <Input
                        id="premium"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step="0.01"
                        value={premium}
                        onChange={(e) => setPremium(e.target.value)}
                        className="pr-10 font-display text-2xl font-black tabular-nums"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8a7559] text-lg">%</span>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="tax" className="font-bold text-[#241a12] mb-1 block">
                      Sales tax
                    </label>
                    <div className="relative">
                      <Input
                        id="tax"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step="0.01"
                        value={tax}
                        onChange={(e) => setTax(e.target.value)}
                        disabled={taxExempt}
                        className="pr-10 font-display text-2xl font-black tabular-nums disabled:opacity-50"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8a7559] text-lg">%</span>
                    </div>
                  </div>
                </div>

                {banner && <Notice tone={banner.kind === "success" ? "green" : "red"}>{banner.text}</Notice>}

                <Btn full onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Btn>

                <Disclosure label="More">
                  <div className="p-4 space-y-4">
                    {/* Tax-exempt toggle */}
                    <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
                      <input
                        type="checkbox"
                        checked={taxExempt}
                        onChange={(e) => setTaxExempt(e.target.checked)}
                        className="w-6 h-6 rounded border-[#d9c7ab] accent-[#6c4d39] focus:ring-[#6c4d39]"
                      />
                      <span className="font-bold text-[#241a12]">Tax exempt (no sales tax added)</span>
                    </label>

                    <div className="bg-[#241a12] text-[#fbf4e6] rounded-2xl p-4">
                      <Eyebrow className="!text-[#b9a688] mb-2.5">On a $100 winning bid</Eyebrow>
                      <div className="space-y-1.5">
                        <div className="flex justify-between"><span className="text-[#c9b79a]">Winning bid</span><span className="tabular-nums">{f(bid)}</span></div>
                        <div className="flex justify-between"><span className="text-[#c9b79a]">+ Your premium ({p}%)</span><span className="tabular-nums text-[#8fd19e]">{f(prem)}</span></div>
                        <div className="flex justify-between"><span className="text-[#c9b79a]">+ Sales tax ({t}%)</span><span className="tabular-nums">{f(taxAmt)}</span></div>
                        <div className="flex justify-between pt-2 mt-1 border-t border-[#3a2b1f] font-display font-black text-lg">
                          <span>Buyer pays</span><span className="tabular-nums">{f(total)}</span>
                        </div>
                      </div>
                      <p className="text-[15px] text-[#b9a688] mt-3">
                        You keep the bid plus {f(prem)} premium. The {f(taxAmt)} tax goes to Michigan.
                      </p>
                    </div>
                  </div>
                </Disclosure>
              </div>
            )}
          </div>
        </Panel>
      </PageBody>
    </>
  );
}
