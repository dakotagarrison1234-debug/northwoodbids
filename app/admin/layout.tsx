import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/auth";
import MobileNav from "./MobileNav";
import AdminSidebar from "./AdminSidebar";
import { visibleGroups } from "./nav";

const BUSINESS_LOGO_URL =
  "https://assets.cdn.filesafe.space/TwuL7EwKfW8oGIV0Zo5q/media/6a373b261c5d711b35bf4e56.png";

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
          // 15% buyer's premium added on top of every winning bid.
          platformFeePercent: 15,
          // Michigan sales tax — 6% added to every winning bid.
          taxExempt: false,
          taxPercent: 6,
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

  const groups = visibleGroups(membership.role);

  return (
    <div className="min-h-screen bg-[#f4ede1] text-[#241a12] flex flex-col">
      {/* Phone: top bar + drawer + bottom tab bar */}
      <MobileNav groups={groups} orgName={org.name} role={membership.role.toLowerCase()} logoUrl={BUSINESS_LOGO_URL} />

      <div className="flex flex-1 min-h-0">
        {/* Desktop: the dark workshop sidebar */}
        <AdminSidebar groups={groups} orgName={org.name} role={membership.role.toLowerCase()} logoUrl={BUSINESS_LOGO_URL} />

        {/* pb on mobile clears the fixed bottom tab bar so the last row of any
            page is never hidden underneath it. */}
        <div className="flex-1 flex flex-col min-w-0 pb-[68px] md:pb-0">
          {children}
        </div>
      </div>
    </div>
  );
}
