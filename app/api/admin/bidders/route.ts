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

  const bidders = await prisma.bidderProfile.findMany({
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

  return NextResponse.json({ bidders });
}
