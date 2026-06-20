import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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

  if (parsedUrl.protocol !== "https:") {
    return NextResponse.json({ error: "Only HTTPS URLs allowed" }, { status: 400 });
  }

  // Block private/local IP ranges
  const blocked = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(parsedUrl.hostname);
  if (blocked) {
    return NextResponse.json({ error: "Private URLs not allowed" }, { status: 400 });
  }

  // Fetch the external image
  let imgRes: Response;
  try {
    imgRes = await fetch(url, {
      headers: { "User-Agent": "Northwood Bids/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 });
  }

  if (!imgRes.ok) {
    return NextResponse.json({ error: "Image not available" }, { status: 502 });
  }

  const contentType = imgRes.headers.get("content-type")?.split(";")[0].trim() ?? "image/jpeg";
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
  }

  const ext = contentType === "image/jpeg" ? "jpg"
    : contentType === "image/png" ? "png"
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
