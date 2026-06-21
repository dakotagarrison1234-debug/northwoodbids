"use client";
import { useState, useEffect } from "react";

interface OrgInfo {
  taxPercent: number;
  taxExempt: boolean;
}

export default function PaymentsSettingsPage() {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => { if (d.org) setOrg(d.org); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
          when an auction closes — no platform fee.
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

      {/* Sales Tax */}
      <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 sm:p-7 mb-5">
        <h2 className="text-sm font-semibold text-[#6f5b46] uppercase tracking-wider mb-3">Sales Tax</h2>
        {loading || !org ? (
          <p className="text-base text-[#8a7559]">Loading…</p>
        ) : (
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${org.taxExempt ? "bg-[#5f7a45]" : "bg-amber-500"}`} />
            <span className="text-base text-[#4a3a2b]">
              {org.taxExempt
                ? "Tax exempt — no sales tax collected"
                : `Sales tax: ${Number(org.taxPercent)}% added to each winning bid`}
            </span>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 sm:p-7">
        <h2 className="text-sm font-semibold text-[#6f5b46] uppercase tracking-wider mb-3">How it works</h2>
        <ul className="text-base text-[#6f5b46] space-y-2 list-disc pl-5">
          <li>Payments run directly through your Stripe account — no platform fee.</li>
          <li>Winners are charged automatically the moment an auction closes.</li>
          <li>Bidders pay the winning bid plus any applicable sales tax.</li>
          <li>Payouts and bank details are managed in your Stripe Dashboard.</li>
        </ul>
      </div>
    </div>
  );
}
