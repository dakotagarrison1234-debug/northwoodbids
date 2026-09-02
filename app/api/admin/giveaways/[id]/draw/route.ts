export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { type OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";
import { getEligibleEntrants } from "@/lib/giveaway";

/**
 * POST /api/admin/giveaways/[id]/draw  — PREVIEW a winner (does NOT commit).
 *
 * Picks a random eligible entrant + the next unclaimed prize and returns them so the
 * wheel can land on the name. Nothing is written: the admin can re-spin (discard) as
 * many times as they like. The win is only recorded when they confirm via /award.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;
  if (!(await requireRole(orgId, ["OWNER", "ADMIN"] as OrgRole[]))) {
    return NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 });
  }
  const { id } = await params;

  const g = await prisma.giveaway.findUnique({ where: { id }, select: { organizationId: true, status: true } });
  if (!g || g.organizationId !== orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (g.status !== "ACTIVE") return NextResponse.json({ error: "This giveaway isn't live." }, { status: 409 });

  const prizes = await prisma.item.findMany({
    where: { giveawayId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, bids: { where: { status: "WON" }, take: 1, select: { id: true } } },
  });
  const unclaimed = prizes.filter((p) => p.bids.length === 0);
  if (unclaimed.length === 0) return NextResponse.json({ error: "Every prize has been drawn." }, { status: 409 });

  const pool = await getEligibleEntrants(id);
  if (pool.length === 0) return NextResponse.json({ error: "No eligible entrants left to draw." }, { status: 409 });

  const winner = pool[Math.floor(Math.random() * pool.length)];
  const prize = unclaimed[0];

  return NextResponse.json({
    success: true,
    winner: { clerkUserId: winner.clerkUserId, name: winner.name },
    prize: { id: prize.id, title: prize.title },
    remaining: unclaimed.length,
  });
}
