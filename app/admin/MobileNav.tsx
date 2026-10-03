"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import AdminNavIcon from "./AdminNavIcon";
import { groupForPath, isActivePage, type NavGroup } from "./nav";

/**
 * Phone chrome: a slim top bar (logo → home), a drawer with every group and its
 * pages, and a fixed bottom tab bar for the four screens staff live in. Reaching
 * Pickup is one thumb-tap from anywhere.
 */
export default function MobileNav({ groups, orgName, role, logoUrl }: { groups: NavGroup[]; orgName: string; role: string; logoUrl: string }) {
  const [open, setOpen] = useState(false);
  const { signOut } = useClerk();
  const pathname = usePathname() ?? "";
  const active = groupForPath(pathname);

  const TAB_KEYS = ["today", "auctions", "pickup", "money"];
  const tabs = TAB_KEYS.map((k) => groups.find((g) => g.key === k)).filter((g): g is NavGroup => !!g);

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    window.location.href = "/";
  };

  return (
    <>
      {/* Top bar */}
      <div className="md:hidden bar-safe-top safe-x flex items-center justify-between px-4 pb-2.5 bg-[#241a12] text-[#f1e7d5] sticky top-0 z-40">
        <Link href="/" className="flex items-center shrink-0 rounded-lg bg-[#fbf4e6] px-2 py-1" title="Go to the home page">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={orgName} className="h-7 w-auto max-w-[150px] object-contain" />
        </Link>
        <div className="flex items-center gap-1">
          {active && <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#f0a35a] mr-1">{active.label}</span>}
          <button onClick={() => setOpen(true)} className="w-11 h-11 grid place-items-center rounded-lg text-[#f1e7d5] hover:bg-white/10" aria-label="Open menu">
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
        </div>
      </div>

      {/* Drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative w-[300px] max-w-[88vw] bg-[#241a12] text-[#f1e7d5] flex flex-col h-full shadow-2xl nb-drawer-in">
            <div className="bar-safe-top px-5 pb-4 border-b border-white/10 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f0a35a]">Workshop</div>
                <div className="font-display text-xl font-black text-[#fbf4e6] truncate">{orgName}</div>
                <div className="text-xs text-[#b9a688] capitalize">{role}</div>
              </div>
              <button onClick={() => setOpen(false)} className="w-10 h-10 grid place-items-center rounded-lg text-[#b9a688] hover:text-[#fbf4e6] hover:bg-white/10" aria-label="Close menu">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
              </button>
            </div>

            <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-0.5">
              {groups.map((g) => {
                const on = active?.key === g.key;
                return (
                  <div key={g.key}>
                    <Link
                      href={g.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-bold ${on ? "bg-white/10 text-[#fbf4e6] nb-side-active" : "text-[#d9c7ab] hover:bg-white/5"}`}
                    >
                      <span className={`w-6 h-6 grid place-items-center ${on ? "text-[#f0a35a]" : ""}`}><AdminNavIcon name={g.icon} /></span>
                      {g.label}
                    </Link>
                    {g.pages.length > 1 && (
                      <div className="ml-6 pl-4 border-l border-white/10 my-1 space-y-0.5">
                        {g.pages.map((p) => (
                          <Link
                            key={p.href}
                            href={p.href}
                            onClick={() => setOpen(false)}
                            className={`block px-2.5 py-2 rounded-lg text-[13px] font-semibold ${isActivePage(pathname, p.href) ? "text-[#f0a35a]" : "text-[#b9a688] hover:text-[#fbf4e6]"}`}
                          >
                            {p.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="pt-3 mt-3 border-t border-white/10 space-y-0.5">
                <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-[#b9a688] hover:text-[#fbf4e6]">
                  <span className="w-6 h-6 grid place-items-center"><AdminNavIcon name="site" size={18} /></span> View the site
                </Link>
                <Link href="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-[#b9a688] hover:text-[#fbf4e6]">
                  <span className="w-6 h-6 grid place-items-center"><AdminNavIcon name="mybids" size={18} /></span> My bids
                </Link>
              </div>
            </nav>

            <div className="bar-safe-bottom px-4 pt-3 border-t border-white/10">
              <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[#f0a35a] hover:bg-white/5 text-[15px] font-bold">
                <span className="w-6 h-6 grid place-items-center"><AdminNavIcon name="out" size={18} /></span> Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#241a12] border-t border-black/30 bar-safe-bottom safe-x flex">
        {tabs.map((g) => {
          const on = active?.key === g.key;
          return (
            <Link
              key={g.key}
              href={g.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 pt-2 pb-1 min-h-[56px] ${on ? "text-[#f0a35a]" : "text-[#9f8c6e]"}`}
            >
              <span className="w-6 h-6 grid place-items-center"><AdminNavIcon name={g.icon} /></span>
              <span className={`text-[11px] ${on ? "font-extrabold" : "font-semibold"}`}>{g.label}</span>
              <span className={`h-0.5 w-6 rounded-full ${on ? "bg-[#f0a35a]" : "bg-transparent"}`} />
            </Link>
          );
        })}
        <button onClick={() => setOpen(true)} className="flex-1 flex flex-col items-center justify-center gap-0.5 pt-2 pb-1 min-h-[56px] text-[#9f8c6e]" aria-label="More">
          <span className="w-6 h-6 grid place-items-center"><AdminNavIcon name="more" /></span>
          <span className="text-[11px] font-semibold">More</span>
          <span className="h-0.5 w-6" />
        </button>
      </nav>
    </>
  );
}
