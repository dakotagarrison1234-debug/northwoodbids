import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessOrg } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const {
      title,
      description,
      condition,
      category,
      retailValue,
      startingBid,
      reservePrice,
      donorName,
      taxDeductible,
      storageLocation,
      locationId,
      notes,
      auctionId,
      organizationId,
      photos,
    } = body;

    if (!title || !organizationId) {
      return NextResponse.json(
        { error: "Title and organization are required" },
        { status: 400 }
      );
    }

    if (!(await canAccessOrg(organizationId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Validate the chosen auction and decide the new item's status.
    let itemStatus: "DRAFT" | "ACTIVE" = "DRAFT";
    if (auctionId) {
      const parentAuction = await prisma.auction.findUnique({
        where: { id: auctionId },
        select: { status: true, organizationId: true },
      });
      if (!parentAuction || parentAuction.organizationId !== organizationId) {
        return NextResponse.json({ error: "Auction not found" }, { status: 404 });
      }
      // Guard: can't add items to an auction that has already ended.
      if (parentAuction.status === "CLOSED" || parentAuction.status === "SETTLED") {
        return NextResponse.json(
          { error: "This auction has already ended — you can't add items to it." },
          { status: 422 }
        );
      }
      // If the auction is already live, activate the item so bidders see it right away.
      if (parentAuction.status === "OPEN") itemStatus = "ACTIVE";
    }

    const item = await prisma.item.create({
      data: {
        title,
        description: description || null,
        condition: condition || "GOOD",
        category: category || null,
        retailValue: retailValue ? parseFloat(retailValue) : null,
        startingBid: startingBid ? parseFloat(startingBid) : 0,
        reservePrice: reservePrice ? parseFloat(reservePrice) : null,
        donorName: donorName || null,
        taxDeductible: taxDeductible || false,
        storageLocation: storageLocation || null,
        locationId: locationId || null,
        notes: notes || null,
        auctionId: auctionId || null,
        organizationId,
        status: itemStatus,
        photos: photos && photos.length > 0 ? {
          create: photos.map((url: string, index: number) => ({
            url,
            isPrimary: index === 0,
          })),
        } : undefined,
      },
    });

    return NextResponse.json({ success: true, item }, { status: 201 });
  } catch (error) {
    console.error("Error creating item:", error);
    return NextResponse.json(
      { error: "Failed to create item" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Scope to the current user's org (respects super admin act-as cookie)
    const { getUserOrg } = await import("@/lib/auth");
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ items: [] });

    const items = await prisma.item.findMany({
      where: { organizationId: membership.organizationId },
      include: { photos: true, bids: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching items:", error);
    return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
  }
}