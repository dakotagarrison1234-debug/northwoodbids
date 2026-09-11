"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useUser, useClerk } from "@clerk/nextjs";
import { useRouter, usePathname } from "next/navigation";
import { Avatar, hasAvatar } from "./Avatars";
import { IcoStar, IcoGavel, IcoMagnifier, IcoTruck, IcoGift, IcoTrophy, IcoTicket } from "./BidIcons";
import { PineMark } from "./Illustrations";

interface MeData {
  orgId?: string | null;
  orgName?: string | null;
  orgSlug?: string | null;
  role?: string | null;
  isSuperAdmin?: boolean;
  avatarKey?: string | null;
}

// ── Icons not in the shared set (same 24-grid, single weight) ──────────────
const ico = {
  className: "w-[18px] h-[18px]",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};
function IcoUser() {
  return <svg {...ico}><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20c0-4 3.4-7 7.5-7s7.5 3 7.5 7" /></svg>;
}
function IcoBarn() {
  return <svg {...ico}><path d="M4 10 12 4l8 6v10H4z" /><path d="M9 20v-6h6v6" /><path d="M4 10h16" /></svg>;
}
function IcoSignOut() {
  return <svg {...ico}><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></svg>;
}
function IcoHelp() {
  return <svg {...ico}><circle cx="12" cy="12" r="9" /><path d="M9.3 9.3a2.8 2.8 0 0 1 5.4 1c0 2-2.7 2.4-2.7 4.2" /><circle cx="12" cy="17.6" r=".6" fill="currentColor" /></svg>;
}
function IcoClose() {
  return <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" /></svg>;
}

// ── Section label ──────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#b3a085]">
      {children}
    </div>
  );
}

