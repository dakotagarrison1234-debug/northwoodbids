"use client";
import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";

/**
 * Invisible. Once a signed-in bidder is present and an `nb_ref` cookie exists
 * (dropped by /r/{code}), it fires a one-shot claim so the new account gets
 * attributed to their inviter. The endpoint clears the cookie, so this runs at
 * most once per share link.
 */
export default function ReferralClaimer() {
  const { isSignedIn, isLoaded } = useUser();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const hasRef = document.cookie
      .split("; ")
      .some((c) => c.startsWith("nb_ref=") && c.length > "nb_ref=".length);
    if (!hasRef) return;
    fetch("/api/referral/claim", { method: "POST" }).catch(() => {});
  }, [isLoaded, isSignedIn]);

  return null;
}
