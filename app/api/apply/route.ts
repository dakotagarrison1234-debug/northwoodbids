import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — check current user's application status
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const application = await prisma.orgApplication.findFirst({
      where: { clerkUserId: userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ application });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[apply GET]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — submit a new org application
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Block if already has an org
    const existing = await prisma.orgMember.findFirst({ where: { clerkUserId: userId } });
    if (existing) {
      return NextResponse.json({ error: "You already have an organization." }, { status: 409 });
    }

    // Block if already has a pending/approved application
    const existingApp = await prisma.orgApplication.findFirst({
      where: { clerkUserId: userId, status: { in: ["PENDING", "APPROVED"] } },
    });
    if (existingApp) {
      return NextResponse.json({ error: "You already have an application on file." }, { status: 409 });
    }

    const body = await request.json();
    const { orgName, description, website, contactName, contactEmail, contactPhone } = body;

    if (!orgName || !contactName || !contactEmail) {
      return NextResponse.json({ error: "Organization name, contact name, and email are required." }, { status: 400 });
    }

    const slug = orgName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const slugExists = await prisma.organization.findUnique({ where: { slug } });
    const finalSlug = slugExists ? `${slug}-${Date.now()}` : slug;

    const application = await prisma.orgApplication.create({
      data: {
        clerkUserId: userId,
        orgName: orgName.trim(),
        slug: finalSlug,
        description: description || null,
        website: website || null,
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim().toLowerCase(),
        contactPhone: contactPhone || null,
      },
    });

    return NextResponse.json({ success: true, application });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[apply POST]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
