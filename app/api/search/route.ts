import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ items: [], auctions: [], orgs: [] });
  }

  const [items, auctions, orgs] = await Promise.all([
    // Only ACTIVE items inside OPEN auctions
    prisma.item.findMany({
      where: {
        status: "ACTIVE",
        auction: { status: "OPEN" },
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { donorName: { contains: q, mode: "insensitive" } },
        ],
      },
      include: {
        organization: { select: { name: true, slug: true } },
        auction: { select: { slug: true, title: true } },
        photos: {
          take: 1,
          orderBy: { isPrimary: "desc" },
        },
      },
      orderBy: { currentBid: "desc" },
      take: 10,
    }),

    // Only OPEN auctions
    prisma.auction.findMany({
      where: {
        status: "OPEN",
        title: { contains: q, mode: "insensitive" },
      },
      include: {
        organization: { select: { name: true, slug: true } },
        _count: { select: { items: true } },
      },
      take: 5,
    }),

    // Active orgs matching name
    prisma.organization.findMany({
      where: {
        isActive: true,
        name: { contains: q, mode: "insensitive" },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        _count: { select: { auctions: true } },
        auctions: {
          where: { status: "OPEN" },
          select: { id: true },
        },
      },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    items: items.map((i) => ({ ...i, currentBid: Number(i.currentBid), startingBid: Number(i.startingBid) })),
    auctions,
    orgs,
  });
  } catch (err) {
    console.error("[search GET]:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
