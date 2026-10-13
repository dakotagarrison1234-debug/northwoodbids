export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { buildBatch } from "@/lib/labelPdf";
import { bundlePullLists } from "../../label/_bundle";
import { requireShipAdmin, forbidden } from "../_lib";

/**
 * GET /api/admin/shipping/pull-list.pdf?ids=a,b,c — the pull list (the same
 * 4x6 label as /api/admin/label?type=bundle) for every selected box in one
 * PDF, one page per box in the order given ("Print pull lists" on the Ship
 * board). Org-scoped; ids that aren't this org's boxes are left out; at most 100.
 */
const MAX_IDS = 100;

export async function GET(req: NextRequest) {
  const membership = await requireShipAdmin();
  if (!membership) return forbidden();

  const ids = [...new Set((req.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, MAX_IDS);
  if (ids.length === 0) return new Response("No boxes given", { status: 400 });

  const lists = await bundlePullLists(ids, membership.organizationId);
  if (lists.length === 0) return new Response("Box not found", { status: 404 });

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "America/Detroit" });
  return new Response(Buffer.from(await buildBatch(lists)), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="pull-lists-${stamp}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
