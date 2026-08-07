"use client";
import { Suspense, useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";

// App-style bottom navigation for signed-in bidders on mobile. One tap to the
// screens that matter. Hidden on desktop (top nav takes over), on admin/auth
// screens, and when signed out.
const HIDE_PREFIXES = ["/admin", "/superadmin", "/sign-in", "/sign-up", "/play", "/invoice"];

function IcoHome() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" /><path d="M9.5 21v-6h5v6" /></svg>;
}
function IcoGavel() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4l6 6-3 3-6-6z" /><path d="M11 7 4 14l3 3 7-7" /><path d="M3 21h8" /></svg>;
}
function IcoTrophy() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M17 4H7v6a5 5 0 0 0 10 0V4z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></svg>;
}
function IcoBox() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 3 7.5 12 12l9-4.5L12 3z" /><path d="M3 7.5v9L12 21l9-4.5v-9M12 12v9" /></svg>;
}
function IcoUser() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>;
}

function TabBarInner() {
  const { isSignedIn, isLoaded } = useUser();
  const pathname = usePathname() || "/";
  const params = useSearchParams();
  const tab = params.get("tab");

  const hidden = !isLoaded || !isSignedIn || HIDE_PREFIXES.some((p) => pathname.startsWith(p));

  // Give the page bottom room so the fixed bar never covers content (mobile only).
  useEffect(() => {
    document.body.classList.toggle("nb-tabbar", !hidden);
    return () => document.body.classList.remove("nb-tabbar");
  }, [hidden]);

  if (hidden) return null;

  const onDash = pathname === "/dashboard";
  const tabs = [
    { href: "/", label: "Home", Icon: IcoHome, active: pathname === "/" },
    { href: "/dashboard", label: "Bids", Icon: IcoGavel, active: onDash && tab !== "history" },
    { href: "/dashboard?tab=history", label: "Wins", Icon: IcoTrophy, active: onDash && tab === "history" },
    { href: "/pickup", label: "Pickup", Icon: IcoBox, active: pathname.startsWith("/pickup") },
    { href: "/account", label: "Profile", Icon: IcoUser, active: pathname.startsWith("/account") },
  ];

  return (
    <nav
      className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-t border-[#e3d6bf] pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <div className="flex">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold ${
              t.active ? "text-[#6c4d39]" : "text-[#a3927b]"
            }`}
          >
            <t.Icon />
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export default function BidderTabBar() {
  return (
    <Suspense fallback={null}>
      <TabBarInner />
    </Suspense>
  );
}
