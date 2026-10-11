"use client";
import { useSyncExternalStore } from "react";
import { IcoCoin } from "@/app/components/BidIcons";

/** Sign-up page strip: "$5 is waiting" when the visitor arrived via a welcome QR. */
export default function PromoBanner() {
  // Read once on the client; server render shows nothing (no cookie access).
  const code = useSyncExternalStore(
    () => () => {},
    () => {
      const q = new URLSearchParams(window.location.search);
      const fromQuery = q.get("promo");
      const fromCookie = document.cookie.split("; ").find((c) => c.startsWith("nb_promo="))?.slice("nb_promo=".length);
      const c = (fromQuery || fromCookie || "").toUpperCase();
      if (!c) return null;
      const amt = Number(q.get("amt")) || 5;
      return `${c}|${amt}`;
    },
    () => null
  );
  if (!code) return null;
  const amount = Number(code.split("|")[1]) || 5;
  return (
    <div className="flex items-center gap-3 bg-[#241a12] text-[#fbf4e6] px-4 py-3">
      <span className="w-9 h-9 rounded-full bg-[#f0a35a] text-[#241a12] grid place-items-center shrink-0"><IcoCoin className="w-4.5 h-4.5" /></span>
      <div className="min-w-0">
        <div className="font-display font-black text-base leading-tight">${amount} in Bid Bucks is waiting for you</div>
        <div className="text-xs text-[#c9b79a]">Finish signing up (phone included) and it lands in your account. One per person.</div>
      </div>
    </div>
  );
}
