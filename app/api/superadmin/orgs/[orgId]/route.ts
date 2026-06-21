import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface Props { params: Promise<{ orgId: string }> }

export async function GET(_req: NextRequest, { params }: Props) {
  try {
    await requireSuperAdmin();
    const { orgId } = await params;

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        members: true,
        auctions: {
          include: { items: { select: { id: true, status: true, currentBid: true } } },
          orderBy: { createdAt: "desc" },
        },
        items: {
          include: { photos: { where: { isPrimary: true }, take: 1 }, auction: { select: { title: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ org });
  } catch (err) {
    console.error("[superadmin/orgs GET]:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    await requireSuperAdmin();
    const { orgId } = await params;
    const body = await request.json();

    const { name, description, isActive } = body;

    const org = await prisma.organization.update({
      where: { id: orgId },
      data: {
        // M12: slug is immutable after creation — never recompute from name
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json({ success: true, org });
  } catch (err) {
    console.error("[superadmin/orgs PATCH]:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  try {
    await requireSuperAdmin();
    const { orgId } = await params;

    // Get member clerkUserIds before deleting, so we can clean up their applications
    const members = await prisma.orgMember.findMany({ where: { organizationId: orgId }, select: { clerkUserId: true } });
    const memberIds = members.map((m) => m.clerkUserId);

    // Delete in dependency order (cascades handle most of this now, but explicit is safer)
    await prisma.$transaction([
      prisma.orgInvite.deleteMany({ where: { organizationId: orgId } }),
      prisma.orgMember.deleteMany({ where: { organizationId: orgId } }),
      prisma.bidderStripeCustomer.deleteMany({ where: { organizationId: orgId } }),
      prisma.proxyBid.deleteMany({ where: { item: { organizationId: orgId } } }),
      prisma.itemPhoto.deleteMany({ where: { item: { organizationId: orgId } } }),
      prisma.bid.deleteMany({ where: { item: { organizationId: orgId } } }),
      prisma.payment.deleteMany({ where: { item: { organizationId: orgId } } }),
      prisma.item.deleteMany({ where: { organizationId: orgId } }),
      prisma.auction.deleteMany({ where: { organizationId: orgId } }),
      prisma.organization.delete({ where: { id: orgId } }),
      // Clean up OrgApplications for this org's members to prevent infinite redirect loop
      prisma.orgApplication.deleteMany({ where: { clerkUserId: { in: memberIds } } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[superadmin/orgs DELETE]:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
