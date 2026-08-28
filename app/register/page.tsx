"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { AVATARS, Avatar } from "@/app/components/Avatars";

function RegisterForm() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url") || "/dashboard";

  const [step, setStep] = useState<"phone" | "avatar" | "location">("phone");
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
      setPhoneError("Please enter a valid 10-digit US phone number.");
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
      <main className="flex-1 flex items-center justify-center">
        <p className="text-[#6f5b46]">Loading...</p>
      </main>
    );
  }

  if (step === "avatar") {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="bg-white border border-[#e3d6bf] rounded-2xl p-8 max-w-md w-full mx-4">
          <h1 className="text-2xl font-bold mb-2">Pick your avatar</h1>
          <p className="text-[#6f5b46] mb-6">
            Choose a critter — it shows next to your name around the site. You can change it later in your profile.
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
            {AVATARS.map((a) => (
              <button
                key={a.key}
                type="button"
                disabled={savingAvatar}
                onClick={() => chooseAvatar(a.key)}
                title={a.label}
                aria-label={a.label}
                className="aspect-square rounded-2xl p-1.5 border-2 border-[#e3d6bf] hover:border-[#6c4d39] bg-white transition-colors disabled:opacity-50"
              >
                <Avatar avatarKey={a.key} className="w-full h-full" />
              </button>
            ))}
          </div>
          <button
            onClick={() => setStep("location")}
            disabled={savingAvatar}
            className="w-full text-[#8a7559] hover:text-[#4a3a2b] text-sm py-2 mt-5 disabled:opacity-50"
          >
            Skip for now
          </button>
        </div>
      </main>
    );
  }

  if (step === "location") {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="bg-white border border-[#e3d6bf] rounded-2xl p-8 max-w-md w-full mx-4">
          <h1 className="text-2xl font-bold mb-2">Where will you pick up?</h1>
          <p className="text-[#6f5b46] mb-6">
            Pick your home warehouse — anything you win is brought here for you, and you schedule pickup on your own time. You can change it anytime.
          </p>
          {locations.length === 0 ? (
            <p className="text-[#8a7559] text-sm py-4">Loading locations…</p>
          ) : (
            <div className="space-y-2.5">
              {locations.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  disabled={savingLocation}
                  onClick={() => chooseLocation(l.id)}
                  className="w-full text-left rounded-2xl border-2 border-[#e3d6bf] hover:border-[#6c4d39] hover:bg-[#faf5ea] px-4 py-3.5 transition-colors disabled:opacity-50 flex items-center gap-3"
                >
                  <svg className="w-5 h-5 text-[#6c4d39] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 21s7-6.3 7-11a7 7 0 0 0-14 0c0 4.7 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" />
                  </svg>
                  <span className="min-w-0">
                    <span className="block font-bold text-[#241a12]">{l.name}</span>
                    {l.address && <span className="block text-sm text-[#6f5b46] truncate">{l.address}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={finish}
            disabled={savingLocation}
            className="w-full text-[#8a7559] hover:text-[#4a3a2b] text-sm py-2 mt-5 disabled:opacity-50"
          >
            {savingLocation ? "Saving…" : "Skip for now — you can set this later"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center">
      <div className="bg-white border border-[#e3d6bf] rounded-2xl p-8 max-w-md w-full mx-4">
        {orgSlug && (
          <div className="flex items-center gap-2 mb-5 bg-[#6c4d39]/8 border border-[#6c4d39]/20 rounded-xl px-4 py-2.5">
            <svg className="w-4 h-4 text-[#6c4d39] shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 8l3.5 3.5L13 4" />
            </svg>
            <p className="text-sm text-[#4a3a2b]">
              You&apos;ll be connected to <span className="font-semibold text-[#6c4d39]">{orgSlug.replace(/-/g, " ")}</span> after sign up
            </p>
          </div>
        )}
        <h1 className="text-2xl font-bold mb-2">One more step</h1>
        <p className="text-[#6f5b46] mb-6">
          Add your phone number to get <strong className="text-[#241a12]">outbid and win alerts by text</strong> so you never miss a winning opportunity.
        </p>
        <div className="space-y-4">
          <div>
            <label htmlFor="phone" className="text-sm text-[#6f5b46] mb-1 block">Phone Number</label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={e => {
                setPhone(e.target.value);
                if (phoneError) setPhoneError(null);
              }}
              onKeyDown={e => e.key === "Enter" && !saving && handleSubmit()}
              placeholder="+1 (555) 000-0000"
              aria-invalid={phoneError ? true : undefined}
              aria-describedby={phoneError ? "phone-error" : undefined}
              className={`w-full bg-[#efe3d0] border rounded-xl px-4 py-3 text-[#241a12] placeholder-[#b3a085] focus:outline-none transition-colors ${
                phoneError ? "border-red-500 focus:border-red-500" : "border-[#cdbda3] focus:border-[#6c4d39]"
              }`}
            />
            {phoneError && (
              <p id="phone-error" className="text-red-600 text-sm mt-1.5">{phoneError}</p>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white font-semibold py-3 rounded-xl"
          >
            {saving ? "Saving..." : "Save & Continue"}
          </button>
          <button
            onClick={handleSkipPhone}
            className="w-full text-[#8a7559] hover:text-[#4a3a2b] text-sm py-2"
          >
            Skip for now — you won&apos;t get outbid or win text alerts
          </button>
        </div>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-[#f1e7d5] text-[#241a12] flex flex-col">
      <Suspense fallback={
        <main className="flex-1 flex items-center justify-center">
          <p className="text-[#6f5b46]">Loading...</p>
        </main>
      }>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
