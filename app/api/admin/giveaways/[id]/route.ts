export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { type OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";
import { getEligibleEntrants } from "@/lib/giveaway";

async function loadOwned(id: string, orgId: string) {
  const g = await prisma.giveaway.findUnique({ where: { id } });
  if (!g || g.organizationId !== orgId) return null;
  return g;
}

// GET /api/admin/giveaways/[id] — full detail: prizes, eligible pool, winners.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;
  const { id } = await params;

  const g = await loadOwned(id, orgId);
  if (!g) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [prizes, entries, pool] = await Promise.all([
    prisma.item.findMany({
      where: { giveawayId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        retailValue: true,
        status: true,
        photos: { where: { isPrimary: true }, take: 1, select: { url: true } },
      },
    }),
    prisma.giveawayEntry.findMany({ where: { giveawayId: id }, orderBy: { updatedAt: "desc" } }),
    getEligibleEntrants(id),
  ]);

  // Winners: entries marked won, with the prize they took + their name.
  const winnerRows = entries.filter((e) => e.won && e.wonItemId);
  const winnerIds = winnerRows.map((w) => w.clerkUserId);
  const removedRows = entries.filter((e) => e.removed);
  const profileIds = [...new Set([...winnerIds, ...removedRows.map((r) => r.clerkUserId)])];
  const profiles = profileIds.length
    ? await prisma.bidderProfile.findMany({
        where: { clerkUserId: { in: profileIds } },
        select: { clerkUserId: true, name: true },
      })
    : [];
  const nameById = new Map(profiles.map((p) => [p.clerkUserId, p.name || "Bidder"]));
  const titleById = new Map(prizes.map((p) => [p.id, p.title]));

  return NextResponse.json({
    giveaway: {
      id: g.id,
      title: g.title,
      description: g.description,
      status: g.status,
      requirement: g.requirement,
      requirementPrompt: g.requirementPrompt,
      requirementAnswer: g.requirementAnswer,
      endsAt: g.endsAt,
    },
    prizes: prizes.map((p) => {
      const winner = winnerRows.find((w) => w.wonItemId === p.id);
      return {
        id: p.id,
        title: p.title,
        retailValue: p.retailValue ? Number(p.retailValue) : null,
        photo: p.photos[0]?.url ?? null,
        status: p.status,
        wonBy: winner ? { clerkUserId: winner.clerkUserId, name: nameById.get(winner.clerkUserId) ?? "Bidder" } : null,
      };
    }),
    // Only a sample goes to the browser (the wheel just needs names to show; the
    // draw itself is server-side over the full pool). counts.eligible is the true total.
    pool: pool.slice(0, 300),
    winners: winnerRows.map((w) => ({
      clerkUserId: w.clerkUserId,
      name: nameById.get(w.clerkUserId) ?? "Bidder",
      itemId: w.wonItemId,
      itemTitle: w.wonItemId ? titleById.get(w.wonItemId) ?? "Prize" : "Prize",
    })),
    removed: removedRows.map((r) => ({ clerkUserId: r.clerkUserId, name: nameById.get(r.clerkUserId) ?? "Bidder" })),
    counts: {
      prizes: prizes.length,
      drawn: winnerRows.length,
      eligible: pool.length,
    },
  });
}

// PATCH /api/admin/giveaways/[id] — edit fields, activate, or archive.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;
  if (!(await requireRole(orgId, ["OWNER", "ADMIN"] as OrgRole[]))) {
    return NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 });
  }
  const { id } = await params;
  const g = await loadOwned(id, orgId);
  if (!g) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  // Content edits only while still DRAFT (before it's public / drawn).
  if (g.status === "DRAFT") {
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 120);
    if (body.description !== undefined)
      data.description = typeof body.description === "string" ? body.description.trim().slice(0, 2000) || null : null;
    if (["NONE", "INFO", "ANSWER"].includes(body.requirement)) data.requirement = body.requirement;
    if (body.requirementPrompt !== undefined)
      data.requirementPrompt =
        typeof body.requirementPrompt === "string" && body.requirementPrompt.trim()
          ? body.requirementPrompt.trim().slice(0, 200)
          : null;
    if (body.requirementAnswer !== undefined)
      data.requirementAnswer =
        typeof body.requirementAnswer === "string" && body.requirementAnswer.trim()
          ? body.requirementAnswer.trim().slice(0, 200)
          : null;
    if (body.endsAt !== undefined) data.endsAt = body.endsAt ? new Date(body.endsAt) : null;
  }

  // Activate: must have at least one prize.
  if (body.status === "ACTIVE" && g.status === "DRAFT") {
    const prizeCount = await prisma.item.count({ where: { giveawayId: id } });
    if (prizeCount === 0) {
      return NextResponse.json({ error: "Add at least one prize before going live." }, { status: 400 });
    }
    const finalReq = (data.requirement as string) ?? g.requirement;
    const finalPrompt = data.requirementPrompt !== undefined ? data.requirementPrompt : g.requirementPrompt;
    const finalAnswer = data.requirementAnswer !== undefined ? data.requirementAnswer : g.requirementAnswer;
    if (finalReq !== "NONE" && !finalPrompt) {
      return NextResponse.json({ error: "Add the entry question before going live." }, { status: 400 });
    }
    if (finalReq === "ANSWER" && !finalAnswer) {
      return NextResponse.json({ error: "Set the correct answer before going live." }, { status: 400 });
    }
    data.status = "ACTIVE";
  }
  // Back to draft (pause) — only if nothing's been drawn yet.
  if (body.status === "DRAFT" && g.status === "ACTIVE") {
    const drawn = await prisma.giveawayEntry.count({ where: { giveawayId: id, won: true } });
    if (drawn > 0) return NextResponse.json({ error: "Winners already drawn — can't unpublish." }, { status: 409 });
    data.status = "DRAFT";
  }

  if (body.archived === true) data.archived = true;

  if (Object.keys(data).length === 0) return NextResponse.json({ success: true, unchanged: true });
  await prisma.giveaway.update({ where: { id }, data });
  return NextResponse.json({ success: true });
}

// DELETE /api/admin/giveaways/[id] — delete a giveaway that has no drawn winners.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;
  if (!(await requireRole(orgId, ["OWNER", "ADMIN"] as OrgRole[]))) {
    return NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 });
  }
  const { id } = await params;
  const g = await loadOwned(id, orgId);
  if (!g) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const drawn = await prisma.giveawayEntry.count({ where: { giveawayId: id, won: true } });
  if (drawn > 0) {
    return NextResponse.json({ error: "Winners have been drawn — archive it instead of deleting." }, { status: 409 });
  }

  // Detach prize items (they're deleted separately via the items endpoint), clear
  // entries, then remove the giveaway.
  await prisma.item.updateMany({ where: { giveawayId: id }, data: { giveawayId: null } });
  await prisma.giveaway.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
