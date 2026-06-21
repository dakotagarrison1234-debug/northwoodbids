import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Must be an org member
  const membership = await prisma.orgMember.findFirst({ where: { clerkUserId: userId } });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const upc = req.nextUrl.searchParams.get("upc")?.replace(/\D/g, "");
  if (!upc || upc.length < 6) {
    return NextResponse.json({ error: "Invalid barcode" }, { status: 400 });
  }

  try {
    // Use the paid/keyed endpoint when a key is configured; otherwise fall back
    // to upcitemdb's free keyless "trial" endpoint (rate-limited, ~100/day).
    const key = process.env.UPCITEMDB_API_KEY;
    const endpoint = key
      ? `https://api.upcitemdb.com/prod/v1/lookup?upc=${upc}`
      : `https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`;

    const res = await fetch(endpoint, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Northwood Bids/1.0",
        ...(key ? { user_key: key } : {}),
      },
      next: { revalidate: 86400 }, // cache 24h — same product won't change
    });

    if (!res.ok) {
      // Fail soft so the admin can just fill the item in manually.
      return NextResponse.json({
        found: false,
        message:
          res.status === 429
            ? "Barcode lookups are temporarily rate-limited — enter the item details manually."
            : "Couldn't look up that barcode — enter the item details manually.",
      });
    }

    const data = await res.json();
    const item = data.items?.[0];

    if (!item) {
      return NextResponse.json({ found: false, message: "No product found for that barcode." });
    }

    // Map UPC category string → our category enum
    const rawCat = (item.category ?? "").toLowerCase();
    let category = "";
    if (rawCat.includes("electronic") || rawCat.includes("computer") || rawCat.includes("phone") || rawCat.includes("audio") || rawCat.includes("camera") || rawCat.includes("video game")) category = "Electronics";
    else if (rawCat.includes("sport") || rawCat.includes("outdoor") || rawCat.includes("fitness") || rawCat.includes("exercise")) category = "Sports";
    else if (rawCat.includes("food") || rawCat.includes("beverage") || rawCat.includes("drink") || rawCat.includes("grocery")) category = "Food & Drink";
    else if (rawCat.includes("home") || rawCat.includes("garden") || rawCat.includes("kitchen") || rawCat.includes("furniture") || rawCat.includes("appliance")) category = "Home & Garden";
    else if (rawCat.includes("art") || rawCat.includes("book") || rawCat.includes("toy") || rawCat.includes("collectible")) category = "Art & Collectibles";

    return NextResponse.json({
      found: true,
      product: {
        title: item.title ?? "",
        description: item.description ?? "",
        brand: item.brand ?? "",
        category,
        retailValue: null,
        images: (item.images ?? []).slice(0, 3),
      },
    });
  } catch {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
