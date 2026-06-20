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
    const res = await fetch(`https://api.upcitemdb.com/prod/v1/lookup?upc=${upc}`, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Northwood Bids/1.0",
        "user_key": process.env.UPCITEMDB_API_KEY ?? "",
      },
      next: { revalidate: 86400 }, // cache 24h — same product won't change
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Lookup service unavailable" }, { status: 502 });
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
