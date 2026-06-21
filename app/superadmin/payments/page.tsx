"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface OrgRevenue {
  orgId: string;
  orgName: string;
  orgSlug: string;
  platformRevenue: number;
  feeCount: number;
  lastActivity: number;
}

interface Issue {
  id: string;
  clerkUserId: string;
  amount: number;
  applicationFeeAmount: number | null;
  status: string;
  failureReason: string | null;
  createdAt: string;
  item: {
    id: string;
    title: string;
    auction: {
      title: string;
      organization: { id: string; name: string; slug: string } | null;
    } | null;
  } | null;
  user: { clerkUserId: string; name: string | null; email: string | null } | null;
}

interface RevenueData {
  totalRevenue: number;
  unattributedRevenue: number;
  stripeAvailable: number;
  stripePending: number;
  feeCount: number;
  orgs: OrgRevenue[];
  issues: Issue[];
  fetchedAt: string;
}

export default function SuperAdminPaymentsPage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"revenue" | "attention">("revenue");
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/superadmin/revenue")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const updatePayment = async (paymentId: string, status: string) => {
    setUpdating(paymentId);
    const res = await fetch("/api/superadmin/payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, status }),
    });
    const d = await res.json();
    if (d.success) load();
    setUpdating(null);
  };

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <>
      {/* Header */}
      <header className="border-b border-[#e3d6bf]/60 px-4 sm:px-8 py-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold">Revenue</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[#8a7559] text-sm">Live from Stripe</span>
            {data?.fetchedAt && (
              <span className="text-[10px] text-[#b3a085]">· as of {new Date(data.fetchedAt).toLocaleTimeString()}</span>
            )}
            <button onClick={load} disabled={loading} className="text-[10px] text-[#6c4d39] hover:underline disabled:opacity-40">
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("revenue")}
            className={`text-xs px-4 py-2 rounded-xl font-semibold transition-colors ${
              view === "revenue"
                ? "bg-[#6c4d39] text-white"
                : "bg-[#efe3d0] text-[#6f5b46] hover:text-[#241a12] border border-[#cdbda3]"
            }`}
          >
            By Organization
          </button>
          <button
            onClick={() => setView("attention")}
            className={`text-xs px-4 py-2 rounded-xl font-semibold transition-colors flex items-center gap-1.5 ${
              view === "attention"
                ? "bg-red-500 text-white"
                : "bg-[#efe3d0] text-[#6f5b46] hover:text-[#241a12] border border-[#cdbda3]"
            }`}
          >
            Needs Attention
            {(data?.issues.length ?? 0) > 0 && (
              <span className={`text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold ${
                view === "attention" ? "bg-white text-red-500" : "bg-red-500 text-white"
              }`}>
                {data!.issues.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Stripe-verified stat cards */}
      <div className="px-4 sm:px-8 pt-5 pb-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-[#e3d6bf] rounded-2xl px-4 py-3.5">
          <div className="text-xs text-[#8a7559] font-medium mb-1">My Revenue</div>
          <div className="text-xl font-extrabold text-[#6c4d39]">
            {loading ? <span className="text-[#cdbda3]">—</span> : `$${fmt(data?.totalRevenue ?? 0)}`}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] text-[#6c4d39]/60 font-semibold">✓ Stripe verified</span>
          </div>
        </div>

        <div className="bg-white border border-[#e3d6bf] rounded-2xl px-4 py-3.5">
          <div className="text-xs text-[#8a7559] font-medium mb-1">Available Balance</div>
          <div className="text-xl font-extrabold text-[#241a12]">
            {loading ? <span className="text-[#cdbda3]">—</span> : `$${fmt(data?.stripeAvailable ?? 0)}`}
          </div>
          <div className="text-[10px] text-[#b3a085] mt-0.5">ready to pay out</div>
        </div>

        <div className="bg-white border border-[#e3d6bf] rounded-2xl px-4 py-3.5">
          <div className="text-xs text-[#8a7559] font-medium mb-1">Stripe Pending</div>
          <div className="text-xl font-extrabold text-amber-500">
            {loading ? <span className="text-[#cdbda3]">—</span> : `$${fmt(data?.stripePending ?? 0)}`}
          </div>
          <div className="text-[10px] text-[#b3a085] mt-0.5">in transit</div>
        </div>

        <div className={`bg-white border rounded-2xl px-4 py-3.5 ${(data?.issues.length ?? 0) > 0 ? "border-red-500/25" : "border-[#e3d6bf]"}`}>
          <div className="text-xs text-[#8a7559] font-medium mb-1">Issues</div>
          <div className={`text-xl font-extrabold ${(data?.issues.length ?? 0) > 0 ? "text-red-500" : "text-[#241a12]"}`}>
            {loading ? <span className="text-[#cdbda3]">—</span> : (data?.issues.length ?? 0)}
          </div>
          <div className="text-[10px] text-[#b3a085] mt-0.5">failed or pending</div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-4 max-w-5xl">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-[#6c4d39]/30 border-t-[#6c4d39] animate-spin" />
            <span className="text-sm text-[#8a7559]">Fetching from Stripe…</span>
          </div>
        ) : view === "revenue" ? (
          /* ── BY ORG VIEW ── */
          !data || data.orgs.length === 0 ? (
            <div className="bg-white border border-[#e3d6bf] rounded-2xl p-8 text-center text-[#8a7559] text-sm">
              No revenue yet.
            </div>
          ) : (
            <div className="space-y-2">
              {/* Column headers */}
              <div className="hidden sm:grid grid-cols-[1fr_140px_80px_100px] gap-4 px-4 text-xs text-[#8a7559] font-semibold uppercase tracking-wide pb-1">
                <span>Organization</span>
                <span className="text-right text-[#6c4d39]">My Cut (Stripe)</span>
                <span className="text-right">Charges</span>
                <span className="text-right">Last Activity</span>
              </div>

              {data.orgs.map((org) => (
                <div key={org.orgId} className="bg-white border border-[#e3d6bf] rounded-xl px-4 sm:px-5 py-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_80px_100px] gap-3 sm:gap-4 items-center">
                    <div>
                      <Link
                        href={`/superadmin/orgs/${org.orgId}`}
                        className="font-semibold text-sm hover:text-[#6c4d39] transition-colors"
                      >
                        {org.orgName}
                      </Link>
                    </div>
                    <div className="sm:text-right">
                      <span className="text-sm font-bold text-[#6c4d39]">${fmt(org.platformRevenue)}</span>
                    </div>
                    <div className="sm:text-right text-sm text-[#6f5b46]">{org.feeCount}</div>
                    <div className="sm:text-right text-xs text-[#8a7559]">
                      {org.lastActivity ? new Date(org.lastActivity * 1000).toLocaleDateString() : "—"}
                    </div>
                  </div>
                </div>
              ))}

              {/* Unattributed (old test data or edge cases) */}
              {data.unattributedRevenue > 0 && (
                <div className="bg-[#efe3d0] border border-[#e3d6bf] rounded-xl px-4 sm:px-5 py-3 text-sm text-[#8a7559] flex items-center justify-between">
                  <span>Unattributed fees (no matching payment record)</span>
                  <span className="font-semibold">${fmt(data.unattributedRevenue)}</span>
                </div>
              )}

              {/* Total row */}
              <div className="bg-white border border-[#6c4d39]/20 rounded-xl px-4 sm:px-5 py-3.5 flex items-center justify-between">
                <span className="text-sm font-bold text-[#241a12]">Total ({data.feeCount} charges)</span>
                <span className="text-base font-extrabold text-[#6c4d39]">${fmt(data.totalRevenue)}</span>
              </div>
            </div>
          )
        ) : (
          /* ── NEEDS ATTENTION VIEW ── */
          !data || data.issues.length === 0 ? (
            <div className="bg-white border border-[#e3d6bf] rounded-2xl p-8 text-center text-[#8a7559] text-sm">
              No failed or pending payments.
            </div>
          ) : (
            <div className="space-y-2">
              {data.issues.map((p) => {
                const org = p.item?.auction?.organization;
                return (
                  <div
                    key={p.id}
                    className={`bg-white border rounded-xl px-4 sm:px-5 py-3.5 ${
                      p.status === "FAILED" ? "border-red-500/25" : "border-amber-400/25"
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {org && (
                            <Link href={`/superadmin/orgs/${org.id}`} className="font-semibold text-sm hover:text-[#6c4d39] transition-colors">
                              {org.name}
                            </Link>
                          )}
                          {p.item?.auction && <span className="text-xs text-[#8a7559]">· {p.item.auction.title}</span>}
                        </div>
                        <div className="text-xs text-[#8a7559] mt-0.5">
                          {p.user?.name || "Unknown bidder"}
                          {p.user?.email && ` · ${p.user.email}`}
                        </div>
                        {p.failureReason && <div className="text-red-500 text-xs mt-1">{p.failureReason}</div>}
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-bold text-sm">${p.amount.toFixed(2)}</div>
                        {p.applicationFeeAmount && (
                          <div className="text-[#6c4d39] text-xs">${p.applicationFeeAmount.toFixed(2)} my cut</div>
                        )}
                      </div>

                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 ${
                        p.status === "FAILED" ? "bg-red-500/15 text-red-600" : "bg-amber-400/15 text-amber-600"
                      }`}>
                        {p.status}
                      </span>

                      <select
                        value={p.status}
                        disabled={updating === p.id}
                        onChange={(e) => updatePayment(p.id, e.target.value)}
                        className="bg-[#efe3d0] border border-[#cdbda3] rounded-lg px-2 py-1.5 text-xs text-[#241a12] focus:outline-none disabled:opacity-50 shrink-0"
                      >
                        <option value="PENDING">PENDING</option>
                        <option value="PAID">PAID</option>
                        <option value="FAILED">FAILED</option>
                        <option value="REFUNDED">REFUNDED</option>
                      </select>

                      <div className="text-[#8a7559] text-xs shrink-0 hidden sm:block">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </>
  );
}
