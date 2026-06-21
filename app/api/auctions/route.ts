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

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Scope to the current user's org (respects super admin act-as cookie)
    const { getUserOrg } = await import("@/lib/auth");
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ auctions: [] });

    // Bounded fetching: never load the whole auctions table unbounded. Defaults to the
    // most recent 50; callers can page with ?take= and ?cursor= (the cursor is an auction id).
    const { searchParams } = new URL(request.url);
    const takeParam = Number(searchParams.get("take"));
    const take = Number.isFinite(takeParam) && takeParam > 0 ? Math.min(takeParam, 200) : 50;
    const cursor = searchParams.get("cursor") || undefined;

    const auctions = await prisma.auction.findMany({
      where: { organizationId: membership.organizationId },
      orderBy: { createdAt: "desc" },
      take: take + 1, // fetch one extra to detect whether another page exists
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = auctions.length > take;
    const page = hasMore ? auctions.slice(0, take) : auctions;
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

    return NextResponse.json({ auctions: page, nextCursor, hasMore });
  } catch (error) {
    console.error("Error fetching auctions:", error);
    return NextResponse.json({ error: "Failed to fetch auctions" }, { status: 500 });
  }
}
