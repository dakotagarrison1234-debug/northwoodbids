export const dynamic = "force-dynamic";
export const maxDuration = 300; // listing a large bucket can take a while
import { NextResponse } from "next/server";
import { type OrgRole } from "@prisma/client";
import { getUserOrg, requireRole } from "@/lib/auth";
import { sweepOrphanItemObjects } from "@/lib/r2";

/**
 * POST /api/admin/r2-orphan-sweep
 *
 * Owner-only maintenance: deletes item photos left in R2 with no ItemPhoto row
 * (older than 24h). Safe to run anytime — scoped to the `items/` prefix and
 * age-gated, so live images, logos, and avatars are never touched. Returns how
 * many objects were scanned and freed.
 */
export async function POST() {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireRole(membership.organizationId, ["OWNER"] as OrgRole[]))) {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }

  const result = await sweepOrphanItemObjects(24);
  return NextResponse.json({ success: true, ...result });
}
