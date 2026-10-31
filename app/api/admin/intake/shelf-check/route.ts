export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserOrg } from "@/lib/auth";
import { checkShelf } from "@/lib/shelfCheck";

/**
 * GET /api/admin/intake/shelf-check?shelf=17A&auctionId=…&locationId=…
 * Live status for the shelf field while listing: who else is on this shelf.
 */
export async function GET(req: NextRequest) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const result = await checkShelf({
    orgId: membership.organization.id,
    shelf: q.get("shelf") ?? "",
    auctionId: q.get("auctionId") || null,
    locationId: q.get("locationId") || null,
    clerkUserId: membership.clerkUserId,
  });
  return NextResponse.json(result);
}
