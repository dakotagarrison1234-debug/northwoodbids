import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// ── Helpers ────────────────────────────────────────────────────────────────────
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Map a free-text Amazon category into our fixed category list.
function mapCategory(raw: string): string {
  const c = (raw || "").toLowerCase();
  if (!c) return "";
  if (c.includes("electronic") || c.includes("computer") || c.includes("phone") || c.includes("audio") || c.includes("camera") || c.includes("video game") || c.includes("headphone")) return "Electronics";
  if (c.includes("sport") || c.includes("outdoor") || c.includes("fitness") || c.includes("exercise") || c.includes("camp") || c.includes("hunt") || c.includes("fish")) return "Sports";
  if (c.includes("food") || c.includes("beverage") || c.includes("drink") || c.includes("grocery") || c.includes("snack")) return "Food & Drink";
  if (c.includes("home") || c.includes("garden") || c.includes("kitchen") || c.includes("furniture") || c.includes("appliance") || c.includes("tool")) return "Home & Garden";
  if (c.includes("art") || c.includes("book") || c.includes("toy") || c.includes("collectible") || c.includes("game")) return "Art & Collectibles";
  return "";
}

// Parse a price like "$19.99" / "19.99" / 19.99 into a number, or null.
function parsePrice(p: unknown): number | null {
  if (typeof p === "number") return Number.isFinite(p) ? p : null;
  if (typeof p === "string") {
    const n = parseFloat(p.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Pull the ASIN out of an F2A task object, tolerating field-name variation.
function extractAsin(data: unknown): string | null {
  if (!data) return null;
  const obj = Array.isArray(data) ? data[0] : data;
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  for (const k of ["asin", "asin1", "ASIN", "aSIN", "productAsin"]) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

// Convert an Amazon FNSKU (warehouse label) → ASIN via the F2A service.
// AddOrGet is idempotent (get-or-create), so we poll it until the task finishes.
// taskState: 0 = Pending, 1 = Finished, 2 = Failed.
async function fnskuToAsin(fnsku: string): Promise<string | null> {
  const key = process.env.F2A_API_KEY;
  if (!key) return null;
  const url = "https://ato.fnskutoasin.com/api/v1/ScanTask/AddOrGet";

  for (let attempt = 0; attempt < 6; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Api-Key": key,
          // Accept-Language is REQUIRED — omitting it crashes their .NET server.
          "Accept-Language": "en-US",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        // BarCode must be capital B.
        body: JSON.stringify({ BarCode: fnsku }),
        cache: "no-store",
      });
    } catch {
      await delay(1200);
      continue;
    }

    if (!res.ok) {
      await delay(1200);
      continue;
    }

    const json = await res.json().catch(() => null);
    const data = (json && typeof json === "object" && "data" in json ? (json as Record<string, unknown>).data : json) as
      | Record<string, unknown>
      | null;

    const asin = extractAsin(data);
    const state = data && typeof data === "object" ? (data as Record<string, unknown>).taskState ?? (data as Record<string, unknown>).TaskState : undefined;

    if (asin && (state === 1 || state === undefined || state === null)) return asin;
    if (state === 2) return null; // Failed
    // state 0 (Pending) or finished-without-asin-yet → wait and retry
    await delay(1200);
  }
  return null;
}

type Product = {
  title: string;
  description: string;
  brand: string;
  category: string;
  retailValue: number | null;
  images: string[];
  asin?: string;
};

// Fetch product details for an ASIN from OpenWeb Ninja (Realtime Amazon Data).
// The product payload is wrapped in a `data` key.
async function fetchAmazonProduct(asin: string): Promise<Product | null> {
  const key = process.env.OPENWEBNINJA_API_KEY;
  if (!key) return null;
  const url = `https://api.openwebninja.com/realtime-amazon-data/product-details?asin=${encodeURIComponent(asin)}&country=US`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { "X-API-Key": key, Accept: "application/json" }, cache: "no-store" });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const json = await res.json().catch(() => null);
  const d = json && typeof json === "object" ? ((json as Record<string, unknown>).data as Record<string, unknown> | undefined) : undefined;
  if (!d) return null;

  // Description: prefer the text field, else join the bullet "about" list.
  let description = "";
  if (typeof d.product_description === "string" && d.product_description.trim()) {
    description = d.product_description.trim();
  } else if (Array.isArray(d.about_product)) {
    description = (d.about_product as unknown[]).filter((x) => typeof x === "string").join(" ");
  }

  // Brand
  const info = (d.product_information ?? d.product_details) as Record<string, unknown> | undefined;
  const brand =
    (typeof d.brand === "string" && d.brand) ||
    (info && typeof info.Brand === "string" && info.Brand) ||
    "";

  // Images (up to 3)
  let images: string[] = [];
  if (Array.isArray(d.product_photos)) {
    images = (d.product_photos as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 3);
  } else if (typeof d.product_photo === "string") {
    images = [d.product_photo];
  }

  // Category
  let categoryRaw = "";
  const cat = d.category as Record<string, unknown> | undefined;
  if (cat && typeof cat.name === "string") categoryRaw = cat.name;
  else if (Array.isArray(d.category_path)) {
    categoryRaw = (d.category_path as unknown[])
      .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>).name : ""))
      .filter((x) => typeof x === "string")
      .join(" ");
  }

  return {
    title: typeof d.product_title === "string" ? d.product_title : "",
    description,
    brand: String(brand || ""),
    category: mapCategory(categoryRaw),
    retailValue: parsePrice(d.product_price),
    images,
    asin,
  };
}

// ── Route ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.orgMember.findFirst({ where: { clerkUserId: userId } });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const code = (req.nextUrl.searchParams.get("code") || "").trim();
  if (!code) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

  try {
    const isFnsku = /^X\d{2}/i.test(code);
    let asin = code.toUpperCase();

    if (isFnsku) {
      const converted = await fnskuToAsin(asin);
      if (!converted) {
        return NextResponse.json({
          found: false,
          message: "Couldn't convert that FNSKU to a product — try a name search or fill it in manually.",
        });
      }
      asin = converted.toUpperCase();
    } else if (!/^[A-Z0-9]{10}$/i.test(code)) {
      return NextResponse.json({
        found: false,
        message: "That doesn't look like an ASIN or FNSKU.",
      });
    }

    const product = await fetchAmazonProduct(asin);
    if (!product || !product.title) {
      return NextResponse.json({
        found: false,
        message: "No product details found for that code — try a name search or fill it in manually.",
      });
    }

    return NextResponse.json({ found: true, product });
  } catch {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
