"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import CardSetupModal from "@/app/components/CardSetupModal";
import { AVATARS, Avatar } from "@/app/components/Avatars";
import { IcoUsers, IcoLock, IcoTruck, IcoSpark, IcoCheck, IcoGavel } from "@/app/components/BidIcons";
import { PineMark } from "@/app/components/Illustrations";

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
function IcoArrow() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}
function IcoCard({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

/** One grouped card: leather icon tile, display title, one-line hint. */
function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#e3d6bf] bg-[#fbf4e6]/70">
        <span className="w-9 h-9 rounded-xl bg-[#6c4d39] text-white flex items-center justify-center shrink-0">{icon}</span>
        <div className="min-w-0">
          <h2 className="font-display font-bold text-[#241a12] leading-tight">{title}</h2>
          {hint && <p className="text-xs text-[#8a7559] mt-0.5">{hint}</p>}
        </div>
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
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
        ? { text: "Saved.", ok: true }
        : { text: d.error || "Couldn't save that. Try again.", ok: false }
      );
    } catch {
      setProfileMsg({ text: "Something went wrong. Try again.", ok: false });
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

  const avatarLabel = AVATARS.find((a) => a.key === avatarKey)?.label ?? "Your critter";

  return (
    <div className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6 sm:py-10 space-y-6">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link href="/dashboard" className="text-[#8a7559] hover:text-[#241a12] transition-colors flex items-center gap-1.5 font-semibold">
            <IcoArrowLeft />
            <span>Your bids</span>
          </Link>
          <span className="text-[#cdbda3]">/</span>
          <span className="font-semibold text-[#241a12]">Account</span>
        </div>

        {/* Page header */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-white border-2 border-[#6c4d39]/30 flex items-center justify-center text-[#6c4d39] font-display font-black text-2xl shrink-0 shadow-sm">
            {avatarKey ? (
              <Avatar avatarKey={avatarKey} className="w-full h-full" />
            ) : user?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.imageUrl} alt="" className="w-full h-full rounded-full object-cover" />
            ) : initials}
          </div>
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#6c4d39]">
              <PineMark className="w-3.5 h-3.5" /> Your account
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-black leading-[0.95] tracking-tight mt-1 truncate">
              {user?.firstName || editName || "Bidder"}
            </h1>
            <p className="text-[#8a7559] text-sm mt-1 truncate">{user?.primaryEmailAddress?.emailAddress}</p>
          </div>
        </div>

        {/* Avatar */}
        <Section
          icon={<IcoSpark className="w-[18px] h-[18px]" />}
          title="Your critter"
          hint="Shows next to your name on the leaderboard and item pages."
        >
          {avatarKey && !switchingAvatar ? (
            <div className="flex items-center gap-5">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-[#6c4d39] shrink-0 bg-[#faf5ea]">
                <Avatar avatarKey={avatarKey} className="w-full h-full" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-lg font-bold text-[#241a12]">{avatarLabel}</p>
                <p className="text-sm text-[#6f5b46] mt-0.5">Locked in and riding along on your bids.</p>
                <button
                  type="button"
                  onClick={() => setSwitchingAvatar(true)}
                  className="mt-2 text-sm text-[#6c4d39] hover:text-[#563e2c] font-semibold underline underline-offset-2 transition-colors"
                >
                  Swap critter
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-[#6f5b46] mb-4">Tap one to make it yours.</p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
                {AVATARS.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => selectAvatar(a.key)}
                    title={a.label}
                    aria-label={a.label}
                    className="aspect-square rounded-2xl p-1.5 border-2 border-[#e3d6bf] hover:border-[#6c4d39] hover:bg-[#faf5ea] bg-white transition-colors nb-focus"
                  >
                    <Avatar avatarKey={a.key} className="w-full h-full" />
                  </button>
                ))}
              </div>
              {avatarKey && (
                <button
                  type="button"
                  onClick={() => setSwitchingAvatar(false)}
                  className="mt-4 text-sm text-[#6f5b46] hover:text-[#241a12] font-semibold transition-colors"
                >
                  Keep {avatarLabel}
                </button>
              )}
            </>
          )}
        </Section>

        {/* Profile */}
        <Section
          icon={<IcoUsers className="w-[18px] h-[18px]" />}
          title="Profile"
          hint="How we reach you about outbids, wins and pickups."
        >
          <div className="space-y-4">
            {[
              { label: "Name", type: "text", value: editName, set: setEditName, placeholder: "Your name", auto: "name" },
              { label: "Email", type: "email", value: editEmail, set: setEditEmail, placeholder: "you@example.com", hint: "Receipts and outbid alerts land here.", auto: "email" },
              { label: "Mobile", type: "tel", value: editPhone, set: setEditPhone, placeholder: "(989) 555-0123", hint: "Text alerts when you're outbid, win, or your pickup is ready.", auto: "tel" },
            ].map((f) => (
              <div key={f.label}>
                <label className="text-sm text-[#6f5b46] mb-1.5 block font-semibold">{f.label}</label>
                <input
                  type={f.type}
                  autoComplete={f.auto}
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full bg-[#faf5ea] border border-[#cdbda3] rounded-xl px-4 py-3 text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39] transition-colors text-sm"
                />
                {f.hint && <p className="text-[#8a7559] text-xs mt-1.5">{f.hint}</p>}
              </div>
            ))}
            {profileMsg && (
              <p className={`text-sm px-4 py-3 rounded-xl font-semibold flex items-center gap-2 ${
                profileMsg.ok
                  ? "bg-[#4a7c59]/10 text-[#2f5d3a] border border-[#4a7c59]/25"
                  : "bg-red-50 text-red-700 border border-red-500/20"
              }`}>
                {profileMsg.ok && <IcoCheck className="w-4 h-4" />}
                {profileMsg.text}
              </p>
            )}
            <button
              onClick={saveProfile}
              disabled={savingProfile}
              className="bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl w-full sm:w-auto transition-colors text-sm"
            >
              {savingProfile ? "Saving" : "Save changes"}
            </button>
          </div>
        </Section>

        {/* Card on file */}
        <Section
          icon={<IcoCard className="w-[18px] h-[18px]" />}
          title="Card on file"
          hint="Charged only when you win. Nothing up front."
        >
          {loadingPMs ? (
            <div className="flex items-center gap-2 text-[#8a7559] text-sm py-2">
              <div className="w-4 h-4 rounded-full border-2 border-[#6c4d39]/30 border-t-[#6c4d39] animate-spin" />
              Checking your card
            </div>
          ) : paymentMethods.length === 0 ? (
            <div className="flex items-start gap-3 bg-[#faf5ea] border border-dashed border-[#cdbda3] rounded-xl px-4 py-4">
              <IcoLock className="w-5 h-5 text-[#6c4d39] shrink-0 mt-0.5" />
              <div className="text-sm text-[#6f5b46]">
                <p className="font-semibold text-[#241a12]">No card yet</p>
                <p className="mt-0.5">We ask for one the first time you bid. It stays with Stripe, never with us.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {pmMsg && (
                <p className="text-sm px-4 py-3 rounded-xl font-semibold bg-[#4a7c59]/10 text-[#2f5d3a] border border-[#4a7c59]/25 flex items-center gap-2">
                  <IcoCheck className="w-4 h-4" /> {pmMsg}
                </p>
              )}
              {paymentMethods.map((pm) => (
                <div key={pm.orgId} className="border border-[#e3d6bf] rounded-xl px-4 py-3.5 flex items-center justify-between gap-3 bg-[#faf5ea]">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-10 h-7 rounded-md flex items-center justify-center shrink-0 ${pm.hasCard ? "bg-[#6c4d39] text-white" : "bg-[#e3d6bf] text-[#8a7559]"}`}>
                      <IcoCard className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#241a12] truncate">
                        {pm.hasCard
                          ? pm.brand
                            ? <span className="capitalize">{pm.brand} ending in {pm.last4}</span>
                            : "Card on file"
                          : "No card saved"}
                      </div>
                      <div className="text-xs text-[#8a7559] mt-0.5 truncate">{pm.orgName}</div>
                    </div>
                  </div>
                  {pm.stripeChargesEnabled && (
                    <button
                      onClick={() => setCardModal({ orgId: pm.orgId, stripeAccountId: pm.stripeAccountId ?? "" })}
                      className="text-xs text-[#6c4d39] hover:text-white hover:bg-[#6c4d39] font-bold shrink-0 transition-colors border border-[#6c4d39]/40 px-3 py-1.5 rounded-lg"
                    >
                      {pm.hasCard ? "Update" : "Add card"}
                    </button>
                  )}
                </div>
              ))}
              <p className="text-xs text-[#8a7559] flex items-center gap-1.5 pt-1">
                <IcoLock className="w-3.5 h-3.5" /> Stored securely by Stripe.
              </p>
            </div>
          )}
        </Section>

        {/* Pickup location */}
        <Section
          icon={<IcoTruck className="w-[18px] h-[18px]" />}
          title="Pickup location"
          hint="Owosso or Gladwin. Wins from the other warehouse ride over for free."
        >
          <Link
            href="/pickup"
            className="flex items-center justify-between gap-3 rounded-xl border border-[#e3d6bf] bg-[#faf5ea] hover:bg-[#f1e7d5] px-4 py-3.5 transition-colors group"
          >
            <div className="text-sm">
              <p className="font-semibold text-[#241a12]">Choose or switch your warehouse</p>
              <p className="text-[#8a7559] text-xs mt-0.5">Also where you book a pickup time once something&apos;s ready.</p>
            </div>
            <span className="text-[#6c4d39] group-hover:translate-x-0.5 transition-transform shrink-0"><IcoArrow /></span>
          </Link>
        </Section>

        {/* Quick links */}
        <div className="flex flex-wrap gap-2.5 pb-8">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6f5b46] hover:text-[#241a12] bg-white border border-[#e3d6bf] hover:border-[#cdbda3] px-4 py-2 rounded-xl transition-colors">
            <IcoArrowLeft /> Your bids
          </Link>
          <Link href="/auctions" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6f5b46] hover:text-[#241a12] bg-white border border-[#e3d6bf] hover:border-[#cdbda3] px-4 py-2 rounded-xl transition-colors">
            <IcoGavel className="w-4 h-4" /> Live auctions
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
            setPmMsg("Card updated.");
            loadPaymentMethods();
            setTimeout(() => setPmMsg(null), 5000);
          }}
          onClose={() => setCardModal(null)}
        />
      )}
    </div>
  );
}
