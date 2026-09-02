export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { type OrgRole, type GiveawayRequirementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";

// GET /api/admin/giveaways — list this org's giveaways (newest first).
export async function GET() {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;

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
      requirement: g.requirement,
      prizeCount: g._count.items,
      winnersDrawn: wonBy.get(g.id) ?? 0,
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

  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Give your giveaway a title." }, { status: 400 });

  const requirement: GiveawayRequirementType = ["NONE", "INFO", "ANSWER"].includes(body.requirement)
    ? body.requirement
    : "NONE";
  const requirementPrompt =
    requirement !== "NONE" && typeof body.requirementPrompt === "string" && body.requirementPrompt.trim()
      ? body.requirementPrompt.trim().slice(0, 200)
      : null;
  const requirementAnswer =
    requirement === "ANSWER" && typeof body.requirementAnswer === "string" && body.requirementAnswer.trim()
      ? body.requirementAnswer.trim().slice(0, 200)
      : null;

  if (requirement === "ANSWER" && !requirementAnswer) {
    return NextResponse.json({ error: "A correct-answer giveaway needs the expected answer." }, { status: 400 });
  }
  if (requirement !== "NONE" && !requirementPrompt) {
    return NextResponse.json({ error: "Add the question/prompt entrants will see." }, { status: 400 });
  }

  const giveaway = await prisma.giveaway.create({
    data: {
      organizationId: orgId,
      title: title.slice(0, 120),
      description: typeof body.description === "string" ? body.description.trim().slice(0, 2000) || null : null,
      requirement,
      requirementPrompt,
      requirementAnswer,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      status: "DRAFT",
    },
  });

  return NextResponse.json({ success: true, id: giveaway.id });
}
