"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import HomeHeader from "@/app/components/HomeHeader";

export default function ApplyPage() {
  const { isSignedIn, isLoaded, user } = useUser();
  const router = useRouter();

  const [orgName, setOrgName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.push("/sign-in?redirect_url=/apply");
      return;
    }

    // Pre-fill contact info from Clerk
    setContactName(user?.fullName || "");
    setContactEmail(user?.primaryEmailAddress?.emailAddress || "");

    // Check if they already have an org or pending application
    Promise.all([fetch("/api/me"), fetch("/api/apply")])
      .then(async ([meRes, appRes]) => {
        const me = await meRes.json();
        const app = await appRes.json();
        if (me.orgId) {
          router.replace("/admin/dashboard");
        } else if (app.application?.status === "PENDING") {
          router.replace("/apply/pending");
        } else if (app.application?.status === "APPROVED") {
          router.replace("/admin/dashboard");
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [isLoaded, isSignedIn, user, router]);

  const handleSubmit = async () => {
    if (!orgName.trim() || !contactName.trim() || !contactEmail.trim()) {
      setError("Organization name, your name, and email are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName, description, website, contactName, contactEmail, contactPhone }),
      });
      const data = await res.json();
      if (data.success) {
        router.push("/apply/pending");
      } else {
        setError(data.error || "Something went wrong.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!isLoaded || checking) {
    return (
      <div className="min-h-screen bg-[#faf8f4] text-[#1a1916] flex flex-col">
        <HomeHeader />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-[#6b6659]">Loading...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf8f4] text-[#1a1916] flex flex-col">
      <HomeHeader />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full">
        <h1 className="text-3xl font-bold mb-2">Apply to Host Auctions</h1>
        <p className="text-[#6b6659] mb-8">
          Tell us about your organization. We review every application and typically respond within 1 business day.
        </p>

        <div className="bg-white border border-[#e5e0d5] rounded-2xl p-8 space-y-5">
          <div>
            <label className="text-sm text-[#6b6659] mb-1 block">Organization Name *</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Lincoln Elementary PTO"
              className="w-full bg-[#f2efe8] border border-[#d4cfc4] rounded-xl px-4 py-3 text-[#1a1916] placeholder-[#b0a99a] focus:outline-none focus:border-[#09a7ad]"
            />
          </div>

          <div>
            <label className="text-sm text-[#6b6659] mb-1 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of your organization and what you're raising funds for..."
              rows={3}
              className="w-full bg-[#f2efe8] border border-[#d4cfc4] rounded-xl px-4 py-3 text-[#1a1916] placeholder-[#b0a99a] focus:outline-none focus:border-[#09a7ad] resize-none"
            />
          </div>

          <div>
            <label className="text-sm text-[#6b6659] mb-1 block">Website</label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yourorg.org (optional)"
              className="w-full bg-[#f2efe8] border border-[#d4cfc4] rounded-xl px-4 py-3 text-[#1a1916] placeholder-[#b0a99a] focus:outline-none focus:border-[#09a7ad]"
            />
          </div>

          <div className="border-t border-[#e5e0d5] pt-5">
            <p className="text-sm text-[#8c8778] mb-4">Your contact information</p>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-[#6b6659] mb-1 block">Your Name *</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Full name"
                  className="w-full bg-[#f2efe8] border border-[#d4cfc4] rounded-xl px-4 py-3 text-[#1a1916] placeholder-[#b0a99a] focus:outline-none focus:border-[#09a7ad]"
                />
              </div>

              <div>
                <label className="text-sm text-[#6b6659] mb-1 block">Email *</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="you@yourorg.org"
                  className="w-full bg-[#f2efe8] border border-[#d4cfc4] rounded-xl px-4 py-3 text-[#1a1916] placeholder-[#b0a99a] focus:outline-none focus:border-[#09a7ad]"
                />
              </div>

              <div>
                <label className="text-sm text-[#6b6659] mb-1 block">Phone</label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000 (optional)"
                  className="w-full bg-[#f2efe8] border border-[#d4cfc4] rounded-xl px-4 py-3 text-[#1a1916] placeholder-[#b0a99a] focus:outline-none focus:border-[#09a7ad]"
                />
              </div>
            </div>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full bg-[#09a7ad] hover:bg-[#0898a0] disabled:opacity-50 text-white font-semibold py-3 rounded-xl"
          >
            {saving ? "Submitting..." : "Submit Application"}
          </button>
        </div>
      </div>
      </main>
    </div>
  );
}
