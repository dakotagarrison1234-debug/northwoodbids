export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { type OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";
import { phaseOf } from "@/lib/giveaway";
import { notifyGiveawayLive } from "@/lib/giveawayNotify";

/**
 * POST /api/admin/giveaways/[id]/announce — text every engaged bidder that this
 * giveaway is live. Once per giveaway (announcedAt is claimed atomically first, so
 * a double-tap can't double-text), and only while it's actually open.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;
  if (!(await requireRole(orgId, ["OWNER", "ADMIN"] as OrgRole[]))) {
    return NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 });
  }
  const { id } = await params;
  const g = await prisma.giveaway.findUnique({ where: { id } });
  if (!g || g.organizationId !== orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (phaseOf(g) !== "live") return NextResponse.json({ error: "Only a live giveaway can be announced." }, { status: 409 });
  if (!process.env.GHL_AUCTION_STARTED_WEBHOOK) {
    return NextResponse.json({ error: "Texting isn't configured (GHL_AUCTION_STARTED_WEBHOOK)." }, { status: 503 });
  }

  const claim = await prisma.giveaway.updateMany({ where: { id, announcedAt: null }, data: { announcedAt: new Date() } });
  if (claim.count === 0) return NextResponse.json({ error: "Already announced." }, { status: 409 });

  const ruleLine =
    g.entryMode === "AUTO"
      ? "Every registered bidder is automatically in."
      : g.entryMode === "BID"
        ? "Every bid you place is a ticket — bid more, more chances."
        : "Tap Take a ticket on the site to enter.";
  const sent = await notifyGiveawayLive({ organizationId: orgId, title: g.title, ruleLine, endsAt: g.endsAt });
  return NextResponse.json({ success: true, sent });
}
