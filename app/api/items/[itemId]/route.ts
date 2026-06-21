import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessOrg } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params;
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        photos: true,
        bids: { orderBy: { placedAt: "desc" } },
        auction: { select: { title: true, endAt: true, status: true } },
        organization: {
          select: {
            id: true,
            stripeAccountId: true,
            stripeChargesEnabled: true,
            platformFeePercent: true,
            taxPercent: true,
            taxExempt: true,
          },
        },
      },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    // Staff see everything; public gets sensitive fields stripped + bidder IDs anonymized
    const isStaff = await canAccessOrg(item.organizationId);
    if (isStaff) {
      const staffItem = {
        ...item,
        retailValue: item.retailValue != null ? Number(item.retailValue) : null,
        startingBid: Number(item.startingBid),
        reservePrice: item.reservePrice != null ? Number(item.reservePrice) : null,
        currentBid: Number(item.currentBid),
        bids: item.bids.map((b) => ({ ...b, amount: Number(b.amount) })),
        // Include org Stripe info for staff too (needed if admin is also bidding)
        org: {
          id: item.organization.id,
          stripeAccountId: item.organization.stripeAccountId,
          stripeChargesEnabled: item.organization.stripeChargesEnabled,
          platformFeePercent: Number(item.organization.platformFeePercent),
          taxPercent: item.organization.taxExempt ? 0 : Number(item.organization.taxPercent),
        },
      };
      return NextResponse.json({ item: staffItem });
    }

    const { reservePrice, storageLocation, notes, organization, ...publicItemFields } = item;
    void reservePrice; void storageLocation; void notes; void organization; // intentionally stripped
    const publicBids = item.bids.map((b) => ({
      id: b.id,
      amount: Number(b.amount),
      bidder: b.clerkUserId.substring(0, 8),
      placedAt: b.placedAt,
      isProxy: b.isProxy,
      status: b.status,
    }));
    return NextResponse.json({
      item: {
        ...publicItemFields,
        retailValue: publicItemFields.retailValue != null ? Number(publicItemFields.retailValue) : null,
        startingBid: Number(publicItemFields.startingBid),
        currentBid: Number(publicItemFields.currentBid),
        bids: publicBids,
        // Expose the org's Stripe info — stripeAccountId is needed by Stripe Elements
        // to initialize on the correct connected account. This is safe to expose publicly.
        org: {
          id: item.organization.id,
          stripeAccountId: item.organization.stripeAccountId,
          stripeChargesEnabled: item.organization.stripeChargesEnabled,
          // Fee/tax disclosure — bidders must see the full cost before bidding
          platformFeePercent: Number(item.organization.platformFeePercent),
          taxPercent: item.organization.taxExempt ? 0 : Number(item.organization.taxPercent),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching item:", error);
    return NextResponse.json({ error: "Failed to fetch item" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { itemId } = await params;

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { organizationId: true, status: true, auctionId: true },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    if (!(await canAccessOrg(item.organizationId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    // If this item is still DRAFT but belongs to an OPEN auction, promote it to ACTIVE on save
    const targetAuctionId = body.auctionId || item.auctionId;
    let autoActivate = false;
    if (item.status === "DRAFT" && targetAuctionId) {
      const parentAuction = await prisma.auction.findUnique({
        where: { id: targetAuctionId },
        select: { status: true },
      });
      if (parentAuction?.status === "OPEN") autoActivate = true;
    }

    await prisma.item.update({
      where: { id: itemId },
      data: {
        title: body.title,
        description: body.description || null,
        condition: body.condition || "GOOD",
        category: body.category || null,
        retailValue: body.retailValue ? parseFloat(body.retailValue) : null,
        startingBid: body.startingBid ? parseFloat(body.startingBid) : 0,
        reservePrice: body.reservePrice ? parseFloat(body.reservePrice) : null,
        donorName: body.donorName || null,
        taxDeductible: body.taxDeductible || false,
        storageLocation: body.storageLocation || null,
        ...(body.locationId !== undefined && { locationId: body.locationId || null }),
        notes: body.notes || null,
        auctionId: body.auctionId || null,
        ...(autoActivate ? { status: "ACTIVE" } : {}),
      },
    });

    if (body.photos) {
      await prisma.itemPhoto.deleteMany({ where: { itemId } });
      if (body.photos.length > 0) {
        await prisma.itemPhoto.createMany({
          data: body.photos.map((url: string, index: number) => ({
            itemId,
            url,
            isPrimary: index === 0,
          })),
        });
      }
    }

    const updated = await prisma.item.findUnique({
      where: { id: itemId },
      include: { photos: true },
    });
    return NextResponse.json({ success: true, item: updated });
  } catch (error) {
    console.error("Error updating item:", error);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}
