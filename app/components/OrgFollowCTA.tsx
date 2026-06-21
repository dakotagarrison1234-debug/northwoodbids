"use client";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";

interface Props {
  orgSlug: string;
  orgName: string;
}

/**
 * OrgFollowCTA
 * - Sets a `northwoodbids_org_ref` cookie so that after Clerk sign-up, /register
 *   knows to auto-attach the bidder to this org (sets preferredOrgId).
 * - Shows a sign-up CTA for visitors who are not yet logged in.
 * - Shows a confirmation for visitors who are already logged in.
 */
export default function OrgFollowCTA({ orgSlug, orgName }: Props) {
  const { isSignedIn, isLoaded } = useUser();
  const [attached, setAttached] = useState(false);

  useEffect(() => {
    // Always set/refresh the cookie when visiting an org page.
    // Expires in 7 days — enough time for someone to decide to sign up.
    document.cookie = `northwoodbids_org_ref=${orgSlug}; max-age=604800; path=/; SameSite=Lax`;
  }, [orgSlug]);

  // For already-signed-in users: attach them to this org in the background
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    fetch("/api/profile/attach-org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgSlug }),
    })
      .then(r => r.json())
      .then(d => { if (d.success) setAttached(true); })
      .catch(() => {/* non-critical */});
  }, [isLoaded, isSignedIn, orgSlug]);

  if (!isLoaded) return null;

  if (isSignedIn) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-2">
        <div className="bg-[#09a7ad]/8 border border-[#09a7ad]/25 rounded-2xl px-5 py-3 flex items-center gap-3">
          <span className="text-[#09a7ad]">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 8l3.5 3.5L13 4" />
            </svg>
          </span>
          <p className="text-sm text-[#4a4640]">
            {attached
              ? <><span className="font-semibold text-[#09a7ad]">{orgName}</span> is now your primary business — their auctions appear first in your dashboard.</>
              : <>You&apos;re signed in — <Link href="/dashboard?tab=auctions" className="font-semibold text-[#09a7ad] hover:underline">view live auctions</Link></>
            }
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-2">
      <div className="bg-white border border-[#e5e0d5] rounded-2xl px-5 sm:px-7 py-5 flex flex-col sm:flex-row sm:items-center gap-4 shadow-[0_0_30px_rgba(9,167,173,0.06)]">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[#1a1916]">Join {orgName}&apos;s auctions</p>
          <p className="text-sm text-[#6b6659] mt-0.5">
            Create a free account to place bids. You&apos;ll be automatically connected to {orgName}.
          </p>
        </div>
        <div className="flex gap-3 shrink-0">
          <Link
            href="/sign-in"
            className="px-4 py-2.5 rounded-xl border border-[#d4cfc4] text-[#4a4640] text-sm font-semibold hover:border-[#09a7ad]/40 hover:text-[#09a7ad] transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="px-5 py-2.5 rounded-xl bg-[#09a7ad] hover:bg-[#0898a0] text-white text-sm font-bold transition-colors shadow-[0_0_15px_rgba(9,167,173,0.3)]"
          >
            Sign up to bid →
          </Link>
        </div>
      </div>
    </div>
  );
}
