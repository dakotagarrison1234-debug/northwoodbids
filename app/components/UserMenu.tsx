"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useUser, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

interface MeData {
  orgId?: string | null;
  orgName?: string | null;
  orgSlug?: string | null;
  role?: string | null;
  isSuperAdmin?: boolean;
}

// ── Icons ──────────────────────────────────────────────────────────────────────
function IcoGavel() {
  return <svg width="16" height="16" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2L6 6l4 4 4-4-4-4zM2 14l5-5"/><path d="M6 10l-4 4"/></svg>;
}
function IcoSearch() {
  return <svg width="16" height="16" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="4.5"/><path d="M13 13l-2.5-2.5"/></svg>;
}
function IcoHome() {
  return <svg width="16" height="16" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7L8 2l6 5v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7z"/><path d="M6 14V9h4v5"/></svg>;
}
function IcoHistory() {
  return <svg width="16" height="16" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5l2 1.5"/></svg>;
}
function IcoCard() {
  return <svg width="16" height="16" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="14" height="10" rx="1.5"/><path d="M1 7h14"/></svg>;
}
function IcoUser() {
  return <svg width="16" height="16" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="5.5" r="3"/><path d="M2 14c0-3.31 2.69-6 6-6s6 2.69 6 6"/></svg>;
}
function IcoBuilding() {
  return <svg width="16" height="16" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M5 14V9h6v5"/><path d="M5 7h2M9 7h2"/></svg>;
}
function IcoBolt() {
  return <svg width="16" height="16" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2L4 9h4l-1 5 6-7H9l1-5z"/></svg>;
}
function IcoSignOut() {
  return <svg width="16" height="16" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-3M6 11l4-3-4-3M2 8h8"/></svg>;
}
function IcoHelp() {
  return <svg width="16" height="16" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M6 6a2 2 0 0 1 3.46 1C9.46 8.5 8 9 8 10"/><circle cx="8" cy="12" r=".5" fill="currentColor"/></svg>;
}

// ── Section label ──────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "12px 16px 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#b0a99a" }}>
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
  accent,
}: {
  href: string;
  iconEl: React.ReactNode;
  label: string;
  sublabel?: string;
  onClick: () => void;
  accent?: "teal" | "orange";
}) {
  const accentColor = accent === "orange" ? "#f97316" : accent === "teal" ? "#09a7ad" : undefined;
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderRadius: 12, transition: "background 0.15s", textDecoration: "none" }}
      className="group hover:bg-[#f2efe8]"
    >
      <span style={{ width: 20, display: "flex", alignItems: "center", justifyContent: "center", color: accentColor ?? "#8c8778", flexShrink: 0 }}
        className="group-hover:text-[#4a4640]">
        {iconEl}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, color: accentColor ?? "#2c2a24", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          className="group-hover:text-[#1a1916]">
          {label}
        </span>
        {sublabel && (
          <span style={{ display: "block", fontSize: 11, color: "#b0a99a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
            {sublabel}
          </span>
        )}
      </span>
    </Link>
  );
}

