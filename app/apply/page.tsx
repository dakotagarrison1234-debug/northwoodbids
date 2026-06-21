"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Northwood Bids is a single-business auction site — outside organizations
// cannot self-apply to host. This route now redirects to the home page.
export default function ApplyPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return null;
}
