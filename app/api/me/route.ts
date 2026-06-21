export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg, isSuperAdmin } from "@/lib/auth";

export async function GET() {
  try {
    const { userId } = await auth();
    const [membership, superAdmin] = await Promise.all([getUserOrg(), isSuperAdmin()]);

    const profile = userId
      ? await prisma.bidderProfile.findUnique({ where: { clerkUserId: userId }, select: { avatarKey: true } })
      : null;
    const avatarKey = profile?.avatarKey ?? null;

    if (!membership) {
      return NextResponse.json({ orgId: null, orgName: null, role: null, isSuperAdmin: superAdmin, avatarKey });
    }

    return NextResponse.json({
      orgId: membership.organization.id,
      orgName: membership.organization.name,
      orgSlug: membership.organization.slug,
      role: membership.role,
      isSuperAdmin: superAdmin,
      avatarKey,
    });
  } catch (err) {
    console.error("[me GET]:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
