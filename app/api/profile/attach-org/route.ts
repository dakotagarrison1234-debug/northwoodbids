import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/profile/attach-org
 * Called by OrgFollowCTA when a signed-in user visits an org landing page.
 * Sets the user's preferredOrgId so that org's auctions are prioritized.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { orgSlug } = await request.json();
    if (!orgSlug) return NextResponse.json({ error: "Missing orgSlug" }, { status: 400 });

    const org = await prisma.organization.findUnique({
      where: { slug: orgSlug },
      select: { id: true },
    });
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

    await prisma.bidderProfile.upsert({
      where: { clerkUserId: userId },
      update: { preferredOrgId: org.id },
      create: { clerkUserId: userId, preferredOrgId: org.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("attach-org error:", error);
    return NextResponse.json({ error: "Failed to attach org" }, { status: 500 });
  }
}
