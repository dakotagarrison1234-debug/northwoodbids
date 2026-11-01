import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { lookup } from "dns/promises";
import net from "net";
import { isPrivateIp } from "@/lib/ssrf";
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
  } catch (e) {
    console.error("[import-image] fetch failed", host, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't reach the image host" }, { status: 502 });
  }

  // Reject redirects rather than auto-following them into a possibly-internal host.
  if (imgRes.status >= 300 && imgRes.status < 400 && imgRes.headers.get("location")) {
    console.error("[import-image] redirect refused", host, "->", imgRes.headers.get("location"));
    return NextResponse.json({ error: "Image host redirected" }, { status: 400 });
  }

  if (!imgRes.ok) {
    console.error("[import-image] upstream", imgRes.status, host);
    return NextResponse.json({ error: `Image host answered ${imgRes.status}` }, { status: 502 });
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
