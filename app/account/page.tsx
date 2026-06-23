"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import CardSetupModal from "@/app/components/CardSetupModal";
import { AVATARS, Avatar } from "@/app/components/Avatars";

interface Profile { name: string | null; email: string | null; phone: string | null; }
interface PaymentMethod {
  orgId: string;
  orgName: string;
  orgSlug: string;
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  hasCard: boolean;
  last4: string | null;
  brand: string | null;
}

function IcoArrowLeft() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3L5 8l5 5" />
    </svg>
  );
}
function IcoCard() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}
function IcoUser() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

export default function AccountPage() {
  const { user, isSignedIn, isLoaded } = useUser();
  const router = useRouter();

  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [avatarKey, setAvatarKey] = useState<string | null>(null);
  const [switchingAvatar, setSwitchingAvatar] = useState(false);

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loadingPMs, setLoadingPMs] = useState(true);
  const [cardModal, setCardModal] = useState<{ orgId: string; stripeAccountId: string } | null>(null);
  const [pmMsg, setPmMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.push("/sign-in?redirect_url=/account"); return; }

    fetch("/api/my-bids")
      .then(r => r.json())
      .then(d => {
        const p: Profile = d.profile ?? { name: null, email: null, phone: null };
        setEditName(p.name || "");
        setEditEmail(p.email || user?.primaryEmailAddress?.emailAddress || "");
        setEditPhone(p.phone || "");
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false));

    fetch("/api/profile")
      .then(r => r.json())
      .then(d => setAvatarKey(d.profile?.avatarKey ?? null))
      .catch(() => {});
  }, [isLoaded, isSignedIn, router, user]);

  const persistAvatar = async (next: string | null) => {
    setAvatarKey(next);
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarKey: next }),
      });
    } catch { /* non-critical; UI already updated */ }
  };
  const selectAvatar = (key: string) => { persistAvatar(key); setSwitchingAvatar(false); };
  const removeAvatar = () => { persistAvatar(null); setSwitchingAvatar(false); };

  const loadPaymentMethods = useCallback(() => {
    setLoadingPMs(true);
    fetch("/api/payment-methods")
      .then(r => r.json())
      .then(d => setPaymentMethods(d.paymentMethods ?? []))
      .catch(() => {})
      .finally(() => setLoadingPMs(false));
  }, []);

  useEffect(() => {
    if (isSignedIn) loadPaymentMethods();
  }, [isSignedIn, loadPaymentMethods]);

  const saveProfile = async () => {
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, email: editEmail, phone: editPhone }),
      });
      const d = await res.json();
      setProfileMsg(d.success
        ? { text: "Profile saved.", ok: true }
        : { text: d.error || "Failed to save.", ok: false }
      );
    } catch {
      setProfileMsg({ text: "Something went wrong.", ok: false });
    } finally {
      setSavingProfile(false);
    }
  };

  if (!isLoaded || loadingProfile) {
    return (
      <main className="min-h-screen bg-[#f1e7d5] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#6c4d39]/30 border-t-[#6c4d39] animate-spin" />
      </main>
    );
  }

  const initials = (
    user?.firstName?.[0] ||
    user?.emailAddresses?.[0]?.emailAddress?.[0] ||
    "?"
  ).toUpperCase();

  return (
    <div className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      <main className="max-w-2xl mx-auto px-6 sm:px-8 py-8 sm:py-12 space-y-8">

        {/* Back link */}
        <div className="flex items-center gap-2 text-sm">
          <Link href="/dashboard" className="text-[#8a7559] hover:text-[#241a12] transition-colors flex items-center gap-1.5">
            <IcoArrowLeft />
            <span>My Bids</span>
          </Link>
          <span className="text-[#cdbda3]">/</span>
          <span className="font-medium text-[#241a12]">Account</span>
        </div>

        {/* Page title */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full overflow-hidden bg-[#6c4d39]/10 border border-[#6c4d39]/20 flex items-center justify-center text-[#6c4d39] font-bold text-xl shrink-0">
            {avatarKey ? (
              <Avatar avatarKey={avatarKey} className="w-full h-full" />
            ) : user?.imageUrl ? (
              <img src={user.imageUrl} alt="" className="w-full h-full rounded-full object-cover" />
            ) : initials}
          </div>
          <div>
            <h1 className="text-2xl font-bold">Account Settings</h1>
            <p className="text-[#8a7559] text-sm">{user?.primaryEmailAddress?.emailAddress}</p>
          </div>
        </div>

        {/* Avatar picker */}
        <section className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#e3d6bf]">
            <h2 className="font-semibold text-lg text-[#241a12]">Choose Your Avatar</h2>
          </div>
          <div className="px-5 py-5">
            {avatarKey && !switchingAvatar ? (
              /* ── Locked in: show only the chosen critter ── */
              <div className="flex items-center gap-5">
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-[#6c4d39] shrink-0">
                  <Avatar avatarKey={avatarKey} className="w-full h-full" />
                </div>
                <div>
                  <p className="text-lg font-bold text-[#241a12] mb-1">
                    {AVATARS.find((a) => a.key === avatarKey)?.label ?? "Your avatar"} selected
                  </p>
                  <p className="text-base text-[#6f5b46] mb-3">This shows next to your name around the site.</p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setSwitchingAvatar(true)}
                      className="bg-[#6c4d39] hover:bg-[#563e2c] text-white font-semibold px-6 py-3 rounded-xl text-base transition-colors"
                    >
                      Switch
                    </button>
                    <button
                      type="button"
                      onClick={removeAvatar}
                      className="bg-white hover:bg-[#efe3d0] border border-[#cdbda3] text-[#4a3a2b] font-semibold px-6 py-3 rounded-xl text-base transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* ── Choosing: show the full grid ── */
              <>
                <p className="text-base text-[#6f5b46] mb-4">Pick a critter — it shows next to your name around the site.</p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                  {AVATARS.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => selectAvatar(a.key)}
                      title={a.label}
                      aria-label={a.label}
                      className="aspect-square rounded-2xl p-1.5 border-2 border-[#e3d6bf] hover:border-[#6c4d39] bg-white transition-colors"
                    >
                      <Avatar avatarKey={a.key} className="w-full h-full" />
                    </button>
                  ))}
                </div>
                {avatarKey && (
                  <button
                    type="button"
                    onClick={() => setSwitchingAvatar(false)}
                    className="mt-4 text-base text-[#6f5b46] hover:text-[#241a12] font-medium transition-colors"
                  >
                    ← Cancel
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        {/* Profile section */}
        <section className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#e3d6bf]">
            <span className="text-[#6c4d39]"><IcoUser /></span>
            <h2 className="font-semibold text-[#241a12]">Profile</h2>
          </div>
          <div className="px-5 py-5 space-y-4">
            {[
              { label: "Full Name", type: "text", value: editName, set: setEditName, placeholder: "Your name" },
              { label: "Email Address", type: "email", value: editEmail, set: setEditEmail, placeholder: "you@example.com", hint: "Used for outbid alerts and receipts." },
              { label: "Phone Number", type: "tel", value: editPhone, set: setEditPhone, placeholder: "+1 (555) 000-0000", hint: "Used for SMS notifications." },
            ].map((f) => (
              <div key={f.label}>
                <label className="text-sm text-[#6f5b46] mb-1.5 block font-medium">{f.label}</label>
                <input
                  type={f.type}
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full bg-[#f1e7d5] border border-[#cdbda3] rounded-xl px-4 py-3 text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39]/60 transition-colors text-sm"
                />
                {f.hint && <p className="text-[#8a7559] text-xs mt-1.5">{f.hint}</p>}
              </div>
            ))}
            {profileMsg && (
              <p className={`text-sm px-4 py-3 rounded-xl font-medium ${
                profileMsg.ok
                  ? "bg-[#6c4d39]/10 text-[#6c4d39] border border-[#6c4d39]/20"
                  : "bg-red-50 text-red-600 border border-red-500/20"
              }`}>
                {profileMsg.text}
              </p>
            )}
            <button
              onClick={saveProfile}
              disabled={savingProfile}
              className="bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl w-full sm:w-auto transition-all text-sm"
            >
              {savingProfile ? "Saving…" : "Save Profile"}
            </button>
          </div>
        </section>

        {/* Payment Methods section */}
        <section className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#e3d6bf]">
            <span className="text-[#6c4d39]"><IcoCard /></span>
            <div className="flex-1">
              <h2 className="font-semibold text-[#241a12]">Payment Methods</h2>
              <p className="text-xs text-[#8a7559] mt-0.5">Cards on file</p>
            </div>
          </div>

          <div className="px-5 py-5">
            {loadingPMs ? (
              <div className="text-[#8a7559] text-sm py-2">Loading…</div>
            ) : paymentMethods.length === 0 ? (
              <div className="bg-[#f1e7d5] border border-[#e3d6bf] rounded-xl px-4 py-4 text-sm text-[#6f5b46]">
                No payment methods saved yet. A card will be requested when you place your first bid.
              </div>
            ) : (
              <div className="space-y-2.5">
                {pmMsg && (
                  <p className="text-sm px-4 py-3 rounded-xl font-medium bg-[#6c4d39]/10 text-[#6c4d39] border border-[#6c4d39]/20 mb-3">
                    {pmMsg}
                  </p>
                )}
                {paymentMethods.map((pm) => (
                  <div key={pm.orgId} className="border border-[#e3d6bf] rounded-xl px-4 py-3.5 flex items-center justify-between gap-3 bg-[#f1e7d5]">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#241a12] truncate">{pm.orgName}</div>
                      {pm.hasCard ? (
                        <div className="text-xs text-[#6f5b46] mt-0.5 flex items-center gap-1.5">
                          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                            <rect x="1" y="3" width="14" height="10" rx="1.5" />
                            <path d="M1 7h14" />
                          </svg>
                          {pm.brand
                            ? <span className="capitalize">{pm.brand} ···· {pm.last4}</span>
                            : <span>Card on file</span>
                          }
                        </div>
                      ) : (
                        <div className="text-xs text-yellow-600 mt-0.5 font-medium">No card saved</div>
                      )}
                    </div>
                    {pm.stripeChargesEnabled && (
                      <button
                        onClick={() => setCardModal({ orgId: pm.orgId, stripeAccountId: pm.stripeAccountId ?? "" })}
                        className="text-xs text-[#6c4d39] hover:text-[#c47b3e] font-semibold shrink-0 transition-colors border border-[#6c4d39]/30 hover:border-[#6c4d39]/60 px-3 py-1.5 rounded-lg"
                      >
                        {pm.hasCard ? "Update card" : "Add card"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Quick links */}
        <div className="flex flex-wrap gap-3 pb-8">
          <Link href="/dashboard" className="text-sm text-[#8a7559] hover:text-[#241a12] border border-[#cdbda3] hover:border-[#b3a085] px-4 py-2 rounded-xl transition-colors">
            ← My Bids
          </Link>
          <Link href="/auctions" className="text-sm text-[#8a7559] hover:text-[#241a12] border border-[#cdbda3] hover:border-[#b3a085] px-4 py-2 rounded-xl transition-colors">
            Browse Auctions
          </Link>
        </div>
      </main>

      {/* Card modal */}
      {cardModal && (
        <CardSetupModal
          orgId={cardModal.orgId}
          stripeAccountId={cardModal.stripeAccountId}
          onSuccess={() => {
            setCardModal(null);
            setPmMsg("Card updated successfully.");
            loadPaymentMethods();
            setTimeout(() => setPmMsg(null), 5000);
          }}
          onClose={() => setCardModal(null)}
        />
      )}
    </div>
  );
}
