import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import UserMenu from "@/app/components/UserMenu";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/auth";
import MobileNav from "./MobileNav";

const BUSINESS_LOGO_URL =
  "https://assets.cdn.filesafe.space/TwuL7EwKfW8oGIV0Zo5q/media/6a373b261c5d711b35bf4e56.png";

function AdminNavIcon({ name }: { name: string }) {
  const s = { width: 16, height: 16, fill: "none", viewBox: "0 0 16 16", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "grid") return <svg {...s}><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>;
  if (name === "gavel") return <svg {...s}><path d="M10 2L6 6l4 4 4-4-4-4zM2 14l5-5"/><path d="M6 10l-4 4"/></svg>;
  if (name === "trophy") return <svg {...s}><path d="M4 3H2V6a4 4 0 0 0 3.5 3.97M12 3h2V6a4 4 0 0 1-3.5 3.97M4 3h8v5a4 4 0 0 1-8 0V3zM6 14h4M8 12v2"/></svg>;
  if (name === "package") return <svg {...s}><path d="M8 2L2 5v6l6 3 6-3V5L8 2z"/><path d="M2 5l6 3 6-3M8 8v7M5 3.5l6 3"/></svg>;
  if (name === "users") return <svg {...s}><circle cx="6" cy="5" r="2.5"/><path d="M1 14c0-3 2-4.5 5-4.5s5 1.5 5 4.5"/><circle cx="12" cy="5" r="2"/><path d="M12 10c2 0 3 1 3 3.5"/></svg>;
  if (name === "settings") return <svg {...s}><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/></svg>;
  if (name === "mybids") return <svg {...s}><path d="M8 2v4l3 3"/><circle cx="8" cy="8" r="6"/></svg>;
  return null;
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const superAdmin = await isSuperAdmin();

  type MembershipWithOrg = NonNullable<Awaited<ReturnType<typeof prisma.orgMember.findFirst<{ include: { organization: true } }>>>>;

  let membership = await prisma.orgMember.findFirst({
    where: { clerkUserId: userId },
    include: { organization: true },
  }) as MembershipWithOrg | null;

  // Single-business model: the owner is auto-provisioned the one business the
  // first time they open the admin. Anyone else without a membership is a
  // bidder (not staff) and is sent back to the public site.
  if (!membership) {
    if (!superAdmin) redirect("/");
    const existingOrg = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
    const businessOrg =
      existingOrg ??
      (await prisma.organization.create({
        data: {
          name: "Northwood Bids",
          slug: "northwood-bids",
          status: "LIVE",
          platformFeePercent: 0,
          stripeChargesEnabled: true,
          stripePayoutsEnabled: true,
          stripeDetailsSubmitted: true,
        },
      }));
    membership = (await prisma.orgMember.create({
      data: { clerkUserId: userId, organizationId: businessOrg.id, role: "OWNER" },
      include: { organization: true },
    })) as MembershipWithOrg;
  }

  const org = membership.organization;
  const isOwnerOrAdmin = membership.role === "OWNER" || membership.role === "ADMIN";

  const navItems = [
    { label: "Overview", href: "/admin/dashboard", icon: "grid" },
    { label: "Auctions", href: "/admin/auctions", icon: "gavel" },
    { label: "Pickup", href: "/admin/pickup", icon: "package" },
    ...(isOwnerOrAdmin ? [{ label: "Team", href: "/admin/staff", icon: "users" }] : []),
    ...(isOwnerOrAdmin ? [{ label: "Settings", href: "/admin/settings", icon: "settings" }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#faf8f4] text-[#1a1916] flex flex-col">
      {/* Mobile nav (hamburger + drawer) */}
      <MobileNav
        navItems={navItems}
        orgName={org.name}
        role={membership.role.toLowerCase()}
      />

      <div className="flex flex-1 min-h-0">
        <aside className="hidden md:flex w-64 bg-white border-r border-[#e5e0d5] flex-col shrink-0">
          <div className="px-6 py-5 border-b border-[#e5e0d5]">
            <Link href="/admin/dashboard" className="flex items-center gap-3 mb-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={BUSINESS_LOGO_URL}
                alt={org.name}
                className="h-10 w-auto max-w-[150px] object-contain"
              />
              <span className="sr-only">{membership.role.toLowerCase()}</span>
            </Link>
          </div>

          <nav className="flex-1 px-4 py-4 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-[#4a4640] font-medium hover:text-[#1a1916] hover:bg-[#f2efe8] transition-colors"
              >
                <span className="w-5 flex items-center justify-center shrink-0">
                  <AdminNavIcon name={item.icon} />
                </span>
                <span>{item.label}</span>
              </Link>
            ))}
            <div className="pt-2 border-t border-[#e5e0d5] mt-2">
              <Link
                href="/dashboard"
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-[#4a4640] font-medium hover:text-[#1a1916] hover:bg-[#f2efe8] transition-colors"
              >
                <span className="w-5 flex items-center justify-center shrink-0">
                  <AdminNavIcon name="mybids" />
                </span>
                <span>My Bids</span>
              </Link>
            </div>
          </nav>

          <div className="px-4 py-4 border-t border-[#e5e0d5] flex items-center gap-3">
            <UserMenu />
            <div className="text-sm text-[#8c8778] truncate">Account</div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
