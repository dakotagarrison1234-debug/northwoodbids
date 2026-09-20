export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { type OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";
import { getEligibleEntrants, pickWeighted, signDraw } from "@/lib/giveaway";

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
  // Pull from a live window OR after it's closed ("ended — waiting to pull winners").
  if (g.status !== "ACTIVE" && g.status !== "ENDED") return NextResponse.json({ error: "This giveaway isn't open." }, { status: 409 });

  const prizes = await prisma.item.findMany({
    where: { giveawayId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, bids: { where: { status: "WON" }, take: 1, select: { id: true } } },
  });
  const unclaimed = prizes.filter((p) => p.bids.length === 0);
  if (unclaimed.length === 0) return NextResponse.json({ error: "Every prize has been drawn." }, { status: 409 });

  const pool = await getEligibleEntrants(id);
  if (pool.length === 0) return NextResponse.json({ error: "No eligible entrants left to draw." }, { status: 409 });

  // Every ticket is one chance — a bidder with 14 tickets is 14x as likely as one with 1.
  const winner = pickWeighted(pool);
  if (!winner) return NextResponse.json({ error: "No tickets in the drum." }, { status: 409 });
  const prize = unclaimed[0];

  const { token } = signDraw(id, winner.clerkUserId, prize.id);
  console.info(`[giveaway draw] ${id} → ${winner.clerkUserId} (${winner.tickets} tickets) for ${prize.id}`);

  return NextResponse.json({
    success: true,
    token,
    winner: { clerkUserId: winner.clerkUserId, name: winner.name, tickets: winner.tickets },
    totalTickets: pool.reduce((s, e) => s + e.tickets, 0),
    prize: { id: prize.id, title: prize.title },
    remaining: unclaimed.length,
  });
}
