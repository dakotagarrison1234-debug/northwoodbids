import Link from "next/link";
import { PineMark, BranchDivider } from "./Illustrations";

function Pin() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M12 21s-7-6.3-7-11a7 7 0 1 1 14 0c0 4.7-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

// Rustic "country woods" footer: weathered plank-wood panel + warm lantern glow.
export default function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-[#2f2114] text-[#e7dcc6]">
      {/* Weathered vertical plank grain */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 1px, transparent 1px, transparent 7px), repeating-linear-gradient(90deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 2px, transparent 2px, transparent 46px)",
        }}
      />
      {/* Warm lantern glow spilling from the top */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(130% 90% at 50% -15%, rgba(108,77,57,0.5), transparent 55%)" }}
      />

      <div className="relative max-w-5xl mx-auto px-6 pt-10 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <PineMark className="w-7 h-7" />
            <span className="font-display font-extrabold text-lg text-white">Northwood Bids</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[#cdbda3]">
            <Link href="/help" className="hover:text-white transition-colors">Help &amp; Info</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
          </div>
        </div>

        <div className="my-6 opacity-40 text-[#cdbda3]">
          <BranchDivider className="w-full h-4" />
        </div>

        {/* Pickup locations */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm max-w-lg">
          <div>
            <div className="font-semibold text-[#e7dcc6] mb-0.5 flex items-center gap-1.5"><Pin /> Gladwin, Michigan</div>
            <p className="text-[#b3a085]">Pickup location</p>
          </div>
          <div>
            <div className="font-semibold text-[#e7dcc6] mb-0.5 flex items-center gap-1.5"><Pin /> Owosso, Michigan</div>
            <p className="text-[#b3a085]">Pickup location</p>
          </div>
        </div>

        <div className="mt-7 pt-5 border-t border-white/10 text-xs text-[#b3a085]">
          © {new Date().getFullYear()} Northwood Bids. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
