"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GavelEmblem } from "@/app/components/Illustrations";
import { IcoShield } from "@/app/components/BidIcons";

// Northwood Bids is a single-business auction site — there is no public
// host-application flow. This route redirects home; the card below is what
// shows for the half-second before that lands (and for anyone with JS off).
export default function ApplyPendingPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f3ead6] to-[#ece0c9] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white border border-[#e3d6bf] rounded-3xl shadow-[0_24px_60px_-24px_rgba(108,77,57,0.5)] overflow-hidden">
          <div className="relative px-6 pt-7 pb-6 text-center text-white" style={{ background: "linear-gradient(140deg,#6c4d39,#8a5a2f)" }}>
            <GavelEmblem className="w-16 h-16 mx-auto mb-3 drop-shadow" />
            <h1 className="font-display text-[1.6rem] leading-tight font-black">Nothing pending here</h1>
            <p className="text-white/85 text-sm mt-1">Northwood Bids runs its own auctions, so there&apos;s no application to wait on.</p>
          </div>
          <div className="px-6 py-6 text-center">
            <p className="text-sm text-[#6f5b46] leading-relaxed">
              Taking you to the lots now. Every one starts at $2.
            </p>
            <Link href="/" className="mt-5 inline-flex w-full items-center justify-center bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold py-3 rounded-xl transition-colors">
              Go to the auctions
            </Link>
          </div>
        </div>
        <p className="text-[#8a7559] text-xs mt-4 text-center flex items-center justify-center gap-1.5">
          <IcoShield className="w-3.5 h-3.5" />
          Owosso &amp; Gladwin, MI
        </p>
      </div>
    </div>
  );
}
