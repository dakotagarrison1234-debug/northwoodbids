export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { addMessagePage, LABEL_PAGE } from "@/lib/labelPdf";
import { requireShipAdmin, forbidden, buyersFor } from "../_lib";

/**
 * GET /api/admin/shipping/labels.pdf?ids=a,b,c — every selected box's carrier
 * label in one PDF, one 4x6 page per box in the order given, so a stack prints
 * in one go on the Rollo ("Print all labels" on the Ship board).
 *
 * Each box's labelUrl (EasyPost, requested as 4x6 PDF at shipment creation) is
 * fetched with a 20 s timeout and its page(s) copied in. A PNG label (older
 * shipment, other format) is drawn onto a 4x6 page instead. A box that isn't
 * SHIPPED, or whose label can't be fetched, becomes a page that says so — the
 * stack still lines up with the boxes. Org-scoped; at most 100 ids.
 */
const MAX_IDS = 100;
const FETCH_TIMEOUT_MS = 20_000;

export async function GET(req: NextRequest) {
  const membership = await requireShipAdmin();
  if (!membership) return forbidden();
  const orgId = membership.organizationId;

  const ids = [...new Set((req.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, MAX_IDS);
  if (ids.length === 0) return new Response("No boxes given", { status: 400 });

  const rows = await prisma.shippingBundle.findMany({
    where: { id: { in: ids }, organizationId: orgId },
    select: { id: true, clerkUserId: true, shipName: true, status: true, labelUrl: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const buyers = await buyersFor(rows.map((r) => r.clerkUserId));

  const out = await PDFDocument.create();
  for (const id of ids) {
    const b = byId.get(id);
    if (!b) continue; // not this org's box — leave it out rather than say anything about it
    const name = buyers.get(b.clerkUserId)?.name || b.shipName || "Bidder";
    const shipped = b.status === "SHIPPED" || b.status === "DELIVERED";
    if (!shipped || !b.labelUrl) {
      await addMessagePage(out, `Label for ${name}`, "No label bought yet - buy it from the box on the Ship board.");
      continue;
    }
    const ok = await appendLabel(out, b.labelUrl);
    if (!ok) await addMessagePage(out, `Label for ${name} could not be fetched`, "Reprint from the box: open it on the Ship board and tap Print label.");
  }

  const bytes = await out.save();
  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "America/Detroit" }); // YYYY-MM-DD
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="labels-${stamp}.pdf"`,
      "cache-control": "no-store",
    },
  });
}

/** Fetch one label and add it to `out`. PDF pages are copied in; a PNG is placed on a 4x6 page. */
async function appendLabel(out: PDFDocument, url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return false;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    const isPdf = type.includes("pdf") || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46); // %PDF
    const isPng = type.includes("png") || (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47);
    if (isPdf) {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await out.copyPages(src, src.getPageIndices());
      for (const p of pages) out.addPage(p);
      return pages.length > 0;
    }
    if (isPng) {
      const img = await out.embedPng(bytes);
      const page = out.addPage(LABEL_PAGE);
      const [pw, ph] = LABEL_PAGE;
      const scale = Math.min(pw / img.width, ph / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
      return true;
    }
    return false;
  } catch (e) {
    console.warn("[admin/shipping/labels.pdf] fetch failed:", e instanceof Error ? e.message : e);
    return false;
  }
}
