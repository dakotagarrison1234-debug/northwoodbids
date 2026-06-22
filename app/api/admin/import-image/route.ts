import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { lookup } from "dns/promises";
import net from "net";
import { getUserOrg } from "@/lib/auth";

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

// Returns true if the given IP literal falls in a private/reserved range that
// should never be reachable from a server-side fetch (SSRF protection).
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 0) return true; // 0.0.0.0/8 (incl. 0.0.0.0)
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local incl. metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    // IPv4-mapped (::ffff:a.b.c.d) — extract and re-check the embedded IPv4.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    // Expand the leading group to test fc00::/7 (ULA) and fe80::/10 (link-local).
    const firstGroup = lower.split(":")[0];
    if (firstGroup) {
      const val = parseInt(firstGroup.padEnd(4, "0").slice(0, 4), 16);
      if ((val & 0xfe00) === 0xfc00) return true; // fc00::/7
      if ((val & 0xffc0) === 0xfe80) return true; // fe80::/10
    }
    return false;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const membership = await getUserOrg();
  if (!membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  // Must be a valid HTTPS URL (no private IPs, no local network)
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return NextResponse.json({ error: "Only http(s) URLs allowed" }, { status: 400 });
  }

  // Block private/local IP ranges, cloud metadata, and IPv6 loopback/link-local.
  // Strip brackets from IPv6 hostnames (e.g. [::1]) before matching.
  const host = parsedUrl.hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (host === "localhost") {
    return NextResponse.json({ error: "Private URLs not allowed" }, { status: 400 });
  }

  // Reject IP-literal hosts that aren't a plain dotted-decimal IPv4 / standard
  // IPv6. This blocks octal/decimal/hex encoded IPv4 (e.g. 0177.0.0.1,
  // 2130706433, 0x7f.0.0.1) that would otherwise bypass the range checks.
  const looksNumeric = /^[0-9a-fx.:]+$/i.test(host);
  if (looksNumeric && !net.isIP(host)) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // If the host is an IP literal, check it directly; otherwise resolve via DNS
  // and reject if ANY resolved address is in a private/reserved range. This is
  // what stops DNS-rebinding and hostnames that point at internal infra.
  if (net.isIP(host)) {
    if (isPrivateIp(host)) {
      return NextResponse.json({ error: "Private URLs not allowed" }, { status: 400 });
    }
  } else {
    try {
      const addrs = await lookup(host, { all: true });
      if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
        return NextResponse.json({ error: "Private URLs not allowed" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Failed to resolve host" }, { status: 400 });
    }
  }

  // Fetch the external image. Use manual redirect handling so a 3xx can't
  // bounce us into an internal host that bypassed the checks above.
  let imgRes: Response;
  try {
    imgRes = await fetch(url, {
      headers: { "User-Agent": "Northwood Bids/1.0" },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 });
  }

  // Reject redirects rather than auto-following them into a possibly-internal host.
  if (imgRes.status >= 300 && imgRes.status < 400 && imgRes.headers.get("location")) {
    return NextResponse.json({ error: "Redirects not allowed" }, { status: 400 });
  }

  if (!imgRes.ok) {
    return NextResponse.json({ error: "Image not available" }, { status: 502 });
  }

  const rawType = imgRes.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  // Reject obvious non-images (e.g. an HTML error page), but tolerate missing/odd
  // content-types from product-image hosts by inferring the type below.
  if (rawType.startsWith("text/") || rawType.includes("html") || rawType.includes("json")) {
    return NextResponse.json({ error: "URL did not return an image" }, { status: 400 });
  }
  let contentType = rawType.startsWith("image/") && ALLOWED_CONTENT_TYPES.includes(rawType) ? rawType : "";
  if (!contentType) {
    // Infer from the URL extension; default to JPEG (most product images).
    const pathExt = parsedUrl.pathname.split(".").pop()?.toLowerCase() ?? "";
    const extMap: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif" };
    contentType = extMap[pathExt] ?? "image/jpeg";
  }

  const ext = contentType === "image/png" ? "png"
    : contentType === "image/webp" ? "webp"
    : contentType === "image/gif" ? "gif"
    : contentType === "image/avif" ? "avif"
    : "jpg";

  const body = await imgRes.arrayBuffer();

  // Size guard — reject anything over 8 MB
  if (body.byteLength > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "Image too large" }, { status: 400 });
  }

  const key = `items/${Date.now()}-barcode-import.${ext}`;

  try {
    await s3.send(new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET,
      Key: key,
      Body: Buffer.from(body),
      ContentType: contentType,
    }));
  } catch (err) {
    console.error("R2 upload error:", err);
    return NextResponse.json({ error: "Storage upload failed" }, { status: 500 });
  }

  const publicUrl = `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${key}`;
  return NextResponse.json({ publicUrl });
}
