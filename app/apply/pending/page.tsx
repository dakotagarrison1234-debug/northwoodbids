"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Northwood Bids is a single-business auction site — there is no public
// host-application flow. This route now redirects to the home page.
export default function ApplyPendingPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return null;
}