// ── Divider ────────────────────────────────────────────────────────────────────
function Divider() {
  return <div style={{ height: 1, background: "#e5e0d5", margin: "6px 0" }} />;
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function UserMenu() {
  const { isSignedIn, isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<MeData | null>(null);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

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

  if (!isLoaded) {
    return <div className="w-9 h-9 rounded-full bg-[#f2efe8] animate-pulse" />;
  }

  const initials = (
    user?.firstName?.[0] ||
    user?.emailAddresses?.[0]?.emailAddress?.[0] ||
    "?"
  ).toUpperCase();

  const displayName = user?.fullName || user?.firstName || "Bidder";
  const email = user?.emailAddresses?.[0]?.emailAddress || "";

  if (!isSignedIn) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/sign-in"
          className="text-[#6b6659] hover:text-[#1a1916] text-sm px-3 py-1.5 rounded-lg hover:bg-[#f2efe8] transition-colors whitespace-nowrap hidden sm:block"
        >
          Sign In
        </Link>
        <Link
          href="/sign-up"
          className="bg-[#09a7ad] hover:bg-[#0898a0] text-white text-sm px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors"
        >
          Get Started
        </Link>
      </div>
    );
  }

  // Org portal label — never say "admin" for staff
  const roleLabel = me?.role?.toLowerCase();
  const orgPortalLabel = me?.orgName ?? "Your Organization";
  const orgPortalSublabel =
    roleLabel === "owner" || roleLabel === "admin"
      ? "Manage auctions & settings"
      : "Auction staff portal";

  const close = () => setOpen(false);

  const drawer = (
    <>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.40)" }}
        onClick={close}
      />

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          width: 300,
          maxWidth: "88vw",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          borderLeft: "1px solid #e5e0d5",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
          overflowY: "hidden",
        }}
      >
        {/* User header */}
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #e5e0d5", display: "flex", alignItems: "flex-start", gap: 12, justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", overflow: "hidden", background: "rgba(9,167,173,0.10)", border: "1px solid rgba(9,167,173,0.20)", display: "flex", alignItems: "center", justifyContent: "center", color: "#09a7ad", fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ color: "#1a1916", fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</p>
              <p style={{ color: "#8c8778", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</p>
            </div>
          </div>
          <button
            onClick={close}
            style={{ color: "#b0a99a", background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0, borderRadius: 8 }}
            aria-label="Close menu"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="3" y1="3" x2="13" y2="13" />
              <line x1="13" y1="3" x2="3" y2="13" />
            </svg>
          </button>
        </div>

        {/* Navigation links */}
        <nav style={{ flex: 1, padding: "4px 8px", overflowY: "auto", minHeight: 0 }}>

          <SectionLabel>Auctions</SectionLabel>
          <NavLink href="/auctions" iconEl={<IcoHome />} label="Browse Auctions" onClick={close} />
          <NavLink href="/search" iconEl={<IcoSearch />} label="Search Items" onClick={close} />

          <SectionLabel>My Bids</SectionLabel>
          <NavLink href="/dashboard" iconEl={<IcoGavel />} label="Active Bids" sublabel="What you're currently bidding" onClick={close} />
          <NavLink href="/dashboard?tab=past" iconEl={<IcoHistory />} label="Bid History" sublabel="Past bids & wins" onClick={close} />

          <SectionLabel>Account</SectionLabel>
          <NavLink href="/account" iconEl={<IcoUser />} label="Profile" sublabel="Name, email, phone" onClick={close} />
          <NavLink href="/account" iconEl={<IcoCard />} label="Payment Method" sublabel="Cards on file per organization" onClick={close} />
          <NavLink href="/help" iconEl={<IcoHelp />} label="Info & Help" sublabel="Bidding tips, increments, FAQ" onClick={close} />

          {me?.orgId && (
            <>
              <Divider />
              <SectionLabel>Your Organization</SectionLabel>
              <NavLink
                href="/admin/dashboard"
                iconEl={<IcoBuilding />}
                label={orgPortalLabel}
                sublabel={orgPortalSublabel}
                onClick={close}
                accent="teal"
              />
            </>
          )}

          {me?.isSuperAdmin && (
            <>
              <Divider />
              <NavLink
                href="/superadmin"
                iconEl={<IcoBolt />}
                label="Super Admin"
                onClick={close}
                accent="orange"
              />
            </>
          )}
        </nav>

        {/* Sign out */}
        <div style={{ padding: "8px 8px 20px", borderTop: "1px solid #e5e0d5", flexShrink: 0 }}>
          <button
            onClick={async () => {
              close();
              await signOut();
              router.push("/");
            }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderRadius: 12, color: "#dc2626", background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500 }}
            className="hover:bg-red-50 transition-colors"
          >
            <span style={{ width: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <IcoSignOut />
            </span>
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-9 h-9 rounded-full overflow-hidden bg-[#09a7ad]/10 border border-[#09a7ad]/20 flex items-center justify-center text-[#09a7ad] font-semibold text-sm hover:bg-[#0898a0]/20 transition-colors shrink-0"
        aria-label="Open account menu"
      >
        {user?.imageUrl ? (
          <img src={user.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : initials}
      </button>

      {open && mounted && createPortal(drawer, document.body)}
    </>
  );
}
