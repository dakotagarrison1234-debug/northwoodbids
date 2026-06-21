"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";

function RegisterForm() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url") || "/dashboard";

  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(true);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);

  // Read the org reference cookie set when user visited an org landing page
  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)northwoodbids_org_ref=([^;]+)/);
    if (match?.[1]) setOrgSlug(match[1]);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    fetch("/api/profile")
      .then(res => res.json())
      .then(data => {
        if (data.profile?.phone) {
          // Already registered — if coming from an org, still attach them and redirect there
          if (orgSlug) {
            fetch("/api/profile/attach-org", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orgSlug }),
            }).finally(() => {
              document.cookie = "northwoodbids_org_ref=; max-age=0; path=/";
              router.push(`/${orgSlug}`);
            });
          } else {
            router.push(redirectUrl);
          }
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [isLoaded, router, redirectUrl, orgSlug]);

  const handleSubmit = async () => {
    if (!phone || phone.length < 10) {
      alert("Please enter a valid phone number");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          email: user?.primaryEmailAddress?.emailAddress,
          name: user?.fullName,
          ...(orgSlug ? { orgSlug } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Clear the org cookie now that it's been saved
        document.cookie = "northwoodbids_org_ref=; max-age=0; path=/";
        // Send them to their org's page, or the default redirect
        router.push(orgSlug ? `/${orgSlug}` : redirectUrl);
      } else {
        alert("Error saving profile");
      }
    } catch {
      alert("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    document.cookie = "northwoodbids_org_ref=; max-age=0; path=/";
    router.push(orgSlug ? `/${orgSlug}` : redirectUrl);
  };

  if (checking) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-[#6f5b46]">Loading...</p>
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
          Add your phone number to receive outbid alerts via SMS so you never miss a winning opportunity.
        </p>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-[#6f5b46] mb-1 block">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !saving && handleSubmit()}
              placeholder="+1 (555) 000-0000"
              className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3 text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39]"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white font-semibold py-3 rounded-xl"
          >
            {saving ? "Saving..." : "Save & Continue"}
          </button>
          <button
            onClick={handleSkip}
            className="w-full text-[#8a7559] hover:text-[#4a3a2b] text-sm py-2"
          >
            Skip for now
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
