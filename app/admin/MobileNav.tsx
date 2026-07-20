"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";

function NavIcon({ name }: { name: string }) {
  const s = { width: 24, height: 24, fill: "none", viewBox: "0 0 16 16", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "grid") return <svg {...s}><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>;
  if (name === "gavel") return <svg {...s}><path d="M10 2L6 6l4 4 4-4-4-4zM2 14l5-5"/><path d="M6 10l-4 4"/></svg>;
  if (name === "trophy") return <svg {...s}><path d="M4 3H2V6a4 4 0 0 0 3.5 3.97M12 3h2V6a4 4 0 0 1-3.5 3.97M4 3h8v5a4 4 0 0 1-8 0V3zM6 14h4M8 12v2"/></svg>;
  if (name === "package") return <svg {...s}><path d="M8 2L2 5v6l6 3 6-3V5L8 2z"/><path d="M2 5l6 3 6-3M8 8v7"/></svg>;
  if (name === "users") return <svg {...s}><circle cx="6" cy="5" r="2.5"/><path d="M1 14c0-3 2-4.5 5-4.5s5 1.5 5 4.5"/><circle cx="12" cy="5" r="2"/><path d="M12 10c2 0 3 1 3 3.5"/></svg>;
  if (name === "settings") return <svg {...s}><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/></svg>;
  if (name === "mybids") return <svg {...s}><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5l2 1.5"/></svg>;
  if (name === "home") return <svg {...s}><path d="M2 7L8 2l6 5v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7z"/><path d="M6 14V9h4v5"/></svg>;
  if (name === "bolt") return <svg {...s}><path d="M9 2L4 9h4l-1 5 6-7H9l1-5z"/></svg>;
  if (name === "chart") return <svg {...s}><path d="M2 2v12h12"/><path d="M5 11V8M8 11V5M11 11V9"/></svg>;
  if (name === "gift") return <svg {...s}><rect x="2" y="6" width="12" height="8" rx="1"/><path d="M2 9h12M8 6v8"/><path d="M8 6S6.5 2.5 4.5 3.5 6 6 8 6zM8 6s1.5-3.5 3.5-2.5S10 6 8 6z"/></svg>;
  return null;
}

interface NavItem { label: string; href: string; icon: string; }

interface Props {
  navItems: NavItem[];
  orgName: string;
  role: string;
}

export default function MobileNav({ navItems, orgName, role }: Props) {
  const [open, setOpen] = useState(false);
  const { signOut } = useClerk();
  const pathname = usePathname();

  // The four screens staff actually live in get a permanent bottom bar. Everything
  // else stays in the drawer. Reaching Pickup used to be three taps (hamburger →
  // scroll → tap) on a screen someone opens twenty times a shift; now it's one,
  // and it's at the bottom where a thumb already is.
  const TABS = [
    { href: "/admin/dashboard", label: "Today", icon: "home" },
    { href: "/admin/auctions", label: "Auctions", icon: "gavel" },
    { href: "/admin/pickup", label: "Pickup", icon: "package" },
    { href: "/admin/winners", label: "Money", icon: "trophy" },
  ].filter((t) => navItems.some((n) => n.href === t.href) || t.href === "/admin/dashboard");

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    window.location.href = "/";
  };

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden bar-safe-top safe-x flex items-center justify-between px-4 pb-3 bg-white border-b border-[#e3d6bf] sticky top-0 z-40">
        <Link href="/admin/dashboard" className="text-[#6c4d39] font-bold text-xl">Northwood Bids</Link>
        <button onClick={() => setOpen(true)} className="text-[#6f5b46] hover:text-[#241a12] p-2" aria-label="Open menu">
          <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Drawer overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          {/* Drawer */}
          <div className="relative w-72 bg-white flex flex-col h-full shadow-2xl">
            <div className="bar-safe-top px-6 pb-5 border-b border-[#e3d6bf] flex items-center justify-between">
              <div>
                <span className="text-[#6c4d39] font-bold text-2xl">Northwood Bids</span>
                <p className="text-[#4a3a2b] text-base mt-0.5 font-medium truncate">{orgName}</p>
                <span className="text-sm text-[#8a7559] capitalize">{role}</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-[#8a7559] hover:text-[#241a12] p-1">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="4" y1="4" x2="16" y2="16" />
                  <line x1="16" y1="4" x2="4" y2="16" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-[#6f5b46] hover:text-[#241a12] hover:bg-[#efe3d0] transition-colors text-base font-semibold"
                >
                  <span className="w-6 h-6 flex items-center justify-center shrink-0"><NavIcon name={item.icon} /></span>
                  <span>{item.label}</span>
                </Link>
              ))}

              <div className="pt-2 border-t border-[#e3d6bf] mt-2 space-y-1">
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-[#6f5b46] hover:text-[#241a12] hover:bg-[#efe3d0] transition-colors text-base font-semibold"
                >
                  <span className="w-6 h-6 flex items-center justify-center shrink-0"><NavIcon name="mybids" /></span>
                  <span>My Bids</span>
                </Link>
                <Link
                  href="/auctions"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-[#6f5b46] hover:text-[#241a12] hover:bg-[#efe3d0] transition-colors text-base font-semibold"
                >
                  <span className="w-6 h-6 flex items-center justify-center shrink-0"><NavIcon name="home" /></span>
                  <span>Browse Auctions</span>
                </Link>
              </div>
            </nav>

            {/* Sign out */}
            <div className="bar-safe-bottom px-4 pt-3 border-t border-[#e3d6bf]">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-red-600 hover:text-red-300 hover:bg-red-50 transition-colors text-base font-semibold"
              >
                <span>→</span>
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom tab bar (mobile only) ──
          Fixed, thumb-height, always visible. The fifth slot opens the drawer for
          everything else, so nothing is lost — it's just no longer the only way in. */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 bar-safe-bottom safe-x flex">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 pt-2 pb-1 min-h-[56px] ${
                active ? "text-slate-900" : "text-slate-400"
              }`}
            >
              <span className="w-6 h-6 flex items-center justify-center"><NavIcon name={t.icon} /></span>
              <span className={`text-[11px] ${active ? "font-extrabold" : "font-semibold"}`}>{t.label}</span>
              {/* Active marker — a bar reads faster than a colour change alone. */}
              <span className={`h-0.5 w-6 rounded-full ${active ? "bg-slate-900" : "bg-transparent"}`} />
            </Link>
          );
        })}
        <button
          onClick={() => setOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 pt-2 pb-1 min-h-[56px] text-slate-400"
          aria-label="More"
        >
          <span className="w-6 h-6 flex items-center justify-center">
            <svg width="24" height="24" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="3.5" cy="8" r="1" fill="currentColor" /><circle cx="8" cy="8" r="1" fill="currentColor" /><circle cx="12.5" cy="8" r="1" fill="currentColor" />
            </svg>
          </span>
          <span className="text-[11px] font-semibold">More</span>
          <span className="h-0.5 w-6" />
        </button>
      </nav>

    </>
  );
}
