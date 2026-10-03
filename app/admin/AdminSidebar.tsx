"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import AdminNavIcon from "./AdminNavIcon";
import { groupForPath, isActivePage, type NavGroup } from "./nav";

/**
 * Desktop sidebar — the dark "workshop" rail. Seven groups; the active group opens
 * to show its pages. The logo goes to the public home page (what customers see),
 * and there's an explicit "View site" link for the same reason.
 */
export default function AdminSidebar({
  groups,
  orgName,
  role,
  logoUrl,
}: {
  groups: NavGroup[];
  orgName: string;
  role: string;
  logoUrl: string;
}) {
  const pathname = usePathname() ?? "";
  const active = groupForPath(pathname);
  const { signOut } = useClerk();
  const { user } = useUser();

  return (
    <aside className="hidden md:flex w-[248px] shrink-0 flex-col bg-[#241a12] text-[#f1e7d5] border-r border-black/20">
      {/* Brand — tapping the logo goes HOME (the customer site), not the admin. */}
      <div className="px-5 pt-5 pb-4">
        <Link href="/" className="block rounded-xl bg-[#fbf4e6] p-2.5 hover:bg-white transition-colors" title="Go to the home page">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={orgName} className="h-11 w-auto max-w-[190px] object-contain mx-auto" />
        </Link>
        <div className="mt-3 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f0a35a]">Workshop</div>
            <div className="text-xs text-[#c9b79a] capitalize truncate">{role}</div>
          </div>
          <Link href="/" className="inline-flex items-center gap-1 text-[11px] font-bold text-[#c9b79a] hover:text-[#fbf4e6]">
            <AdminNavIcon name="site" size={14} /> View site
          </Link>
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {groups.map((g) => {
          const on = active?.key === g.key;
          return (
            <div key={g.key}>
              <Link
                href={g.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-bold transition-colors ${
                  on ? "bg-white/10 text-[#fbf4e6] nb-side-active" : "text-[#d9c7ab] hover:bg-white/5 hover:text-[#fbf4e6]"
                }`}
              >
                <span className={`w-6 h-6 grid place-items-center shrink-0 ${on ? "text-[#f0a35a]" : ""}`}>
                  <AdminNavIcon name={g.icon} />
                </span>
                <span>{g.label}</span>
              </Link>
              {on && g.pages.length > 1 && (
                <div className="ml-6 pl-4 border-l border-white/10 my-1 space-y-0.5">
                  {g.pages.map((p) => {
                    const pOn = isActivePage(pathname, p.href);
                    return (
                      <Link
                        key={p.href}
                        href={p.href}
                        className={`block px-2.5 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
                          pOn ? "text-[#f0a35a]" : "text-[#b9a688] hover:text-[#fbf4e6] hover:bg-white/5"
                        }`}
                      >
                        {p.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="pt-3 mt-3 border-t border-white/10 space-y-0.5">
          <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-[#b9a688] hover:text-[#fbf4e6] hover:bg-white/5">
            <span className="w-6 h-6 grid place-items-center"><AdminNavIcon name="mybids" size={18} /></span> My bids
          </Link>
        </div>
      </nav>

      {/* Account */}
      <div className="px-4 py-4 border-t border-white/10 flex items-center gap-3">
        {user?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.imageUrl} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-white/10" />
        ) : (
          <span className="w-9 h-9 rounded-full bg-white/10" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-[#fbf4e6] truncate">{user?.firstName || user?.username || "You"}</div>
          <div className="text-[11px] text-[#b9a688] truncate">{orgName}</div>
        </div>
        <button
          onClick={async () => { await signOut(); window.location.href = "/"; }}
          className="w-9 h-9 grid place-items-center rounded-lg text-[#b9a688] hover:text-[#fbf4e6] hover:bg-white/10"
          aria-label="Sign out"
          title="Sign out"
        >
          <AdminNavIcon name="out" size={18} />
        </button>
      </div>
    </aside>
  );
}
