import { readFile } from "fs/promises";
import { join } from "path";

/**
 * Shared bits for the 1200×630 share cards (app/**\/opengraph-image.tsx): the
 * picture Facebook, iMessage, Google, X, Slack and texts show for a link.
 *
 * Everything is read from assets/og (not public/) so it's bundled with the
 * function and works at build time too. Photos are fetched and turned into
 * small JPEG data URLs, because the card renderer can't draw WebP/HEIC and big
 * originals make it slow; when a photo can't be loaded the card still renders.
 */

export const OG_SIZE = { width: 1200, height: 630 };

export const C = {
  cream: "#f1e7d5",
  creamHi: "#fbf4e6",
  ink: "#241a12",
  body: "#4a3a2b",
  mute: "#8a7559",
  leather: "#6c4d39",
  moss: "#2f5d3a",
  mossBright: "#4a7c59",
  amber: "#c47b3e",
  gold: "#f0a35a",
  line: "#e3d6bf",
};

const asset = (p: string) => readFile(join(process.cwd(), "assets", "og", p));

let fontCache: Promise<{ name: string; data: Buffer; weight: 500 | 600 | 700 | 800 | 900; style: "normal" }[]> | null = null;
export function ogFonts() {
  fontCache ??= Promise.all([
    asset("fonts/bitter-latin-900-normal.woff").then((data) => ({ name: "Bitter", data, weight: 900 as const, style: "normal" as const })),
    asset("fonts/bitter-latin-800-normal.woff").then((data) => ({ name: "Bitter", data, weight: 800 as const, style: "normal" as const })),
    asset("fonts/inter-latin-500-normal.woff").then((data) => ({ name: "Inter", data, weight: 500 as const, style: "normal" as const })),
    asset("fonts/inter-latin-600-normal.woff").then((data) => ({ name: "Inter", data, weight: 600 as const, style: "normal" as const })),
    asset("fonts/inter-latin-700-normal.woff").then((data) => ({ name: "Inter", data, weight: 700 as const, style: "normal" as const })),
  ]);
  return fontCache;
}

const dataUrl = (buf: Buffer, type: string) => `data:${type};base64,${buf.toString("base64")}`;

let logoCache: Promise<string> | null = null;
/** The wooden NB, transparent (360×249). */
export function ogLogo() {
  logoCache ??= asset("nb-logo.png").then((b) => dataUrl(b, "image/png"));
  return logoCache;
}

let lakeCache: Promise<string> | null = null;
/** The home-page lake, cropped to 1200×630. */
export function ogLake() {
  lakeCache ??= asset("lake.jpg").then((b) => dataUrl(b, "image/jpeg"));
  return lakeCache;
}

/** JPEG and PNG by their first bytes. */
function sniff(b: Buffer): "image/jpeg" | "image/png" | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  return null;
}

/**
 * A product photo as a JPEG data URL, about `max` px on its long side, on a white
 * background (transparent PNGs would otherwise go black). Null on any failure.
 */
export async function ogPhoto(url: string | null | undefined, max = 700): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 15 * 1024 * 1024) return null;
    try {
      // sharp ships with Next on Vercel: shrink + flatten + convert anything (WebP, HEIC…).
      const sharp = (await import("sharp")).default;
      const out = await sharp(buf).rotate().resize(max, max, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
      return dataUrl(out, "image/jpeg");
    } catch {
      const type = sniff(buf);
      return type && buf.length < 4 * 1024 * 1024 ? dataUrl(buf, type) : null;
    }
  } catch {
    return null;
  }
}

export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** "Sun 8:00 PM" within the week, else "Sun, Nov 8 · 8:00 PM" (Detroit time). */
export function whenText(d: Date, now = new Date()): string {
  const tz = "America/Detroit";
  const time = d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const days = (d.getTime() - now.getTime()) / 86_400_000;
  if (days >= 0 && days < 6) return `${d.toLocaleDateString("en-US", { timeZone: tz, weekday: "short" })} ${time}`;
  return `${d.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" })} · ${time}`;
}

/** Cut a title to ~max characters on a word boundary. */
export function clip(s: string, max: number): string {
  const t = (s || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–-]+$/, "")}…`;
}

/** The brand strip every card ends with. */
export function OgFooter({ left, right }: { left: string; right: string }) {
  return (
    <div
      style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: 74,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 44px", background: C.ink, color: C.creamHi,
        fontFamily: "Inter", fontSize: 26, fontWeight: 700,
      }}
    >
      <div style={{ display: "flex" }}>{left}</div>
      <div style={{ display: "flex", color: C.gold }}>{right}</div>
    </div>
  );
}

/** Small logo + wordmark row. */
export function OgBrand({ logo, size = 58, color = C.ink }: { logo: string; size?: number; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src={logo} height={size} width={Math.round((size * 360) / 249)} />
      <div style={{ display: "flex", fontFamily: "Bitter", fontWeight: 900, fontSize: Math.round(size * 0.56), color, letterSpacing: -0.5 }}>
        Northwood Bids
      </div>
    </div>
  );
}
