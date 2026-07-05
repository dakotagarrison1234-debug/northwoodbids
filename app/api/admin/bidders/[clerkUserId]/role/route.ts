import { NextRequest, NextResponse } from "next/server";
import type { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";

/**
 * POST /api/admin/bidders/[clerkUserId]/role
 * Body: { role: "STAFF" | "ADMIN" }  — promote a bidder to staff/admin in one click.
 *        { role: null }               — remove staff access (back to a plain bidder).
 *
 * OWNER/ADMIN may grant STAFF or ADMIN; only OWNER may remove a member. An OWNER's
 * role can never be changed here (protects the account that owns the business).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clerkUserId: string }> }
) {
  const { clerkUserId } = await params;
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireRole(membership.organizationId, ["OWNER", "ADMIN"] as OrgRole[]))) {
    return NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const rawRole = body.role;
  const orgId = membership.organizationId;

  // Look at the target's current membership (if any).
  const existing = await prisma.orgMember.findUnique({
    where: { clerkUserId_organizationId: { clerkUserId, organizationId: orgId } },
  });

  // Never let anyone modify an OWNER via this endpoint.
  if (existing?.role === "OWNER") {
    return NextResponse.json({ error: "You can't change the owner's role." }, { status: 400 });
  }

  // ── Remove staff access (downgrade to plain bidder) — OWNER only ──
  if (rawRole === null) {
    if (membership.role !== "OWNER") {
      return NextResponse.json({ error: "Only the owner can remove staff access." }, { status: 403 });
    }
    if (existing) {
      await prisma.orgMember.delete({ where: { id: existing.id } });
    }
    return NextResponse.json({ success: true, role: null });
  }

  // ── Promote / change role ──
  if (rawRole !== "STAFF" && rawRole !== "ADMIN") {
    return NextResponse.json({ error: "Role must be STAFF or ADMIN." }, { status: 400 });
  }
  // Only an OWNER can mint another ADMIN.
  if (rawRole === "ADMIN" && membership.role !== "OWNER") {
    return NextResponse.json({ error: "Only the owner can make someone an admin." }, { status: 403 });
  }

  const member = await prisma.orgMember.upsert({
    where: { clerkUserId_organizationId: { clerkUserId, organizationId: orgId } },
    update: { role: rawRole },
    create: { clerkUserId, organizationId: orgId, role: rawRole },
  });

  return NextResponse.json({ success: true, role: member.role });
}
