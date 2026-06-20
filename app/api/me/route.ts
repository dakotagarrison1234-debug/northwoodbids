export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getUserOrg, isSuperAdmin } from "@/lib/auth";

export async function GET() {
  try {
    const [membership, superAdmin] = await Promise.all([getUserOrg(), isSuperAdmin()]);

    if (!membership) {
      return NextResponse.json({ orgId: null, orgName: null, role: null, isSuperAdmin: superAdmin });
    }

    return NextResponse.json({
      orgId: membership.organization.id,
      orgName: membership.organization.name,
      orgSlug: membership.organization.slug,
      role: membership.role,
      isSuperAdmin: superAdmin,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[me GET]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
