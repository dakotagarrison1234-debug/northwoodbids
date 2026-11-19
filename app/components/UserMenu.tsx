"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useUser, useClerk } from "@clerk/nextjs";
import { useRouter, usePathname } from "next/navigation";
import { Avatar, hasAvatar } from "./Avatars";
import { IcoStar, IcoGavel, IcoMagnifier, IcoTruck, IcoGift, IcoTrophy, IcoTicket, IcoBox } from "./BidIcons";
import { MenuHalloween } from "./Halloween";

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
    <div className="px-4 pt-5 pb-1.5 text-[13px] font-black uppercase tracking-[0.14em] text-[#8a7559]">
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
      className="nb-drawer-link nb-focus group flex items-center gap-3.5 px-3 min-h-[54px] rounded-2xl hover:bg-[#efe3d0] no-underline"
    >
      <span
        className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 transition-colors [&>svg]:w-[22px] [&>svg]:h-[22px] ${
          active ? "bg-[#6c4d39] text-[#f0a35a]" : accent ? "bg-[#efe3d0] text-[#6c4d39]" : "bg-white text-[#8a6a4c] group-hover:text-[#6c4d39]"
        }`}
      >
        {iconEl}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-[17px] leading-tight truncate ${active ? "text-[#241a12] font-black" : "text-[#2c2317] font-bold group-hover:text-[#241a12]"}`}>
          {label}
        </span>
        {sublabel && (
          <span className="block text-[14px] text-[#8a7559] truncate mt-0.5">{sublabel}</span>
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
          className="nb-focus hidden min-[360px]:inline-flex items-center h-11 px-3 sm:px-4 rounded-full text-[#4a3a2b] hover:text-[#241a12] hover:bg-[#efe3d0] text-[15px] sm:text-[16px] font-bold transition-colors whitespace-nowrap"
        >
          Sign in
        </Link>
        <Link
          href="/sign-up"
          className="nb-focus inline-flex items-center h-11 px-4 sm:px-5 rounded-full bg-[#f0a35a] hover:bg-[#f4b273] active:scale-[0.98] text-[#241a12] text-[15px] sm:text-[16px] font-black whitespace-nowrap transition-[background-color,transform] shadow-[0_6px_16px_-8px_rgba(196,123,62,0.9)]"
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
        className="nb-drawer-in fixed top-0 right-0 bottom-0 z-[9999] w-[340px] max-w-[90vw] flex flex-col bg-[#fbf4e6] border-l border-[#e3d6bf] shadow-[-12px_0_40px_rgba(36,26,18,0.22)]"
      >
        {/* User header */}
        <div className="pt-safe shrink-0 border-b border-[#e3d6bf] bg-white/60">
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-14 h-14 rounded-full overflow-hidden bg-[#6c4d39]/10 border-2 border-[#6c4d39]/20 flex items-center justify-center text-[#6c4d39] font-bold text-lg shrink-0">
                {hasAvatar(me?.avatarKey) ? (
                  <Avatar avatarKey={me?.avatarKey} className="w-full h-full" />
                ) : user?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : initials}
              </div>
              <div className="min-w-0">
                <p className="font-display text-[#241a12] font-black text-[19px] leading-tight truncate">{displayName}</p>
                <p className="text-[#8a7559] text-sm truncate mt-0.5">{email}</p>
              </div>
            </div>
            <button
              onClick={close}
              aria-label="Close menu"
              className="nb-focus w-11 h-11 grid place-items-center -mr-1.5 -mt-1 rounded-full bg-white text-[#6f5b46] hover:text-[#241a12] hover:bg-[#efe3d0] transition-colors shrink-0 [&>svg]:w-5 [&>svg]:h-5"
            >
              <IcoClose />
            </button>
          </div>
        </div>

        <MenuHalloween />

        {/* Navigation links */}
        <nav className="flex-1 px-2 pb-2 overflow-y-auto min-h-0">
          <SectionLabel>Bid</SectionLabel>
          <NavLink href="/auctions" iconEl={<IcoGavel className="w-[18px] h-[18px]" />} label="Auctions" onClick={close} active={on("/auctions")} />
          <NavLink href="/search" iconEl={<IcoMagnifier className="w-[18px] h-[18px]" />} label="Search" onClick={close} active={on("/search")} />

          <SectionLabel>Yours</SectionLabel>
          <NavLink href="/dashboard" iconEl={<IcoTrophy className="w-[18px] h-[18px]" />} label="My Bids" onClick={close} active={on("/dashboard", "/my-bids", "/invoice")} accent />
          <NavLink href="/watchlist" iconEl={<IcoStar className="w-[18px] h-[18px]" filled />} label="Watchlist" onClick={close} active={on("/watchlist")} />
          <NavLink href="/pickup" iconEl={<IcoTruck className="w-[18px] h-[18px]" />} label="Pickup" onClick={close} active={on("/pickup")} />
          <NavLink href="/shipping" iconEl={<IcoBox className="w-[18px] h-[18px]" />} label="Shipping" onClick={close} active={on("/shipping")} />
          <NavLink href="/refer" iconEl={<IcoGift className="w-[18px] h-[18px]" />} label="Bid Bucks" onClick={close} active={on("/refer")} />
          <NavLink href="/giveaways" iconEl={<IcoTicket className="w-[18px] h-[18px]" />} label="Giveaways" onClick={close} active={on("/giveaways")} />

          <SectionLabel>Account</SectionLabel>
          <NavLink href="/account" iconEl={<IcoUser />} label="My account" onClick={close} active={on("/account")} />
          <NavLink href="/help" iconEl={<IcoHelp />} label="Help" onClick={close} active={on("/help")} />
          <NavLink href="/play" iconEl={<IcoTicket className="w-[18px] h-[18px]" />} label="Northwood Arcade" onClick={close} active={on("/play")} />

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
            className="nb-focus w-full flex items-center gap-3.5 px-3 min-h-[54px] rounded-2xl text-[#4a3a2b] hover:text-[#241a12] hover:bg-[#efe3d0] text-[17px] font-bold transition-colors"
          >
            <span className="w-10 h-10 rounded-xl grid place-items-center bg-white text-[#8a6a4c] shrink-0 [&>svg]:w-[22px] [&>svg]:h-[22px]"><IcoSignOut /></span>
            <span>Sign out</span>
          </button>

        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="nb-focus inline-flex items-center gap-2 h-11 pl-1 pr-3.5 sm:pr-4 rounded-full bg-white border-2 border-[#e3d6bf] hover:border-[#c9b391] active:scale-[0.98] transition-[border-color,transform] shrink-0"
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="w-8 h-8 rounded-full overflow-hidden bg-[#6c4d39]/10 flex items-center justify-center text-[#6c4d39] font-bold text-sm shrink-0">
          {hasAvatar(me?.avatarKey) ? (
            <Avatar avatarKey={me?.avatarKey} className="w-full h-full" />
          ) : user?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : initials}
        </span>
        <span className="text-[15px] sm:text-[16px] font-bold text-[#241a12] max-w-[110px] truncate">
          <span className="md:hidden">Menu</span>
          <span className="hidden md:inline">{user?.firstName || "Menu"}</span>
        </span>
        <svg className="w-4 h-4 text-[#8a6a4c] shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 6l5 5 5-5" />
        </svg>
      </button>

      {open && mounted && createPortal(drawer, document.body)}
    </>
  );
}
