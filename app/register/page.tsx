"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { AVATARS, Avatar } from "@/app/components/Avatars";
import { IcoMegaphone, IcoCheck, IcoTruck, IcoShield } from "@/app/components/BidIcons";
import { BranchDivider } from "@/app/components/Illustrations";

type Step = "phone" | "avatar" | "location";

const STEPS: { id: Step; label: string }[] = [
  { id: "phone", label: "Alerts" },
  { id: "avatar", label: "Critter" },
  { id: "location", label: "Pickup" },
];

/** Card shell shared by every step — same bones as sign-in / sign-up. */
function StepShell({
  step,
  eyebrow,
  title,
  sub,
  children,
}: {
  step: Step;
  eyebrow: string;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  const idx = STEPS.findIndex((s) => s.id === step);
  return (
    <main className="flex-1 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white border border-[#e3d6bf] rounded-3xl shadow-[0_24px_60px_-24px_rgba(108,77,57,0.5)] overflow-hidden">
          {/* Header band with stepper */}
          <div className="px-6 pt-6 pb-5 text-white" style={{ background: "linear-gradient(140deg,#6c4d39,#8a5a2f)" }}>
            <ol className="flex items-center gap-2 mb-4" aria-label="Setup progress">
              {STEPS.map((s, i) => {
                const done = i < idx;
                const now = i === idx;
                return (
                  <li key={s.id} className="flex items-center gap-2 flex-1 min-w-0">
                    <span
                      className={`shrink-0 w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center border ${
                        done
                          ? "bg-white text-[#6c4d39] border-white"
                          : now
                          ? "bg-[#f0a35a] text-[#241a12] border-[#f0a35a]"
                          : "bg-white/10 text-white/70 border-white/30"
                      }`}
                      aria-current={now ? "step" : undefined}
                    >
                      {done ? <IcoCheck className="w-3.5 h-3.5" /> : i + 1}
                    </span>
                    <span className={`text-[11px] font-bold uppercase tracking-[0.14em] truncate ${now ? "text-white" : "text-white/60"}`}>
                      {s.label}
                    </span>
                    {i < STEPS.length - 1 && <span className={`h-px flex-1 ${done ? "bg-white/70" : "bg-white/25"}`} aria-hidden />}
                  </li>
                );
              })}
            </ol>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#f6d9b5]">{eyebrow}</div>
            <h1 className="font-display text-[1.7rem] leading-tight font-black mt-1">{title}</h1>
            <p className="text-white/85 text-sm mt-1">{sub}</p>
          </div>
          <div className="px-5 sm:px-7 pt-5 pb-6">{children}</div>
        </div>
        <p className="text-[#8a7559] text-xs mt-4 text-center flex items-center justify-center gap-1.5">
          <IcoShield className="w-3.5 h-3.5" />
          Step {idx + 1} of {STEPS.length} · takes about a minute
        </p>
      </div>
    </main>
  );
}

const SKIP_BTN =
  "w-full text-[#8a7559] hover:text-[#4a3a2b] text-sm font-semibold py-2 mt-4 disabled:opacity-50 transition-colors";

function RegisterForm() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url") || "/dashboard";

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(true);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [locations, setLocations] = useState<{ id: string; name: string; address: string | null }[]>([]);
  const [savingLocation, setSavingLocation] = useState(false);

  // Read the org reference cookie set when user visited an org landing page
  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)northwoodbids_org_ref=([^;]+)/);
    if (match?.[1]) setOrgSlug(match[1]);
  }, []);

  // Final hop: attach the org (if any) and route them on.
  const finish = useCallback(() => {
    document.cookie = "northwoodbids_org_ref=; max-age=0; path=/";
    if (orgSlug) {
      fetch("/api/profile/attach-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgSlug }),
      }).finally(() => router.push(`/${orgSlug}`));
    } else {
      router.push(redirectUrl);
    }
  }, [orgSlug, redirectUrl, router]);

  useEffect(() => {
    if (!isLoaded) return;

    (async () => {
      try {
        const data = await fetch("/api/profile").then(r => r.json());
        const hasLoc = !!data.profile?.preferredPickupLocationId;
        // Fully set up (phone + avatar + pickup location) — nothing to ask.
        if (data.profile?.phone && data.profile?.avatarKey && hasLoc) { finish(); return; }
        // Has phone + avatar but no pickup location — ask that.
        if (data.profile?.phone && data.profile?.avatarKey) { setStep("location"); setChecking(false); return; }
        // Has a phone but never picked an avatar — jump straight to the avatar step.
        if (data.profile?.phone) { setStep("avatar"); setChecking(false); return; }

        // No saved phone yet. If Clerk already captured one at sign-up, save it
        // automatically so we never ask the same person for it twice — then move
        // on to picking an avatar.
        const clerkPhone =
          user?.primaryPhoneNumber?.phoneNumber ||
          user?.phoneNumbers?.[0]?.phoneNumber ||
          "";
        const digits = clerkPhone.replace(/\D/g, "").slice(-10);
        if (digits.length === 10) {
          const save = await fetch("/api/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phone: digits,
              email: user?.primaryEmailAddress?.emailAddress,
              // Prefer their real name; if they only set a Clerk username at
              // sign-up, use that (so they aren't shown as "Bidder"); email as
              // a last resort.
              name: user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress?.split("@")[0] || undefined,
              ...(orgSlug ? { orgSlug } : {}),
            }),
          }).then(r => r.json()).catch(() => null);
          if (save?.success) { setStep("avatar"); setChecking(false); return; }
          // Couldn't auto-save — fall through and show the form, prefilled.
          setPhone(clerkPhone);
        }
        setChecking(false);
      } catch {
        setChecking(false);
      }
    })();
  }, [isLoaded, user, orgSlug, finish]);

  const handleSubmit = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setPhoneError("That needs to be a 10-digit US number.");
      return;
    }
    setPhoneError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: digits,
          email: user?.primaryEmailAddress?.emailAddress,
          name: user?.fullName,
          ...(orgSlug ? { orgSlug } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStep("avatar"); // pick an avatar before heading in
      } else {
        setPhoneError(data.error || "Couldn't save your number. Please try again.");
      }
    } catch {
      setPhoneError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Phone is optional → skipping still takes them to the avatar step.
  const handleSkipPhone = () => setStep("avatar");

  // Lock in the chosen avatar, then move on to the pickup-location step.
  const chooseAvatar = async (key: string) => {
    setSavingAvatar(true);
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarKey: key }),
      });
    } catch { /* non-critical — keep moving */ }
    setSavingAvatar(false);
    setStep("location");
  };

  // Load the pickup locations when the location step opens.
  useEffect(() => {
    if (step !== "location" || locations.length) return;
    fetch("/api/pickup/preferred")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.locations)) setLocations(d.locations); })
      .catch(() => {});
  }, [step, locations.length]);

  // Save the chosen pickup location, then finish.
  const chooseLocation = async (locationId: string) => {
    setSavingLocation(true);
    try {
      await fetch("/api/pickup/preferred", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId }),
      });
    } catch { /* non-critical — keep moving */ }
    finish();
  };

  if (checking) {
    return (
      <main className="flex-1 flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#6c4d39]/30 border-t-[#6c4d39] animate-spin" />
          <p className="text-[#8a7559] text-sm">Setting up your account</p>
        </div>
      </main>
    );
  }

  if (step === "avatar") {
    return (
      <StepShell
        step="avatar"
        eyebrow="Step two"
        title="Pick your critter"
        sub="It stands in for you on the leaderboard and next to your bids."
      >
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
          {AVATARS.map((a) => (
            <button
              key={a.key}
              type="button"
              disabled={savingAvatar}
              onClick={() => chooseAvatar(a.key)}
              title={a.label}
              aria-label={a.label}
              className="aspect-square rounded-2xl p-1.5 border-2 border-[#e3d6bf] hover:border-[#6c4d39] hover:bg-[#faf5ea] bg-white transition-colors disabled:opacity-50 nb-focus"
            >
              <Avatar avatarKey={a.key} className="w-full h-full" />
            </button>
          ))}
        </div>
        <p className="text-xs text-[#8a7559] mt-3 text-center">Tap one to lock it in. Swap it anytime from your account.</p>
        <button onClick={() => setStep("location")} disabled={savingAvatar} className={SKIP_BTN}>
          Skip for now
        </button>
      </StepShell>
    );
  }

  if (step === "location") {
    return (
      <StepShell
        step="location"
        eyebrow="Last step"
        title="Where will you pick up?"
        sub="Pick a home warehouse. Every win gets brought there, and you book a time that suits you."
      >
        {locations.length === 0 ? (
          <div className="flex items-center justify-center gap-3 py-6 text-sm text-[#8a7559]">
            <div className="w-5 h-5 rounded-full border-2 border-[#6c4d39]/30 border-t-[#6c4d39] animate-spin" />
            Finding our locations
          </div>
        ) : (
          <div className="space-y-2.5">
            {locations.map((l) => (
              <button
                key={l.id}
                type="button"
                disabled={savingLocation}
                onClick={() => chooseLocation(l.id)}
                className="w-full text-left rounded-2xl border-2 border-[#e3d6bf] hover:border-[#6c4d39] hover:bg-[#faf5ea] px-4 py-3.5 transition-colors disabled:opacity-50 flex items-center gap-3 nb-focus"
              >
                <span className="w-10 h-10 rounded-xl bg-[#c47b3e]/12 text-[#a85f28] flex items-center justify-center shrink-0">
                  <IcoTruck className="w-5 h-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display font-bold text-[#241a12]">{l.name}</span>
                  {l.address && <span className="block text-sm text-[#6f5b46] truncate">{l.address}</span>}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 flex items-start gap-2 text-xs text-[#6f5b46] bg-[#faf5ea] border border-[#e3d6bf] rounded-xl px-3.5 py-2.5">
          <IcoTruck className="w-4 h-4 shrink-0 text-[#6c4d39] mt-px" />
          <span>Win something at the other warehouse? We move it to yours for free, usually within a week, and text you when it lands.</span>
        </div>
        <button onClick={finish} disabled={savingLocation} className={SKIP_BTN}>
          {savingLocation ? "Saving" : "Decide later"}
        </button>
      </StepShell>
    );
  }

  return (
    <StepShell
      step="phone"
      eyebrow="Step one"
      title="Get a text when it matters"
      sub="Outbid alerts and win notices, straight to your phone. Nothing else."
    >
      {orgSlug && (
        <div className="flex items-center gap-2 mb-4 bg-[#faf5ea] border border-[#e3d6bf] rounded-xl px-3.5 py-2.5">
          <IcoCheck className="w-4 h-4 text-[#4a7c59] shrink-0" />
          <p className="text-sm text-[#4a3a2b]">
            You&apos;ll be linked to <span className="font-semibold text-[#6c4d39] capitalize">{orgSlug.replace(/-/g, " ")}</span> once you&apos;re in.
          </p>
        </div>
      )}
      <div className="space-y-4">
        <div>
          <label htmlFor="phone" className="text-sm text-[#6f5b46] font-semibold mb-1.5 block">Mobile number</label>
          <div className="relative">
            <IcoMegaphone className="w-4 h-4 text-[#8a7559] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={e => {
                setPhone(e.target.value);
                if (phoneError) setPhoneError(null);
              }}
              onKeyDown={e => e.key === "Enter" && !saving && handleSubmit()}
              placeholder="(989) 555-0123"
              aria-invalid={phoneError ? true : undefined}
              aria-describedby={phoneError ? "phone-error" : undefined}
              className={`w-full bg-[#faf5ea] border rounded-xl pl-10 pr-4 py-3 text-[#241a12] placeholder-[#b3a085] focus:outline-none transition-colors ${
                phoneError ? "border-red-500 focus:border-red-500" : "border-[#cdbda3] focus:border-[#6c4d39]"
              }`}
            />
          </div>
          {phoneError && (
            <p id="phone-error" className="text-red-600 text-sm mt-1.5">{phoneError}</p>
          )}
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
        >
          {saving ? "Saving" : "Save and continue"}
        </button>
        <BranchDivider className="w-40 h-5 mx-auto opacity-80" />
        <button onClick={handleSkipPhone} className={`${SKIP_BTN} mt-0`}>
          Skip for now (no text alerts)
        </button>
      </div>
    </StepShell>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f3ead6] to-[#ece0c9] text-[#241a12] flex flex-col">
      <Suspense fallback={
        <main className="flex-1 flex items-center justify-center py-20">
          <div className="w-8 h-8 rounded-full border-2 border-[#6c4d39]/30 border-t-[#6c4d39] animate-spin" />
        </main>
      }>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
