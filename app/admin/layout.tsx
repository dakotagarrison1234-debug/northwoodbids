import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import UserMenu from "@/app/components/UserMenu";
import { prisma } from "@/lib/prisma";

function AdminNavIcon({ name }: { name: string }) {
  const s = { width: 16, height: 16, fill: "none", viewBox: "0 0 16 16", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "grid") return <svg {...s}><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>;
  if (name === "gavel") return <svg {...s}><path d="M10 2L6 6l4 4 4-4-4-4zM2 14l5-5"/><path d="M6 10l-4 4"/></svg>;
  if (name === "trophy") return <svg {...s}><path d="M4 3H2V6a4 4 0 0 0 3.5 3.97M12 3h2V6a4 4 0 0 1-3.5 3.97M4 3h8v5a4 4 0 0 1-8 0V3zM6 14h4M8 12v2"/></svg>;
  if (name === "package") return <svg {...s}><path d="M8 2L2 5v6l6 3 6-3V5L8 2z"/><path d="M2 5l6 3 6-3M8 8v7M5 3.5l6 3"/></svg>;
  if (name === "users") return <svg {...s}><circle cx="6" cy="5" r="2.5"/><path d="M1 14c0-3 2-4.5 5-4.5s5 1.5 5 4.5"/><circle cx="12" cy="5" r="2"/><path d="M12 10c2 0 3 1 3 3.5"/></svg>;
  if (name === "settings") return <svg {...s}><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/></svg>;
  if (name === "mybids") return <svg {...s}><path d="M8 2v4l3 3"/><circle cx="8" cy="8" r="6"/></svg>;
  if (name === "bolt") return <svg {...s}><path d="M9 2L4 9h4l-1 5 6-7H9l1-5z"/></svg>;
  return null;
}
import { isSuperAdmin } from "@/lib/auth";
import { cookies } from "next/headers";
import ActAsExitButton from "./ActAsExitButton";
import OrgSwitcher from "./OrgSwitcher";
import MobileNav from "./MobileNav";
import OrgLogo from "@/app/components/OrgLogo";
import StripeOnboardingGate from "./StripeOnboardingGate";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const superAdmin = await isSuperAdmin();

  // Check for act-as cookie (super admin only)
  const cookieStore = await cookies();
  const actAsOrgId = superAdmin ? cookieStore.get("sa_org_id")?.value : undefined;

  type MembershipWithOrg = NonNullable<Awaited<ReturnType<typeof prisma.orgMember.findFirst<{ include: { organization: true } }>>>>;

  let membership = await prisma.orgMember.findFirst({
    where: { clerkUserId: userId },
    include: { organization: true },
  }) as MembershipWithOrg | null;

  let actingAsOrg = null;

  if (superAdmin && actAsOrgId) {
    actingAsOrg = await prisma.organization.findUnique({ where: { id: actAsOrgId } });
    if (actingAsOrg) {
      membership = {
        id: membership?.id ?? "superadmin_synthetic",
        clerkUserId: userId,
        organizationId: actingAsOrg.id,
        role: "OWNER",
        createdAt: membership?.createdAt ?? new Date(),
        organization: actingAsOrg,
      } as MembershipWithOrg;
    }
  }

  if (!membership) {
    if (superAdmin) redirect("/superadmin");
    redirect("/apply");
  }

  const org = membership.organization;
  const isOwnerOrAdmin = membership.role === "OWNER" || membership.role === "ADMIN";

  // Load all orgs for switcher (super admin only)
  const allOrgs = superAdmin
    ? await prisma.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [];

  const navItems = [
    { label: "Overview", href: "/admin/dashboard", icon: "grid" },
    { label: "Auctions", href: "/admin/auctions", icon: "gavel" },
    { label: "Pickup", href: "/admin/pickup", icon: "package" },
    ...(isOwnerOrAdmin ? [{ label: "Team", href: "/admin/staff", icon: "users" }] : []),
    ...(isOwnerOrAdmin ? [{ label: "Settings", href: "/admin/settings", icon: "settings" }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#faf8f4] text-[#1a1916] flex flex-col">
      {/* Act-as banner */}
      {actingAsOrg && (
        <div className="bg-amber-100 border-b border-amber-200 px-4 sm:px-6 py-2.5 flex items-center justify-between text-xs sm:text-sm gap-2">
          <span className="text-amber-900 truncate">
            Acting as <span className="font-bold text-amber-950">{actingAsOrg.name}</span>
          </span>
          <ActAsExitButton />
        </div>
      )}

      {/* Mobile nav (hamburger + drawer) */}
      <MobileNav
        navItems={navItems}
        orgName={org.name}
        role={membership.role.toLowerCase()}
        superAdmin={superAdmin}
        showSuperAdmin={superAdmin}
      />

      <div className="flex flex-1 min-h-0">
        <aside className="hidden md:flex w-64 bg-white border-r border-[#e5e0d5] flex-col shrink-0">
          <div className="px-6 py-5 border-b border-[#e5e0d5]">
            <Link href="/admin/dashboard" className="flex items-center gap-3 mb-1">
              <OrgLogo name={org.name} logoUrl={org.logoUrl} size="sm" />
              <div className="min-w-0">
                <p className="text-[#1a1916] font-semibold text-sm truncate">{org.name}</p>
                <span className="text-xs text-[#8c8778] capitalize">{membership.role.toLowerCase()}</span>
              </div>
            </Link>
          </div>

          {/* Org switcher for super admin */}
          {superAdmin && allOrgs.length > 1 && (
            <div className="px-4 pt-4">
              <OrgSwitcher orgs={allOrgs} currentOrgId={org.id} />
            </div>
          )}

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

          {superAdmin && (
            <div className="px-4 pb-2">
              <Link
                href="/superadmin"
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 transition-colors text-sm"
              >
                <span className="w-5 flex items-center justify-center shrink-0">
                  <AdminNavIcon name="bolt" />
                </span>
                <span>Super Admin</span>
              </Link>
            </div>
          )}

          <div className="px-4 py-4 border-t border-[#e5e0d5] flex items-center gap-3">
            <UserMenu />
            <div className="text-sm text-[#8c8778] truncate">Account</div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          {/* Stripe onboarding gate — shown to org owners/admins who haven't connected Stripe */}
          {!superAdmin && isOwnerOrAdmin && (
            <StripeOnboardingGate
              orgId={org.id}
              hasStripeAccount={!!org.stripeAccountId}
              chargesEnabled={org.stripeChargesEnabled}
            />
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
