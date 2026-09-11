export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserOrg } from "@/lib/auth";
import { healPickupLinks, locateItems } from "@/lib/pickupIntegrity";

/**
 * GET /api/admin/pickup/locate?q=…
 * "Where is this item?" — by tag #, title, or customer name/phone/email. Returns each
 * matching sold item with ONE honest answer: on which appointment, which transfer,
 * loose at which warehouse, or already collected. Heals dangling links first so the
 * answer is never "nowhere".
 */
export async function GET(request: NextRequest) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = request.nextUrl.searchParams.get("q") || "";
  if (!q.trim()) return NextResponse.json({ results: [] });

  await healPickupLinks(membership.organizationId);
  const results = await locateItems(membership.organizationId, q);
  return NextResponse.json({ results });
}
