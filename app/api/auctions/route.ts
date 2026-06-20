import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessOrg } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { title, description, startAt, endAt, organizationId } = body;

    if (!title || !startAt || !endAt || !organizationId) {
      return NextResponse.json({ error: "Title, dates, and organization are required" }, { status: 400 });
    }

    if (!(await canAccessOrg(organizationId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const slug = title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    // Ensure unique slug within org
    const slugExists = await prisma.auction.findFirst({ where: { organizationId, slug } });
    const finalSlug = slugExists ? `${slug}-${Date.now()}` : slug;

    const auction = await prisma.auction.create({
      data: { title, description: description || null, startAt: new Date(startAt), endAt: new Date(endAt), slug: finalSlug, organizationId },
    });
    return NextResponse.json({ success: true, auction }, { status: 201 });
  } catch (error) {
    console.error("Error creating auction:", error);
    return NextResponse.json({ error: "Failed to create auction" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Scope to the current user's org (respects super admin act-as cookie)
    const { getUserOrg } = await import("@/lib/auth");
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ auctions: [] });

    const auctions = await prisma.auction.findMany({
      where: { organizationId: membership.organizationId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ auctions });
  } catch (error) {
    console.error("Error fetching auctions:", error);
    return NextResponse.json({ error: "Failed to fetch auctions" }, { status: 500 });
  }
}
