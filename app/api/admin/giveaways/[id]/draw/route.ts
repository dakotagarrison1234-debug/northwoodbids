export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { type OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";
import { getEligibleEntrants, awardGiveawayItem } from "@/lib/giveaway";

/**
 * POST /api/admin/giveaways/[id]/draw
 *
 * Draws ONE winner: picks a random eligible entrant, awards them the next unclaimed
 * prize (recorded exactly like an auction win), and returns the winner so the wheel
 * can animate to their name. When the last prize is drawn the giveaway flips to DRAWN.
 *
 * The server is authoritative — it picks the winner and records the award atomically,
 * so the client only animates to a result it can't influence.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;
  if (!(await requireRole(orgId, ["OWNER", "ADMIN"] as OrgRole[]))) {
    return NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 });
  }
  const { id } = await params;

  const g = await prisma.giveaway.findUnique({ where: { id }, select: { id: true, organizationId: true, status: true } });
  if (!g || g.organizationId !== orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (g.status !== "ACTIVE") {
    return NextResponse.json({ error: "This giveaway isn't live." }, { status: 409 });
  }

  // Prizes with no winner yet (a prize is claimed once it has a WON bid).
  const prizes = await prisma.item.findMany({
    where: { giveawayId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, bids: { where: { status: "WON" }, take: 1, select: { id: true } } },
  });
  const unclaimed = prizes.filter((p) => p.bids.length === 0);
  if (unclaimed.length === 0) {
    await prisma.giveaway.update({ where: { id }, data: { status: "DRAWN" } });
    return NextResponse.json({ error: "Every prize has been drawn." }, { status: 409 });
  }

  const pool = await getEligibleEntrants(id);
  if (pool.length === 0) {
    return NextResponse.json({ error: "No eligible entrants left to draw." }, { status: 409 });
  }

  // Random winner + next prize.
  const winner = pool[Math.floor(Math.random() * pool.length)];
  const prize = unclaimed[0];

  // Record the award (WON bid + comped $0 PAID payment + PENDING_PICKUP + auto-attach).
  await awardGiveawayItem(winner.clerkUserId, prize.id);

  // Mark the entry as the winner of this prize.
  await prisma.giveawayEntry.upsert({
    where: { giveawayId_clerkUserId: { giveawayId: id, clerkUserId: winner.clerkUserId } },
    update: { won: true, wonItemId: prize.id },
    create: { giveawayId: id, clerkUserId: winner.clerkUserId, won: true, wonItemId: prize.id },
  });

  const remaining = unclaimed.length - 1;
  if (remaining === 0) {
    await prisma.giveaway.update({ where: { id }, data: { status: "DRAWN" } });
  }

  return NextResponse.json({
    success: true,
    winner: { clerkUserId: winner.clerkUserId, name: winner.name },
    prize: { id: prize.id, title: prize.title },
    remaining,
  });
}
