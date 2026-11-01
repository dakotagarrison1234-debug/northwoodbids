import { NextRequest, NextResponse } from "next/server";
import { requireUserOrg } from "@/lib/auth";
import { isPublicHost } from "@/lib/ssrf";

// Raster images only: an SVG (or anything else) served from our own origin could
// carry script that runs with a staff member's session.
const RASTER = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/avif"]);
const MAX_BYTES = 10 * 1024 * 1024;

// Same-origin image proxy for the social flyer.
//
// The flyer is exported to PNG with html2canvas, which needs to READ the pixels of
// every image. That means each <img> must either be same-origin or be served with
// CORS headers — and an <img crossOrigin="anonymous"> pointed at a host that sends
// no CORS headers doesn't just fail the export, it refuses to render at all (which
// is why a photo could look fine on the auction page and come out blank here).
//
// Piping the bytes through our own origin sidesteps the whole problem: no CORS, no
// tainted canvas, always renders.
export async function GET(request: NextRequest) {
  try {
    await requireUserOrg(); // staff-only — this is not an open proxy

    const raw = request.nextUrl.searchParams.get("url");
    if (!raw) return NextResponse.json({ error: "Missing url" }, { status: 400 });

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }
    if (target.protocol !== "https:" && target.protocol !== "http:") {
      return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
    }

    // Never reach our own network (SSRF), and don't follow redirects into it.
    if (!(await isPublicHost(target.hostname))) {
      return NextResponse.json({ error: "Private URLs not allowed" }, { status: 400 });
    }
    const upstream = await fetch(target.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NorthwoodBids/1.0)" },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "Image fetch failed" }, { status: 502 });
    }

    const type = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!RASTER.has(type)) {
      return NextResponse.json({ error: "Not a supported image" }, { status: 415 });
    }

    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return NextResponse.json({ error: "Image too large" }, { status: 413 });
    return new NextResponse(buf, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image proxy failed" }, { status: 500 });
  }
}