// ── Nav link ──────────────────────────────────────────────────────────────────
function NavLink({
  href,
  iconEl,
  label,
  sublabel,
  onClick,
  active,
  accent,
}: {
  href: string;
  iconEl: React.ReactNode;
  label: string;
  sublabel?: string;
  onClick: () => void;
  active?: boolean;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className="nb-drawer-link nb-focus group flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-[#efe3d0] no-underline"
    >
      <span
        className={`w-5 flex items-center justify-center shrink-0 transition-colors ${
          accent || active ? "text-[#6c4d39]" : "text-[#a08b6e] group-hover:text-[#6c4d39]"
        }`}
      >
        {iconEl}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-[14px] leading-tight truncate ${active ? "text-[#241a12] font-semibold" : "text-[#2c2317] font-medium group-hover:text-[#241a12]"}`}>
          {label}
        </span>
        {sublabel && (
          <span className="block text-[11.5px] text-[#a08b6e] truncate mt-0.5">{sublabel}</span>
        )}
      </span>
    </Link>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function UserMenu() {
  const { isSignedIn, isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<MeData | null>(null);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    fetch("/api/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => {});
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!isLoaded) {
    return <div className="w-9 h-9 rounded-full nb-skeleton" aria-hidden="true" />;
  }

  const initials = (
    user?.firstName?.[0] ||
    user?.emailAddresses?.[0]?.emailAddress?.[0] ||
    "?"
  ).toUpperCase();

  const displayName = user?.fullName || user?.firstName || user?.username || "Bidder";
  const email = user?.emailAddresses?.[0]?.emailAddress || "";

  if (!isSignedIn) {
    return (
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Link
          href="/sign-in"
          className="nb-focus text-[#6f5b46] hover:text-[#241a12] text-sm font-medium px-3 py-2 rounded-xl hover:bg-[#efe3d0] transition-colors whitespace-nowrap"
        >
          Sign in
        </Link>
        <Link
          href="/sign-up"
          className="nb-focus bg-[#6c4d39] hover:bg-[#563e2c] active:scale-[0.98] text-white text-sm font-semibold px-3.5 py-2 rounded-xl whitespace-nowrap transition-[background-color,transform] shadow-[0_1px_0_rgba(0,0,0,0.12)]"
        >
          Join free
        </Link>
      </div>
    );
  }

  // Org portal label — never say "admin" for staff
  const roleLabel = me?.role?.toLowerCase();
  const isManager = roleLabel === "owner" || roleLabel === "admin" || !!me?.isSuperAdmin;
  const orgPortalLabel = me?.orgName ?? "Auction house";
  const orgPortalSublabel = isManager ? "Run auctions, lots and pickup" : "Staff tools";

  const close = () => setOpen(false);
  const on = (...paths: string[]) => paths.some((p) => pathname === p || pathname?.startsWith(p + "/"));

  const drawer = (
    <>
      {/* Backdrop */}
      <div
        className="nb-fade-in fixed inset-0 z-[9998] bg-[#241a12]/45 backdrop-blur-[2px]"
        onClick={close}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Account menu"
        className="nb-drawer-in fixed top-0 right-0 bottom-0 z-[9999] w-[300px] max-w-[88vw] flex flex-col bg-[#fbf4e6] border-l border-[#e3d6bf] shadow-[-12px_0_40px_rgba(36,26,18,0.22)]"
      >
        {/* User header */}
        <div className="pt-safe shrink-0 border-b border-[#e3d6bf] bg-white/60">
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-full overflow-hidden bg-[#6c4d39]/10 border border-[#6c4d39]/20 flex items-center justify-center text-[#6c4d39] font-bold text-base shrink-0">
                {hasAvatar(me?.avatarKey) ? (
                  <Avatar avatarKey={me?.avatarKey} className="w-full h-full" />
                ) : user?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : initials}
              </div>
              <div className="min-w-0">
                <p className="font-display text-[#241a12] font-bold text-[15px] leading-tight truncate">{displayName}</p>
                <p className="text-[#8a7559] text-xs truncate mt-0.5">{email}</p>
              </div>
            </div>
            <button
              onClick={close}
              aria-label="Close menu"
              className="nb-focus text-[#a08b6e] hover:text-[#241a12] hover:bg-[#efe3d0] p-2 -mr-2 -mt-1 rounded-xl transition-colors shrink-0"
            >
              <IcoClose />
            </button>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 px-2 pb-2 overflow-y-auto min-h-0">
          <SectionLabel>Bid</SectionLabel>
          <NavLink href="/auctions" iconEl={<IcoGavel className="w-[18px] h-[18px]" />} label="Auctions" sublabel="Live now and on deck" onClick={close} active={on("/auctions")} />
          <NavLink href="/search" iconEl={<IcoMagnifier className="w-[18px] h-[18px]" />} label="Search lots" onClick={close} active={on("/search")} />

          <SectionLabel>Yours</SectionLabel>
          <NavLink href="/dashboard" iconEl={<IcoTrophy className="w-[18px] h-[18px]" />} label="My Bids" sublabel="Standing, wins and invoices" onClick={close} active={on("/dashboard", "/my-bids", "/invoice")} accent />
          <NavLink href="/watchlist" iconEl={<IcoStar className="w-[18px] h-[18px]" filled />} label="Watchlist" sublabel="Lots you have your eye on" onClick={close} active={on("/watchlist")} />
          <NavLink href="/pickup" iconEl={<IcoTruck className="w-[18px] h-[18px]" />} label="Pickup" sublabel="Owosso or Gladwin, your call" onClick={close} active={on("/pickup")} />
          <NavLink href="/refer" iconEl={<IcoGift className="w-[18px] h-[18px]" />} label="Bid Bucks" sublabel="Invite a friend, earn $5 tickets" onClick={close} active={on("/refer")} />

          <SectionLabel>Account</SectionLabel>
          <NavLink href="/account" iconEl={<IcoUser />} label="Profile" sublabel="Name, phone, payment cards" onClick={close} active={on("/account")} />
          <NavLink href="/help" iconEl={<IcoHelp />} label="Help" sublabel="How bidding, max bids and pickup work" onClick={close} active={on("/help")} />
          <NavLink href="/play" iconEl={<IcoTicket className="w-[18px] h-[18px]" />} label="Auction Arcade" sublabel="Going once, going twice" onClick={close} active={on("/play")} />

          {(me?.orgId || me?.isSuperAdmin) && (
            <>
              <SectionLabel>Auction house</SectionLabel>
              <NavLink
                href="/admin/dashboard"
                iconEl={<IcoBarn />}
                label={orgPortalLabel}
                sublabel={orgPortalSublabel}
                onClick={close}
                accent
              />
            </>
          )}
        </nav>

        {/* Sign out */}
        <div className="pb-safe shrink-0 border-t border-[#e3d6bf] px-2 pt-2 pb-4">
          <button
            onClick={async () => {
              close();
              await signOut();
              router.push("/");
            }}
            className="nb-focus w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-[#6f5b46] hover:text-[#241a12] hover:bg-[#efe3d0] text-[14px] font-medium transition-colors"
          >
            <span className="w-5 flex items-center justify-center shrink-0 text-[#a08b6e]"><IcoSignOut /></span>
            <span>Sign out</span>
          </button>
          <div className="flex items-center gap-1.5 px-4 pt-3 text-[11px] text-[#b3a085]">
            <PineMark className="w-3.5 h-3.5" />
            <span>Northwood Bids, mid-Michigan</span>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="nb-focus w-9 h-9 rounded-full overflow-hidden bg-[#6c4d39]/10 border border-[#6c4d39]/25 flex items-center justify-center text-[#6c4d39] font-semibold text-sm hover:bg-[#6c4d39]/20 hover:border-[#6c4d39]/45 active:scale-95 transition-[background-color,border-color,transform] shrink-0"
        aria-label="Open account menu"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {hasAvatar(me?.avatarKey) ? (
          <Avatar avatarKey={me?.avatarKey} className="w-full h-full" />
        ) : user?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : initials}
      </button>

      {open && mounted && createPortal(drawer, document.body)}
    </>
  );
}
