import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

// List bidders (with block status) for the admin Bidders page. Supports ?q= search.
export async function GET(req: NextRequest) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q } },
        ],
      }
    : {};

  const rows = await prisma.bidderProfile.findMany({
    where,
    orderBy: [{ blocked: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      clerkUserId: true,
      name: true,
      email: true,
      phone: true,
      blocked: true,
      blockedAt: true,
      blockedReason: true,
      createdAt: true,
    },
  });

  // Tag each bidder with their staff role in THIS org (if any), so the UI can show
  // "Staff"/"Admin"/"Owner" and offer promote/remove.
  const ids = rows.map((b) => b.clerkUserId);
  const members = ids.length
    ? await prisma.orgMember.findMany({
        where: { organizationId: membership.organizationId, clerkUserId: { in: ids } },
        select: { clerkUserId: true, role: true },
      })
    : [];
  const roleById = new Map(members.map((m) => [m.clerkUserId, m.role]));
  const bidders = rows.map((b) => ({ ...b, role: roleById.get(b.clerkUserId) ?? null }));

  return NextResponse.json({ bidders });
}
