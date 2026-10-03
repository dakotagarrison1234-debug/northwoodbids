"use client";
import { useState, useEffect } from "react";
import { PageHeader, PageBody, Panel, Btn, Input, Notice, Eyebrow } from "../../ui";

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
    <>
      <PageHeader title="Settings" sub="Payments and business setup." />

      <PageBody>
        {/* Status — read from the real Stripe flags, not hardcoded. */}
        {org && (
          <Panel tone={org.chargesEnabled ? "green" : "red"}>
            <div className={`p-4 sm:p-5 ${org.chargesEnabled ? "bg-[#e6f1e8]" : "bg-[#fbeae6]"}`}>
              <div className="flex items-center gap-2.5">
                <span className={`w-3 h-3 rounded-full shrink-0 ${org.chargesEnabled ? "bg-[#4a7c59]" : "bg-[#c0392b]"}`} />
                <span className={`font-display font-black text-xl ${org.chargesEnabled ? "text-[#2f5d3a]" : "text-[#a1321f]"}`}>
                  {org.chargesEnabled ? "Taking payments" : "NOT taking payments"}
                </span>
              </div>
              <p className={`text-base mt-1.5 ${org.chargesEnabled ? "text-[#2f5d3a]" : "text-[#a1321f]"}`}>
                {org.chargesEnabled
                  ? "Winners are charged automatically when an auction closes."
                  : "Stripe isn't accepting charges on your account. Auctions can't be opened and winners can't be billed until this is fixed."}
              </p>
              {org.chargesEnabled && !org.payoutsEnabled && (
                <Notice tone="amber" className="mt-3">
                  Payouts are paused — money is being collected but Stripe isn&apos;t transferring it to your bank yet.
                </Notice>
              )}
              <a
                href="https://dashboard.stripe.com"
                target="_blank"
                rel="noreferrer"
                className="mt-4 w-full inline-flex items-center justify-center gap-2 min-h-[48px] px-5 rounded-xl bg-white border-2 border-[#d9c7ab] text-[#563e2c] hover:bg-[#faf5ea] font-bold text-base transition-colors"
              >
                Open Stripe dashboard
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12L12 4M6 4h6v6" /></svg>
              </a>
            </div>
          </Panel>
        )}

        {/* Editable fees & tax */}
        <Panel title="Fees & sales tax" sub="What gets added on top of every winning bid.">
          <div className="p-4 sm:p-5">
            {loading || !org ? (
              <p className="text-base text-[#8a7559]">Loading…</p>
            ) : (
              <div className="space-y-6">
                {/* Buyer's premium */}
                <div>
                  <label htmlFor="premium" className="text-base font-bold text-[#241a12] mb-1 block">
                    Buyer&apos;s premium
                  </label>
                  <p className="text-sm text-[#8a7559] mb-2">
                    An extra percentage added on top of each winning bid. The winner pays this.
                  </p>
                  <div className="relative max-w-[10rem]">
                    <Input
                      id="premium"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step="0.01"
                      value={premium}
                      onChange={(e) => setPremium(e.target.value)}
                      className="pr-10 text-lg font-bold tabular-nums"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8a7559] text-lg">%</span>
                  </div>
                </div>

                {/* Sales tax */}
                <div>
                  <label htmlFor="tax" className="text-base font-bold text-[#241a12] mb-1 block">
                    Sales tax
                  </label>
                  <p className="text-sm text-[#8a7559] mb-2">
                    The percentage of sales tax added to each winning bid.
                  </p>
                  <div className="relative max-w-[10rem]">
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
                      className="pr-10 text-lg font-bold tabular-nums disabled:opacity-50"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8a7559] text-lg">%</span>
                  </div>
                </div>

                {/* Tax-exempt toggle */}
                <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={taxExempt}
                    onChange={(e) => setTaxExempt(e.target.checked)}
                    className="mt-0.5 w-6 h-6 rounded border-[#d9c7ab] accent-[#6c4d39] focus:ring-[#6c4d39]"
                  />
                  <span>
                    <span className="text-base font-bold text-[#241a12] block">Tax exempt</span>
                    <span className="text-sm text-[#8a7559]">
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
                    <div className="bg-[#241a12] text-[#fbf4e6] rounded-2xl p-4">
                      <Eyebrow className="!text-[#b9a688] mb-2.5">On a $100 winning bid</Eyebrow>
                      <div className="space-y-1.5 text-base">
                        <div className="flex justify-between"><span className="text-[#c9b79a]">Winning bid</span><span className="tabular-nums">{f(bid)}</span></div>
                        <div className="flex justify-between"><span className="text-[#c9b79a]">+ Your premium ({p}%)</span><span className="tabular-nums text-[#8fd19e]">{f(prem)}</span></div>
                        <div className="flex justify-between"><span className="text-[#c9b79a]">+ Sales tax ({t}%)</span><span className="tabular-nums">{f(taxAmt)}</span></div>
                        <div className="flex justify-between pt-2 mt-1 border-t border-[#3a2b1f] font-display font-black text-lg">
                          <span>Buyer pays</span><span className="tabular-nums">{f(total)}</span>
                        </div>
                      </div>
                      <p className="text-sm text-[#b9a688] mt-3">
                        You keep the bid plus {f(prem)} premium. The {f(taxAmt)} tax goes to Michigan.
                      </p>
                    </div>
                  );
                })()}

                {banner && (
                  <Notice tone={banner.kind === "success" ? "green" : "red"}>{banner.text}</Notice>
                )}

                <Btn full onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Btn>
              </div>
            )}
          </div>
        </Panel>

        {/* The old "How it works" card repeated the status card almost word for word
            and pushed the actual settings into the middle of the page. Removed —
            the worked example above says the same thing with real numbers. */}
        <p className="text-sm text-[#8a7559]">
          Bank details and payouts are managed in your Stripe dashboard.
        </p>
      </PageBody>
    </>
  );
}
