export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { type OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";
import { eligibility, endGiveawayNow, getEligibleEntrants, phaseOf, sweepEndedGiveaways } from "@/lib/giveaway";
import { parseGiveawayFields, validateForLive } from "@/lib/giveawayAdmin";

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

  await sweepEndedGiveaways(orgId);
  const g = await loadOwned(id, orgId);
  if (!g) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [prizes, entries, pool, elig] = await Promise.all([
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
    eligibility(orgId, { requireCard: g.requireCard }),
  ]);
  // Fairness summary: who's been filtered out and why (so the owner can see the
  // guardrails working, and spot duplicate-account attempts).
  const filtered = { noCard: 0, incomplete: 0, blocked: 0, duplicate: 0 };
  for (const r of elig.ineligible.values()) {
    if (r === "no_card") filtered.noCard++;
    else if (r === "incomplete") filtered.incomplete++;
    else if (r === "blocked") filtered.blocked++;
    else filtered.duplicate++;
  }
  const duplicates = [...elig.duplicateOf.entries()].slice(0, 50).map(([dupe, canon]) => ({
    name: elig.name.get(dupe) ?? "Bidder",
    sameAs: elig.name.get(canon) ?? "Bidder",
  }));

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
  const totalTickets = pool.reduce((s, e) => s + e.tickets, 0);

  return NextResponse.json({
    giveaway: {
      id: g.id,
      title: g.title,
      description: g.description,
      status: g.status,
      phase: phaseOf(g),
      entryMode: g.entryMode,
      drawStyle: g.drawStyle,
      requirement: g.requirement,
      requirementPrompt: g.requirementPrompt,
      requirementAnswer: g.requirementAnswer,
      startsAt: g.startsAt,
      endsAt: g.endsAt,
      endedAt: g.endedAt,
      minBidAmount: g.minBidAmount != null ? Number(g.minBidAmount) : null,
      maxTicketsPerUser: g.maxTicketsPerUser,
      requireCard: g.requireCard,
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
    // The whole pool goes to the browser so the wheel/machine can show every name
    // (fairness). Capped high only to keep the SVG renderable; counts.eligible is the
    // true total, and the draw itself is server-side over the full weighted pool.
    pool: pool.slice(0, 1500),
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
      tickets: totalTickets,
    },
    fairness: { filtered, duplicates },
  });
}

// PATCH /api/admin/giveaways/[id] — edit fields, publish, pause, end now, or archive.
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

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  // Content edits: everything while DRAFT; once published only the copy + the end
  // time (extend / shorten) can change — the rules people entered under are frozen.
  const parsed = parseGiveawayFields(body, true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;
  if (g.status === "DRAFT") {
    Object.assign(data, d);
  } else if (g.status === "ACTIVE") {
    if (d.title !== undefined) data.title = d.title;
    if (d.description !== undefined) data.description = d.description;
    if (d.requireCard !== undefined) data.requireCard = d.requireCard; // loosen/tighten who counts, even mid-run
    if (d.endsAt !== undefined) data.endsAt = d.endsAt;
    if (d.drawStyle !== undefined) data.drawStyle = d.drawStyle;
  } else if (g.status === "ENDED") {
    if (d.drawStyle !== undefined) data.drawStyle = d.drawStyle; // can still pick the machine for the show
    if (d.endsAt !== undefined && body.status === "ACTIVE") data.endsAt = d.endsAt; // the new close time for a reopen
  }

  const merged = {
    entryMode: (data.entryMode as string) ?? g.entryMode,
    requirement: (data.requirement as string) ?? g.requirement,
    requirementPrompt: (data.requirementPrompt as string | null | undefined) ?? g.requirementPrompt,
    requirementAnswer: (data.requirementAnswer as string | null | undefined) ?? g.requirementAnswer,
    startsAt: (data.startsAt as Date | null | undefined) === undefined ? g.startsAt : (data.startsAt as Date | null),
    endsAt: (data.endsAt as Date | null | undefined) === undefined ? g.endsAt : (data.endsAt as Date | null),
  };

  // Changing the close time while live still has to respect the live rules
  // (after the start, and bid giveaways always need one).
  if (g.status === "ACTIVE" && data.endsAt !== undefined) {
    const problem = validateForLive(merged);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  // Publish: must have at least one prize and pass the live rules.
  if (body.status === "ACTIVE" && g.status === "DRAFT") {
    const prizeCount = await prisma.item.count({ where: { giveawayId: id } });
    if (prizeCount === 0) {
      return NextResponse.json({ error: "Add at least one prize before going live." }, { status: 400 });
    }
    const problem = validateForLive(merged);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    if (merged.endsAt && merged.endsAt <= new Date()) {
      return NextResponse.json({ error: "The end time is already in the past — move it forward first." }, { status: 400 });
    }
    data.status = "ACTIVE";
    data.endedAt = null;
    // No explicit open time = opens NOW (not when the draft was created), so bids
    // placed while it sat in draft never count.
    if (!merged.startsAt) data.startsAt = new Date();
  }
  // Back to draft (pause) — only if nothing's been drawn yet.
  if (body.status === "DRAFT" && (g.status === "ACTIVE" || g.status === "ENDED")) {
    const drawn = await prisma.giveawayEntry.count({ where: { giveawayId: id, won: true } });
    if (drawn > 0) return NextResponse.json({ error: "Winners already drawn — can't unpublish." }, { status: 409 });
    data.status = "DRAFT";
    data.endedAt = null;
  }
  // End now: close the window, keep the tickets, wait for the draw.
  if (body.status === "ENDED" && g.status === "ACTIVE") {
    await endGiveawayNow(id);
  }
  // Reopen an ended window (extend) — only before any winner is pulled.
  if (body.status === "ACTIVE" && g.status === "ENDED") {
    const drawn = await prisma.giveawayEntry.count({ where: { giveawayId: id, won: true } });
    if (drawn > 0) return NextResponse.json({ error: "Winners already drawn — can't reopen." }, { status: 409 });
    const problem = validateForLive(merged);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const newEnd = merged.endsAt;
    if (newEnd && newEnd <= new Date()) {
      return NextResponse.json({ error: "Set a new end time in the future to reopen." }, { status: 400 });
    }
    data.status = "ACTIVE";
    data.endedAt = null;
  }

  // Archive only once it's finished (or never went out) — hiding a live one would strand entrants.
  if (body.archived === true) {
    if (g.status === "ACTIVE" || g.status === "ENDED") {
      return NextResponse.json({ error: "Pull the winners (or unpublish) before archiving." }, { status: 409 });
    }
    data.archived = true;
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ success: true, unchanged: body.status !== "ENDED" });
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
