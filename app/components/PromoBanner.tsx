"use client";
import { useSyncExternalStore } from "react";
import { IcoCoin, IcoTruck, IcoGift } from "@/app/components/BidIcons";
import AuthLogo from "@/app/components/AuthLogo";
import OpenSign from "@/app/components/OpenSign";

const CHIPS: { Icon: (p: { className?: string }) => React.ReactElement; label: string }[] = [
  { Icon: IcoTruck, label: "Free transfers" },
  { Icon: IcoGift, label: "Free sign up" },
];

export type PromoHint = { code: string; amount: number } | null;

/**
 * Top of the sign-up card. Two looks:
 *   - normal: logo, "Brand-name deals from $2", benefit chips
 *   - welcome QR: logo + "Sign up, get $5 in Bid Bucks — completely free" and
 *     nothing else (the business card already carries the pitch).
 * The server knows about the QR when `?promo=` is in the URL (the /go link lands
 * here with it); the client also checks the nb_promo cookie so a visitor who
 * wandered off and came back still sees the welcome version with no flash.
 */
export default function SignUpHeader({ initialPromo }: { initialPromo: PromoHint }) {
  const fromClient = useSyncExternalStore(
    () => () => {},
    () => {
      const q = new URLSearchParams(window.location.search);
      const fromQuery = q.get("promo");
      const fromCookie = document.cookie.split("; ").find((c) => c.startsWith("nb_promo="))?.slice("nb_promo=".length);
      const c = (fromQuery || fromCookie || "").toUpperCase();
      if (!c) return null;
      const amt = Number(q.get("amt")) || initialPromo?.amount || 5;
      return `${c}|${amt}`;
    },
    () => (initialPromo ? `${initialPromo.code}|${initialPromo.amount}` : null)
  );

  const promo: PromoHint = fromClient
    ? { code: fromClient.split("|")[0], amount: Number(fromClient.split("|")[1]) || 5 }
    : initialPromo;

  if (promo) {
    return (
      <>
      <div className="relative px-6 pt-8 pb-7 text-center text-white" style={{ background: "linear-gradient(140deg,#6c4d39,#8a5a2f)" }}>
        <AuthLogo size="lg" />
        <div className="inline-flex items-center gap-2 bg-[#f0a35a] text-[#241a12] font-black text-sm px-3 py-1.5 rounded-full mb-3">
          <IcoCoin className="w-4 h-4" /> ${promo.amount} in Bid Bucks
        </div>
        <h1 className="font-display text-[1.75rem] leading-tight font-black">Sign up and get ${promo.amount} to bid. Completely free.</h1>
        <p className="text-white/85 text-sm mt-2">It lands in your account the moment you finish. One per person.</p>
      </div>
      <div className="px-5 pt-4"><OpenSign /></div>
      </>
    );
  }

  return (
    <>
      <div className="relative px-6 pt-7 pb-6 text-center text-white" style={{ background: "linear-gradient(140deg,#6c4d39,#8a5a2f)" }}>
        <AuthLogo />
        <h1 className="font-display text-[1.7rem] leading-tight font-black">Brand-name deals from $2</h1>
        <p className="text-white/85 text-sm mt-1">Free to join. You only pay if you win.</p>
      </div>
      <div className="px-5 pt-4"><OpenSign /></div>
      <div className="px-5 pt-4 flex flex-wrap justify-center gap-1.5">
        {CHIPS.map((c) => (
          <span key={c.label} className="inline-flex items-center gap-2 bg-[#faf5ea] border border-[#e3d6bf] text-[#4a3a2b] text-[15px] font-bold px-3.5 py-2 rounded-full">
            <c.Icon className="w-4 h-4 text-[#6c4d39]" /> {c.label}
          </span>
        ))}
      </div>
    </>
  );
}
