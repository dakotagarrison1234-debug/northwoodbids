"use client";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { IcoUsers, IcoCheck, IcoShield } from "@/app/components/BidIcons";
import { WoodenCrate } from "@/app/components/Illustrations";

const LOGO_URL =
  "https://assets.cdn.filesafe.space/TwuL7EwKfW8oGIV0Zo5q/media/6a373b261c5d711b35bf4e56.png";

/** Same shell as sign-in / sign-up so the invite flow feels like one front door. */
function Shell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f3ead6] to-[#ece0c9] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white border border-[#e3d6bf] rounded-3xl shadow-[0_24px_60px_-24px_rgba(108,77,57,0.5)] overflow-hidden">
          <div className="relative px-6 pt-7 pb-6 text-center text-white" style={{ background: "linear-gradient(140deg,#6c4d39,#8a5a2f)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_URL} alt="Northwood Bids" className="h-16 w-auto max-w-[200px] object-contain mx-auto mb-3 drop-shadow" />
            <h1 className="font-display text-[1.7rem] leading-tight font-black">{title}</h1>
            <p className="text-white/85 text-sm mt-1">{sub}</p>
          </div>
          <div className="px-5 sm:px-7 pt-6 pb-7 text-center">{children}</div>
        </div>
        <p className="text-[#8a7559] text-xs mt-4 text-center flex items-center justify-center gap-1.5">
          <IcoShield className="w-3.5 h-3.5" />
          Secured by Stripe &amp; Clerk · Owosso &amp; Gladwin, MI
        </p>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <main className="flex-1 flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-[#6c4d39]/30 border-t-[#6c4d39] animate-spin" />
        <p className="text-[#8a7559] text-sm">Checking your invite</p>
      </div>
    </main>
  );
}

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

  if (!isLoaded) return <Loading />;

  const primary =
    "w-full inline-block bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors";
  const secondary =
    "w-full inline-block bg-white border border-[#cdbda3] hover:bg-[#faf5ea] text-[#4a3a2b] hover:text-[#241a12] font-semibold py-3 rounded-xl transition-colors";

  if (!token) {
    return (
      <Shell title="That link is missing something" sub="Invites carry a token, and this one arrived without it.">
        <WoodenCrate className="w-24 h-20 mx-auto mb-4 nb-float" />
        <p className="text-[#6f5b46] text-sm mb-6">Ask whoever sent it for a fresh invite link, then try again.</p>
        <div className="flex flex-col gap-2.5">
          <Link href="/auctions" className={primary}>Browse auctions</Link>
          <Link href="/" className={secondary}>Back home</Link>
        </div>
      </Shell>
    );
  }

  if (status === "success") {
    return (
      <Shell title="You're on the crew" sub="Your account now has staff access.">
        <div className="w-16 h-16 rounded-full bg-[#4a7c59]/12 border border-[#4a7c59]/30 text-[#4a7c59] flex items-center justify-center mx-auto mb-4">
          <IcoCheck className="w-8 h-8" />
        </div>
        <p className="text-[#6f5b46] text-sm mb-6">Taking you to the staff dashboard.</p>
        <Link href="/admin/dashboard" className={primary}>Open the dashboard</Link>
      </Shell>
    );
  }

  return (
    <Shell title="You've been invited" sub="Join the Northwood Bids team.">
      <div className="w-16 h-16 rounded-full bg-[#6c4d39]/10 border border-[#6c4d39]/25 text-[#6c4d39] flex items-center justify-center mx-auto mb-4">
        <IcoUsers className="w-8 h-8" />
      </div>
      <p className="text-[#6f5b46] text-sm mb-6">
        Accepting links this account to the staff side: auctions, pickups and payouts.
      </p>

      {status === "error" && (
        <p className="text-red-700 text-sm mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{message}</p>
      )}

      <button onClick={handleAccept} disabled={status === "joining"} className={primary}>
        {status === "joining" ? "Joining" : "Accept invite"}
      </button>
      {status === "error" && (
        <Link href="/auctions" className="block mt-3 text-sm text-[#6f5b46] hover:text-[#241a12] font-semibold transition-colors">
          Browse auctions instead
        </Link>
      )}
    </Shell>
  );
}

export default function JoinPage() {
  return (
    <div className="min-h-screen bg-[#f1e7d5] text-[#241a12] flex flex-col">
      <Suspense fallback={<Loading />}>
        <JoinPageInner />
      </Suspense>
    </div>
  );
}
