"use client";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";

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

  const handleAccept = useCallback(async () => {
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
  }, [token, router]);

  // Auto-accept as soon as they land here signed in — no button hunt required.
  const triedRef = useRef(false);
  useEffect(() => {
    if (isLoaded && isSignedIn && token && !triedRef.current) {
      triedRef.current = true;
      handleAccept();
    }
  }, [isLoaded, isSignedIn, token, handleAccept]);

  if (!isLoaded) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-[#6f5b46]">Loading...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {!token ? (
          <>
            <h1 className="text-2xl font-bold mb-3">Invalid Invite</h1>
            <p className="text-[#6f5b46] mb-8">This invite link is missing a token. Please ask for a new invite.</p>
            <div className="flex flex-col gap-2.5">
              <Link href="/auctions" className="w-full bg-[#6c4d39] hover:bg-[#563e2c] text-white font-semibold py-3 rounded-xl transition-colors">
                Browse auctions
              </Link>
              <Link href="/" className="w-full border border-[#cdbda3] hover:border-[#b3a085] text-[#4a3a2b] hover:text-[#241a12] font-medium py-3 rounded-xl transition-colors">
                Go home
              </Link>
            </div>
          </>
        ) : status === "success" ? (
          <>
            <div className="flex justify-center mb-5">
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <circle cx="28" cy="28" r="26" stroke="#563e2c" strokeWidth="1.5"/>
                <circle cx="28" cy="28" r="18" stroke="#6c4d39" strokeWidth="1.2" strokeOpacity="0.4"/>
                <circle cx="28" cy="28" r="12" fill="rgba(108, 77, 57,0.12)" stroke="#6c4d39" strokeWidth="1.5"/>
                <path d="M21 28l5 5 9-9" stroke="#6c4d39" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2">You&apos;re in!</h1>
            <p className="text-[#6f5b46] mb-6">Redirecting to your dashboard...</p>
            <Link href="/admin/dashboard" className="w-full inline-block bg-[#6c4d39] hover:bg-[#563e2c] text-white font-semibold py-3 rounded-xl transition-colors">
              Go to dashboard
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-3">You&apos;ve Been Invited</h1>
            <p className="text-[#6f5b46] mb-8">
              You&apos;ve been invited to join the team at Northwood Bids. Accept below to access the dashboard.
            </p>

            {status === "error" && (
              <p className="text-red-600 text-sm mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{message}</p>
            )}

            <button
              onClick={handleAccept}
              disabled={status === "joining"}
              className="w-full bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white font-semibold py-3 rounded-xl"
            >
              {status === "joining" ? "Joining..." : "Accept Invite"}
            </button>
            {status === "error" && (
              <Link href="/auctions" className="block mt-3 text-sm text-[#6f5b46] hover:text-[#241a12] transition-colors">
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
    <div className="min-h-screen bg-[#f1e7d5] text-[#241a12] flex flex-col">
      <Suspense fallback={
        <main className="flex-1 flex items-center justify-center">
          <p className="text-[#6f5b46]">Loading...</p>
        </main>
      }>
        <JoinPageInner />
      </Suspense>
    </div>
  );
}
