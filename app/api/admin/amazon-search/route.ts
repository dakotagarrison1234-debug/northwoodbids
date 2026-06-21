import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

function parsePrice(p: unknown): number | null {
  if (typeof p === "number") return Number.isFinite(p) ? p : null;
  if (typeof p === "string") {
    const n = parseFloat(p.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Keyword search of Amazon via OpenWeb Ninja (Realtime Amazon Data).
// Used as a fallback when a barcode / FNSKU / ASIN lookup turns up nothing.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.orgMember.findFirst({ where: { clerkUserId: userId } });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ error: "Missing search query" }, { status: 400 });

  const key = process.env.OPENWEBNINJA_API_KEY;
  if (!key) return NextResponse.json({ results: [], message: "Search is not configured." });

  try {
    const url = `https://api.openwebninja.com/realtime-amazon-data/search?query=${encodeURIComponent(q)}&country=US&page=1`;
    const res = await fetch(url, { headers: { "X-API-Key": key, Accept: "application/json" }, cache: "no-store" });

    if (!res.ok) {
      return NextResponse.json({
        results: [],
        message: "Search is temporarily unavailable — try again or fill in the item manually.",
      });
    }

    const raw = await res.json().catch(() => null);
    const products = raw?.data?.products;
    if (!Array.isArray(products)) {
      return NextResponse.json({ results: [] });
    }

    const results = products.slice(0, 8).map((p: Record<string, unknown>) => ({
      asin: typeof p.asin === "string" ? p.asin : "",
      title: typeof p.product_title === "string" ? p.product_title : "",
      image: typeof p.product_photo === "string" ? p.product_photo : null,
      price: parsePrice(p.product_price),
      brand:
        (typeof p.product_brand === "string" && p.product_brand) ||
        (typeof p.brand === "string" && p.brand) ||
        "",
    })).filter((r) => r.asin && r.title);

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
