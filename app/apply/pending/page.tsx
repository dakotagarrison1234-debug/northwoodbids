"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import HomeHeader from "@/app/components/HomeHeader";

export default function ApplyPendingPage() {
  const [status, setStatus] = useState<"PENDING" | "APPROVED" | "REJECTED" | null>(null);
  const [reviewNote, setReviewNote] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");

  useEffect(() => {
    fetch("/api/apply")
      .then((r) => r.json())
      .then((d) => {
        if (d.application) {
          setStatus(d.application.status);
          setReviewNote(d.application.reviewNote);
          setOrgName(d.application.orgName);
        }
      });
  }, []);

  return (
    <div className="min-h-screen bg-[#faf8f4] text-[#1a1916] flex flex-col">
      <HomeHeader />
      <main className="flex-1 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {status === "PENDING" || status === null ? (
          <>
            <div className="flex justify-center mb-6">
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <circle cx="28" cy="28" r="26" stroke="#374151" strokeWidth="1.5"/>
                <circle cx="28" cy="28" r="18" stroke="#f59e0b" strokeWidth="1.2" strokeOpacity="0.4"/>
                <circle cx="28" cy="28" r="12" fill="rgba(245,158,11,0.12)" stroke="#f59e0b" strokeWidth="1.5"/>
                <path d="M28 20v8.5l4 3" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-3">Application Under Review</h1>
            <p className="text-[#6b6659] mb-6">
              {orgName ? (
                <>Your application for <span className="text-[#1a1916] font-semibold">{orgName}</span> has been received.</>
              ) : (
                <>Your application has been received.</>
              )}{" "}
              We typically review applications within 1 business day. You&apos;ll receive an email when a decision is made.
            </p>
            <div className="bg-white border border-[#e5e0d5] rounded-xl p-4 text-sm text-[#8c8778]">
              In the meantime, you can still{" "}
              <Link href="/" className="text-[#09a7ad] hover:underline">browse and bid on auctions</Link>.
            </div>
          </>
        ) : status === "APPROVED" ? (
          <>
            <div className="flex justify-center mb-6">
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <circle cx="28" cy="28" r="26" stroke="#374151" strokeWidth="1.5"/>
                <circle cx="28" cy="28" r="18" stroke="#09a7ad" strokeWidth="1.2" strokeOpacity="0.4"/>
                <circle cx="28" cy="28" r="12" fill="rgba(9,167,173,0.12)" stroke="#09a7ad" strokeWidth="1.5"/>
                <path d="M21 28l5 5 9-9" stroke="#09a7ad" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-3">You&apos;re Approved!</h1>
            <p className="text-[#6b6659] mb-6">
              Your organization <span className="text-[#1a1916] font-semibold">{orgName}</span> is ready to go.
            </p>
            <Link href="/admin/dashboard" className="bg-[#09a7ad] hover:bg-[#0898a0] text-white font-semibold px-8 py-3 rounded-xl inline-block">
              Go to Dashboard
            </Link>
          </>
        ) : (
          <>
            <div className="flex justify-center mb-6">
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <circle cx="28" cy="28" r="26" stroke="#374151" strokeWidth="1.5"/>
                <circle cx="28" cy="28" r="18" stroke="#ef4444" strokeWidth="1.2" strokeOpacity="0.4"/>
                <circle cx="28" cy="28" r="12" fill="rgba(239,68,68,0.10)" stroke="#ef4444" strokeWidth="1.5"/>
                <path d="M23 23l10 10M33 23L23 33" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-3">Application Not Approved</h1>
            {reviewNote && (
              <p className="text-[#6b6659] mb-4">
                Reason: <span className="text-[#1a1916]">{reviewNote}</span>
              </p>
            )}
            <p className="text-[#8c8778] text-sm mb-6">
              If you have questions, please contact us.
            </p>
            <Link href="/auctions" className="text-[#09a7ad] hover:underline text-sm">
              Browse Auctions
            </Link>
          </>
        )}
      </div>
      </main>
    </div>
  );
}
