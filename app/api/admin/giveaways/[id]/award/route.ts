export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { type OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";
import { awardGiveawayItem } from "@/lib/giveaway";

/**
 * POST /api/admin/giveaways/[id]/award   Body: { clerkUserId, itemId }
 *
 * COMMIT a previewed win: the admin confirmed the wheel's winner, so record it exactly
 * like an auction win (adds the prize to the winner's orders & pickups). Separate from
 * /draw so re-spinning never awards anything — only this endpoint does.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;
  if (!(await requireRole(orgId, ["OWNER", "ADMIN"] as OrgRole[]))) {
    return NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 });
  }
  const { id } = await params;

  const g = await prisma.giveaway.findUnique({ where: { id }, select: { organizationId: true, status: true, requirement: true } });
  if (!g || g.organizationId !== orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (g.status !== "ACTIVE") return NextResponse.json({ error: "This giveaway isn't live." }, { status: 409 });

  const body = await request.json().catch(() => ({}));
  const clerkUserId = String(body.clerkUserId ?? "").trim();
  const itemId = String(body.itemId ?? "").trim();
  if (!clerkUserId || !itemId) return NextResponse.json({ error: "Missing winner or prize." }, { status: 400 });

  // Prize must belong to this giveaway and still be unclaimed.
  const prize = await prisma.item.findUnique({
    where: { id: itemId },
    select: { id: true, giveawayId: true, bids: { where: { status: "WON" }, take: 1, select: { id: true } } },
  });
  if (!prize || prize.giveawayId !== id) return NextResponse.json({ error: "Prize not found." }, { status: 404 });
  if (prize.bids.length > 0) return NextResponse.json({ error: "That prize was already awarded." }, { status: 409 });

  // Winner must be a real bidder who's still eligible (not removed, not already a winner).
  const profile = await prisma.bidderProfile.findUnique({ where: { clerkUserId }, select: { clerkUserId: true } });
  if (!profile) return NextResponse.json({ error: "Winner has no account." }, { status: 400 });
  const entry = await prisma.giveawayEntry.findUnique({
    where: { giveawayId_clerkUserId: { giveawayId: id, clerkUserId } },
    select: { removed: true, won: true },
  });
  if (entry?.won) return NextResponse.json({ error: "That person already won a prize." }, { status: 409 });
  if (entry?.removed) return NextResponse.json({ error: "That person was removed from the wheel." }, { status: 409 });
  if (g.requirement !== "NONE" && !entry) return NextResponse.json({ error: "That person didn't enter." }, { status: 409 });

  await awardGiveawayItem(clerkUserId, itemId);
  await prisma.giveawayEntry.upsert({
    where: { giveawayId_clerkUserId: { giveawayId: id, clerkUserId } },
    update: { won: true, wonItemId: itemId },
    create: { giveawayId: id, clerkUserId, won: true, wonItemId: itemId },
  });

  const remaining = await prisma.item.count({ where: { giveawayId: id, bids: { none: { status: "WON" } } } });
  if (remaining === 0) await prisma.giveaway.update({ where: { id }, data: { status: "DRAWN" } });

  return NextResponse.json({ success: true, remaining });
}
