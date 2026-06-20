"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import HomeHeader from "@/app/components/HomeHeader";

function JoinPageInner() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"idle" | "joining" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=${encodeURIComponent(`/join?token=${token}`)}`);
    }
  }, [isLoaded, isSignedIn, router, token]);

  const handleAccept = async () => {
    if (!token) return;
    setStatus("joining");
    try {
      const res = await fetch("/api/orgs/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus("success");
        setTimeout(() => router.push("/admin/dashboard"), 1500);
      } else {
        setStatus("error");
        setMessage(data.error || "Something went wrong.");
      }
    } catch {
      setStatus("error");
      setMessage("Request failed. Please try again.");
    }
  };

  if (!isLoaded) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-[#6b6659]">Loading...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {!token ? (
          <>
            <h1 className="text-2xl font-bold mb-3">Invalid Invite</h1>
            <p className="text-[#6b6659] mb-8">This invite link is missing a token. Please ask for a new invite.</p>
            <div className="flex flex-col gap-2.5">
              <Link href="/auctions" className="w-full bg-[#09a7ad] hover:bg-[#0898a0] text-white font-semibold py-3 rounded-xl transition-colors">
                Browse auctions
              </Link>
              <Link href="/" className="w-full border border-[#d4cfc4] hover:border-[#b0a99a] text-[#4a4640] hover:text-[#1a1916] font-medium py-3 rounded-xl transition-colors">
                Go home
              </Link>
            </div>
          </>
        ) : status === "success" ? (
          <>
            <div className="flex justify-center mb-5">
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <circle cx="28" cy="28" r="26" stroke="#374151" strokeWidth="1.5"/>
                <circle cx="28" cy="28" r="18" stroke="#09a7ad" strokeWidth="1.2" strokeOpacity="0.4"/>
                <circle cx="28" cy="28" r="12" fill="rgba(9,167,173,0.12)" stroke="#09a7ad" strokeWidth="1.5"/>
                <path d="M21 28l5 5 9-9" stroke="#09a7ad" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2">You&apos;re in!</h1>
            <p className="text-[#6b6659] mb-6">Redirecting to your dashboard...</p>
            <Link href="/admin/dashboard" className="w-full inline-block bg-[#09a7ad] hover:bg-[#0898a0] text-white font-semibold py-3 rounded-xl transition-colors">
              Go to dashboard
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-3">You&apos;ve Been Invited</h1>
            <p className="text-[#6b6659] mb-8">
              You&apos;ve been invited to join an organization on Northwood Bids. Accept below to access the dashboard.
            </p>

            {status === "error" && (
              <p className="text-red-600 text-sm mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{message}</p>
            )}

            <button
              onClick={handleAccept}
              disabled={status === "joining"}
              className="w-full bg-[#09a7ad] hover:bg-[#0898a0] disabled:opacity-50 text-white font-semibold py-3 rounded-xl"
            >
              {status === "joining" ? "Joining..." : "Accept Invite"}
            </button>
            {status === "error" && (
              <Link href="/auctions" className="block mt-3 text-sm text-[#6b6659] hover:text-[#1a1916] transition-colors">
                Browse auctions instead
              </Link>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function JoinPage() {
  return (
    <div className="min-h-screen bg-[#faf8f4] text-[#1a1916] flex flex-col">
      <HomeHeader />
      <Suspense fallback={
        <main className="flex-1 flex items-center justify-center">
          <p className="text-[#6b6659]">Loading...</p>
        </main>
      }>
        <JoinPageInner />
      </Suspense>
    </div>
  );
}
