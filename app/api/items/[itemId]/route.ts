import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessOrg } from "@/lib/auth";
import { ensureItemCode } from "@/lib/itemCode";

// Accept only http(s) URLs for photos — blocks javascript:/data:/file: etc.
function isHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

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
        // The client only renders recent bids — cap the fetch instead of returning the
        // entire history (newest first, matching what the UI shows).
        bids: { orderBy: { placedAt: "desc" }, take: 50 },
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

    const { reservePrice, storageLocation, notes, itemCode, organization, ...publicItemFields } = item;
    void reservePrice; void storageLocation; void notes; void itemCode; void organization; // intentionally stripped
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
      select: {
        organizationId: true,
        status: true,
        auctionId: true,
        itemCode: true,
        locationId: true,
        _count: { select: { bids: true } },
      },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    if (!(await canAccessOrg(item.organizationId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    // Pricing/auction fields are locked once an item is live or has bids —
    // changing them mid-auction would let staff move the goalposts.
    const pricingLocked = item.status === "ACTIVE" || item._count.bids > 0;

    // Validate numeric fields: must be finite and >= 0 when provided.
    const numericFields: Record<string, unknown> = {
      retailValue: body.retailValue,
      startingBid: body.startingBid,
      reservePrice: body.reservePrice,
    };
    for (const [field, raw] of Object.entries(numericFields)) {
      if (raw === undefined || raw === null || raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { error: `Invalid value for ${field}` },
          { status: 400 }
        );
      }
    }

    // Validate photo URLs are http(s) (reject javascript:/data: etc.).
    if (body.photos && body.photos.length > 0) {
      for (const url of body.photos) {
        if (!isHttpUrl(url)) {
          return NextResponse.json({ error: "Invalid photo URL" }, { status: 400 });
        }
      }
    }

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

    // Descriptive fields are always editable. Merge against the existing row by
    // only setting keys the request actually provided.
    const data: Record<string, unknown> = {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description || null }),
      ...(body.condition !== undefined && { condition: body.condition || "GOOD" }),
      ...(body.category !== undefined && { category: body.category || null }),
      ...(body.retailValue !== undefined && {
        retailValue: body.retailValue ? parseFloat(body.retailValue) : null,
      }),
      ...(body.donorName !== undefined && { donorName: body.donorName || null }),
      ...(body.taxDeductible !== undefined && { taxDeductible: body.taxDeductible || false }),
      ...(body.storageLocation !== undefined && { storageLocation: body.storageLocation || null }),
      ...(body.locationId !== undefined && { locationId: body.locationId || null }),
      ...(body.notes !== undefined && { notes: body.notes || null }),
      ...(autoActivate ? { status: "ACTIVE" } : {}),
    };

    // Pricing/auction fields only when the item isn't live and has no bids.
    if (!pricingLocked) {
      if (body.startingBid !== undefined) {
        data.startingBid = body.startingBid ? parseFloat(body.startingBid) : 0;
      }
      if (body.reservePrice !== undefined) {
        data.reservePrice = body.reservePrice ? parseFloat(body.reservePrice) : null;
      }
      if (body.auctionId !== undefined) {
        data.auctionId = body.auctionId || null;
        // Codes are assigned at creation now; backfill only if an old item lacks one.
        if (!item.itemCode) {
          data.itemCode = await ensureItemCode(null);
        }
      }
    }

    await prisma.item.update({
      where: { id: itemId },
      data,
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
