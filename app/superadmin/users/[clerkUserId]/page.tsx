"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Profile { clerkUserId: string; name: string | null; email: string | null; phone: string | null; }
interface BidItem { id: string; title: string; currentBid: number; status: string; photos: { url: string }[]; auction: { title: string; slug: string; organization: { name: string; slug: string } } | null; }
interface Bid { id: string; amount: number; status: string; isProxy: boolean; placedAt: string; item: BidItem | null; }
interface PaymentItem { id: string; title: string; auction: { title: string; organization: { name: string; id: string } } | null; }
interface Payment { id: string; amount: number; applicationFeeAmount: number | null; taxAmount: number | null; status: string; stripePaymentIntentId: string | null; failureReason: string | null; createdAt: string; item: PaymentItem | null; }
interface Membership { id: string; role: string; organization: { id: string; name: string; slug: string }; }

interface UserDetail {
  profile: Profile | null;
  bids: Bid[];
  payments: Payment[];
  memberships: Membership[];
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-[#09a7ad]/20 text-[#09a7ad]",
  WON: "bg-blue-500/20 text-blue-600",
  OUTBID: "bg-red-500/20 text-red-600",
  CANCELLED: "bg-[#e8e4dc] text-[#6b6659]",
  PAID: "bg-[#09a7ad]/20 text-[#09a7ad]",
  FAILED: "bg-red-500/20 text-red-600",
  PENDING: "bg-yellow-500/20 text-amber-600",
  REFUNDED: "bg-[#e8e4dc] text-[#6b6659]",
};

export default function UserDetailPage() {
  const { clerkUserId } = useParams() as { clerkUserId: string };
  const router = useRouter();
  const [data, setData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"profile" | "bids" | "payments" | "orgs">("profile");

  // Profile edit
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Payment update
  const [updatingPayment, setUpdatingPayment] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/superadmin/users/${clerkUserId}`)
      .then((r) => r.json())
      .then((d: UserDetail) => {
        setData(d);
        setEditName(d.profile?.name || "");
        setEditEmail(d.profile?.email || "");
        setEditPhone(d.profile?.phone || "");
        setLoading(false);
      });
  }, [clerkUserId]);

  useEffect(() => { load(); }, [load]);

  const saveProfile = async () => {
    setSaving(true);
    setSaveMsg(null);
    const res = await fetch(`/api/superadmin/users/${clerkUserId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, email: editEmail, phone: editPhone }),
    });
    const d = await res.json();
    setSaveMsg(d.success ? { text: "Saved.", ok: true } : { text: d.error || "Failed.", ok: false });
    if (d.success) load();
    setSaving(false);
  };

  const updatePayment = async (paymentId: string, status: string) => {
    setUpdatingPayment(paymentId);
    const res = await fetch("/api/superadmin/payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, status }),
    });
    const d = await res.json();
    if (d.success) load();
    setUpdatingPayment(null);
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 rounded-full border-2 border-[#09a7ad]/30 border-t-[#09a7ad] animate-spin" />
      </div>
    );
  }

  const { profile, bids, payments, memberships } = data;
  const wonBids = bids.filter((b) => b.status === "WON");
  const paidTotal = payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <header className="border-b border-[#e5e0d5]/60 px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/superadmin/users" className="text-[#8c8778] hover:text-[#1a1916] text-sm">← Users</Link>
            <span className="text-[#b0a99a]">/</span>
            <h1 className="text-lg font-semibold">{profile?.name || <span className="text-[#8c8778] italic">No name</span>}</h1>
          </div>
          <p className="text-[#8c8778] text-xs mt-0.5 font-mono">{clerkUserId}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#8c8778]">
          <span>{bids.length} bids</span>
          <span>·</span>
          <span>{wonBids.length} won</span>
          <span>·</span>
          <span className="text-[#09a7ad] font-semibold">${paidTotal.toLocaleString()} paid</span>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-[#e5e0d5] px-4 sm:px-8">
        <div className="flex gap-5">
          {(["profile", "bids", "payments", "orgs"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-3 text-sm font-medium border-b-2 capitalize transition-colors ${
                tab === t ? "border-[#09a7ad] text-[#1a1916]" : "border-transparent text-[#8c8778] hover:text-[#4a4640]"
              }`}
            >
              {t === "bids" ? `Bids (${bids.length})` : t === "payments" ? `Payments (${payments.length})` : t === "orgs" ? `Orgs (${memberships.length})` : "Profile"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 sm:px-8 py-6 max-w-4xl">

        {/* ── Profile ── */}
        {tab === "profile" && (
          <div className="space-y-4 max-w-md">
            {[
              { label: "Full Name", value: editName, set: setEditName, placeholder: "Name" },
              { label: "Email Address", value: editEmail, set: setEditEmail, placeholder: "email@example.com" },
              { label: "Phone Number", value: editPhone, set: setEditPhone, placeholder: "+1 555 000 0000" },
            ].map((f) => (
              <div key={f.label}>
                <label className="text-sm text-[#6b6659] mb-1.5 block">{f.label}</label>
                <input
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full bg-white border border-[#d4cfc4] rounded-xl px-4 py-3 text-[#1a1916] placeholder-[#b0a99a] focus:outline-none focus:border-[#09a7ad]"
                />
              </div>
            ))}
            {saveMsg && (
              <p className={`text-sm px-3 py-2 rounded-lg ${saveMsg.ok ? "bg-[#09a7ad]/10 text-[#09a7ad]" : "bg-red-50 text-red-600"}`}>
                {saveMsg.text}
              </p>
            )}
            <button
              onClick={saveProfile}
              disabled={saving}
              className="bg-[#09a7ad] hover:bg-[#0898a0] disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl text-sm"
            >
              {saving ? "Saving…" : "Save Profile"}
            </button>
          </div>
        )}

        {/* ── Bids ── */}
        {tab === "bids" && (
          <div className="space-y-2">
            {bids.length === 0 ? (
              <p className="text-[#8c8778] text-sm py-8 text-center">No bids placed.</p>
            ) : (
              bids.map((bid) => (
                <div key={bid.id} className="bg-white border border-[#e5e0d5] rounded-xl px-4 py-3 flex items-center gap-4">
                  {bid.item?.photos[0] ? (
                    <img src={bid.item.photos[0].url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-[#f2efe8] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{bid.item?.title || "Unknown item"}</div>
                    <div className="text-[#8c8778] text-xs mt-0.5 truncate">
                      {bid.item?.auction?.organization.name} · {bid.item?.auction?.title}
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-3">
                    <div>
                      <div className="text-[#09a7ad] font-semibold text-sm">${bid.amount.toLocaleString()}</div>
                      <div className="text-[#8c8778] text-xs">{new Date(bid.placedAt).toLocaleDateString()}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[bid.status] || "bg-[#e8e4dc] text-[#6b6659]"}`}>
                      {bid.status}
                    </span>
                    {bid.isProxy && <span className="text-xs text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">proxy</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Payments ── */}
        {tab === "payments" && (
          <div className="space-y-2">
            {payments.length === 0 ? (
              <p className="text-[#8c8778] text-sm py-8 text-center">No payment records.</p>
            ) : (
              payments.map((p) => (
                <div key={p.id} className="bg-white border border-[#e5e0d5] rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{p.item?.title || "Unknown item"}</div>
                      <div className="text-[#8c8778] text-xs mt-0.5">{p.item?.auction?.organization.name} · {new Date(p.createdAt).toLocaleDateString()}</div>
                      {p.failureReason && <div className="text-red-600 text-xs mt-1">{p.failureReason}</div>}
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-3">
                      <div>
                        <div className="font-semibold text-sm">${p.amount.toLocaleString()}</div>
                        {p.taxAmount ? <div className="text-[#8c8778] text-xs">+${p.taxAmount} tax</div> : null}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] || "bg-[#e8e4dc] text-[#6b6659]"}`}>
                        {p.status}
                      </span>
                      <select
                        value={p.status}
                        disabled={updatingPayment === p.id}
                        onChange={(e) => updatePayment(p.id, e.target.value)}
                        className="bg-[#f2efe8] border border-[#d4cfc4] rounded-lg px-2 py-1 text-xs text-[#1a1916] focus:outline-none disabled:opacity-50"
                      >
                        <option value="PENDING">PENDING</option>
                        <option value="PAID">PAID</option>
                        <option value="FAILED">FAILED</option>
                        <option value="REFUNDED">REFUNDED</option>
                      </select>
                    </div>
                  </div>
                  {p.stripePaymentIntentId && (
                    <div className="text-[#b0a99a] text-xs mt-2 font-mono truncate">{p.stripePaymentIntentId}</div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Orgs ── */}
        {tab === "orgs" && (
          <div className="space-y-2">
            {memberships.length === 0 ? (
              <p className="text-[#8c8778] text-sm py-8 text-center">Not a member of any organization.</p>
            ) : (
              memberships.map((m) => (
                <div key={m.id} className="bg-white border border-[#e5e0d5] rounded-xl px-5 py-4 flex items-center justify-between">
                  <div>
                    <Link href={`/superadmin/orgs/${m.organization.id}`} className="font-medium hover:text-[#09a7ad] transition-colors">
                      {m.organization.name}
                    </Link>
                    <div className="text-[#8c8778] text-xs mt-0.5">/{m.organization.slug}</div>
                  </div>
                  <span className="text-xs bg-[#f2efe8] text-[#4a4640] px-3 py-1 rounded-full font-medium">{m.role}</span>
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </>
  );
}
