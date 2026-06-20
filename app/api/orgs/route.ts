import { NextRequest, NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

// Direct org creation is now super-admin only.
// Normal users go through /apply → approval → org is created automatically.
export async function POST(request: NextRequest) {
  try {
    const adminOk = await isSuperAdmin();
    if (!adminOk) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name, ownerClerkUserId } = await request.json();
    if (!name || name.trim().length < 2) {
      return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
    }

    const targetUserId = ownerClerkUserId || userId;
    const existing = await prisma.orgMember.findFirst({ where: { clerkUserId: targetUserId } });
    if (existing) {
      return NextResponse.json({ error: "User already belongs to an organization" }, { status: 409 });
    }

    const slug = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const slugExists = await prisma.organization.findUnique({ where: { slug } });
    const finalSlug = slugExists ? `${slug}-${Date.now()}` : slug;

    const org = await prisma.organization.create({
      data: {
        name: name.trim(),
        slug: finalSlug,
        members: {
          create: { clerkUserId: targetUserId, role: "OWNER" },
        },
      },
    });

    return NextResponse.json({ success: true, org });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[orgs POST]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
