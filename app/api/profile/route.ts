import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { phone, email, name, orgSlug } = await request.json();

    // If orgSlug provided (came from an org landing page), attach it as preferred org
    let preferredOrgId: string | undefined;
    if (orgSlug) {
      const org = await prisma.organization.findUnique({
        where: { slug: orgSlug as string },
        select: { id: true },
      });
      if (org) preferredOrgId = org.id;
    }

    const updateData: Record<string, string | undefined> = { phone, email, name };
    if (preferredOrgId) updateData.preferredOrgId = preferredOrgId;

    const profile = await prisma.bidderProfile.upsert({
      where: { clerkUserId: userId },
      update: updateData,
      create: { clerkUserId: userId, phone, email, name, ...(preferredOrgId ? { preferredOrgId } : {}) },
    });

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error("Profile error:", error);
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await prisma.bidderProfile.findUnique({
      where: { clerkUserId: userId },
      include: {
        preferredOrg: {
          select: { id: true, name: true, slug: true, logoUrl: true },
        },
      },
    });

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Profile error:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}
