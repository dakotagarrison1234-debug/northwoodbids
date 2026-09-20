export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { type OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";
import { phaseOf, sweepEndedGiveaways } from "@/lib/giveaway";
import { parseGiveawayFields, validateForLive } from "@/lib/giveawayAdmin";

// GET /api/admin/giveaways — list this org's giveaways (newest first).
export async function GET() {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;

  await sweepEndedGiveaways(orgId);

  const giveaways = await prisma.giveaway.findMany({
    where: { organizationId: orgId, archived: false },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { items: true } } },
  });

  // Winners drawn per giveaway = entries marked won.
  const ids = giveaways.map((g) => g.id);
  const wonCounts = ids.length
    ? await prisma.giveawayEntry.groupBy({
        by: ["giveawayId"],
        where: { giveawayId: { in: ids }, won: true },
        _count: { _all: true },
      })
    : [];
  const wonBy = new Map(wonCounts.map((w) => [w.giveawayId, w._count._all]));

  return NextResponse.json({
    giveaways: giveaways.map((g) => ({
      id: g.id,
      title: g.title,
      status: g.status,
      phase: phaseOf(g),
      entryMode: g.entryMode,
      drawStyle: g.drawStyle,
      requirement: g.requirement,
      prizeCount: g._count.items,
      winnersDrawn: wonBy.get(g.id) ?? 0,
      startsAt: g.startsAt,
      endsAt: g.endsAt,
      createdAt: g.createdAt,
    })),
  });
}

// POST /api/admin/giveaways — create a giveaway (starts as DRAFT).
export async function POST(request: NextRequest) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireRole(membership.organizationId, ["OWNER", "ADMIN"] as OrgRole[]))) {
    return NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 });
  }
  const orgId = membership.organizationId;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseGiveawayFields(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;

  const entryMode = d.entryMode ?? "AUTO";
  // A question only makes sense for tap-to-enter.
  const requirement = entryMode === "CLICK" ? d.requirement ?? "NONE" : "NONE";
  const fields = {
    entryMode,
    requirement,
    requirementPrompt: requirement !== "NONE" ? d.requirementPrompt ?? null : null,
    requirementAnswer: requirement === "ANSWER" ? d.requirementAnswer ?? null : null,
    startsAt: d.startsAt ?? null,
    endsAt: d.endsAt ?? null,
  };
  const problem = validateForLive(fields);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const giveaway = await prisma.giveaway.create({
    data: {
      organizationId: orgId,
      title: d.title!,
      description: d.description ?? null,
      drawStyle: d.drawStyle ?? (entryMode === "BID" ? "MACHINE" : "WHEEL"),
      minBidAmount: entryMode === "BID" ? d.minBidAmount ?? null : null,
      maxTicketsPerUser: entryMode === "BID" ? d.maxTicketsPerUser ?? null : null,
      ...fields,
      status: "DRAFT",
    },
  });

  return NextResponse.json({ success: true, id: giveaway.id });
}
