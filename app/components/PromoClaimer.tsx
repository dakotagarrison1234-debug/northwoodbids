"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { IcoCoin } from "@/app/components/BidIcons";

/**
 * Invisible until it has good news. When a signed-in bidder has an `nb_promo`
 * cookie (dropped by /go/{code}), it fires the claim. If the profile has no phone
 * yet (still registering) the server keeps the cookie and we try again on the next
 * page. On success: a small toast — "$5 in Bid Bucks added".
 */
export default function PromoClaimer() {
  const { isSignedIn, isLoaded } = useUser();
  // Re-run on every route change: /register → home is a soft router.push, so this
  // layout-level component never remounts. Without the pathname dep the claim would
  // fire once (before the phone is saved → no_phone) and not again until a hard reload.
  const pathname = usePathname();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const has = document.cookie.split("; ").some((c) => c.startsWith("nb_promo=") && c.length > "nb_promo=".length);
    if (!has) return;
    fetch("/api/promo/claim", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) {
          setToast(`$${Number(d.amount).toFixed(0)} in Bid Bucks added. It comes off your first win.`);
          setTimeout(() => setToast(null), 6000);
        }
      })
      .catch(() => {});
  }, [isLoaded, isSignedIn, pathname]);

  if (!toast) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[95] nb-sheet-in">
      <div className="flex items-center gap-3 rounded-2xl bg-[#241a12] text-[#fbf4e6] px-4 py-3 shadow-2xl border border-[#f0a35a]/40">
        <span className="w-8 h-8 rounded-full bg-[#f0a35a] text-[#241a12] grid place-items-center"><IcoCoin className="w-4 h-4" /></span>
        <span className="text-sm font-bold">{toast}</span>
      </div>
    </div>
  );
}
