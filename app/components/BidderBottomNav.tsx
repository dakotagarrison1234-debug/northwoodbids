"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";

// Mobile bottom tab bar for signed-in bidders — persists across ALL bidder pages
// (My Bids, Auctions, Pickup, item pages…) so the common destinations are always
// one tap away. Hidden on desktop, admin, auth, and the game.

function IcoGrid() {
  return <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
}
function IcoGavel() {
  return <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4l6 6-3 3-6-6 3-3zM3 21l6-6"/><path d="M9 9l-4 4"/></svg>;
}
function IcoPackage() {
  return <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L3 7v10l9 5 9-5V7l-9-5z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>;
}

export default function BidderBottomNav() {
  const pathname = usePathname() || "";
  const { isSignedIn, isLoaded } = useUser();

  if (!isLoaded || !isSignedIn) return null;
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/play") ||
    // The dashboard ("My Bids") renders its own richer bottom bar (with the
    // active-bid count + in-page tabs) — don't double up there.
    pathname.startsWith("/dashboard")
  ) {
    return null;
  }

  const items = [
    { href: "/dashboard", label: "Bids", icon: <IcoGrid />, red: true, active: pathname.startsWith("/dashboard") },
    { href: "/auctions", label: "Auctions", icon: <IcoGavel />, red: false, active: pathname.startsWith("/auctions") },
    { href: "/pickup", label: "Pickup", icon: <IcoPackage />, red: false, active: pathname.startsWith("/pickup") },
  ];

  return (
    <>
      {/* Spacer so page content can scroll clear of the fixed bar (mobile only). */}
      <div className="h-20 md:hidden" aria-hidden />
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-[#e3d6bf]/60 flex z-50 bar-safe-bottom safe-x">
        {items.map((it) => {
          const color = it.red
            ? "text-red-600"
            : it.active
            ? "text-[#6c4d39]"
            : "text-[#8a7559] hover:text-[#6f5b46]";
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors ${color}`}
            >
              {it.icon}
              <span className="text-[9px] font-semibold leading-none tracking-wide uppercase">{it.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
