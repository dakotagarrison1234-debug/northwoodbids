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
      itemCode,
      storageLocation,
      locationId,
      notes,
      auctionId,
      organizationId,
      photos,
      isPremium,
      packSize,
      transferable,
    } = body;

    if (!title || !organizationId) {
      return NextResponse.json(
        { error: "Title and organization are required" },
        { status: 400 }
      );
    }

    // A warehouse (pickup location) is required on every item so transfers and
    // pickup scheduling always know where it lives.
    if (!locationId) {
      return NextResponse.json(
        { error: "Please choose a warehouse for this item." },
        { status: 400 }
      );
    }

    if (!(await canAccessOrg(organizationId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Validate numeric fields: must be finite and >= 0 when provided.
    const numericFields: Record<string, unknown> = { retailValue, startingBid, reservePrice };
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
    if (photos && photos.length > 0) {
      for (const url of photos) {
        if (!isHttpUrl(url)) {
          return NextResponse.json({ error: "Invalid photo URL" }, { status: 400 });
        }
      }
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

    // Random globally-unique item code. Honor the one already shown to staff
    // (so the written tag matches) when it's still free, else mint a new one.
    const autoItemCode = await ensureItemCode(itemCode);

    const baseData = {
      title,
      description: description || null,
      condition: condition || "GOOD",
      category: category || null,
      retailValue: retailValue ? parseFloat(retailValue) : null,
      startingBid: startingBid ? parseFloat(startingBid) : 0,
      reservePrice: reservePrice ? parseFloat(reservePrice) : null,
      donorName: donorName || null,
      taxDeductible: taxDeductible || false,
      itemCode: autoItemCode,
      storageLocation: storageLocation || null,
      locationId: locationId || null,
      notes: notes || null,
      auctionId: auctionId || null,
      organizationId,
      status: itemStatus,
      isPremium: !!isPremium,
      transferable: transferable === false ? false : true,
      packSize: Number(packSize) > 1 ? Math.min(Math.floor(Number(packSize)), 12) : null,
      photos: photos && photos.length > 0 ? {
        create: photos.map((url: string, index: number) => ({
          url,
          isPrimary: index === 0,
        })),
      } : undefined,
    };

    const item = await prisma.item.create({ data: baseData });
    return NextResponse.json({ success: true, item }, { status: 201 });
  } catch (error) {
    console.error("Error creating item:", error);
    return NextResponse.json(
      { error: "Failed to create item" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Scope to the current user's org (respects super admin act-as cookie)
    const { getUserOrg } = await import("@/lib/auth");
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ items: [] });

    // Bounded fetching: never load the whole items table unbounded. Defaults to the
    // most recent 50; callers can page with ?take= and ?cursor= (the cursor is an item id).
    const { searchParams } = new URL(request.url);
    const takeParam = Number(searchParams.get("take"));
    const take = Number.isFinite(takeParam) && takeParam > 0 ? Math.min(takeParam, 200) : 50;
    const cursor = searchParams.get("cursor") || undefined;

    const items = await prisma.item.findMany({
      where: { organizationId: membership.organizationId },
      include: { photos: true, bids: true },
      orderBy: { createdAt: "desc" },
      take: take + 1, // fetch one extra to detect whether another page exists
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > take;
    const page = hasMore ? items.slice(0, take) : items;
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

    return NextResponse.json({ items: page, nextCursor, hasMore });
  } catch (error) {
    console.error("Error fetching items:", error);
    return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
  }
}