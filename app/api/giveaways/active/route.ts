export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { eligibility, getEligibleEntrants, phaseOf, publicName, sweepEndedGiveaways } from "@/lib/giveaway";

/**
 * GET /api/giveaways/active?all=1
 *
 * Published giveaways for the public: live, scheduled (counting down to open) and
 * ended-waiting-to-draw, newest first. The home page shows the first two; the
 * /giveaways portal passes all=1 and also gets recently completed ones with winners.
 * Includes the signed-in viewer's ticket count per giveaway.
 */
export async function GET(request: NextRequest) {
  await sweepEndedGiveaways();
  const all = request.nextUrl.searchParams.get("all") === "1";
  const now = new Date();

  const rows = await prisma.giveaway.findMany({
    where: {
      archived: false,
      OR: [
        { status: { in: ["ACTIVE", "ENDED"] } },
        // Completed ones stay on the portal for two weeks so people can see who won.
        ...(all ? [{ status: "DRAWN" as const, updatedAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } }] : []),
      ],
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          retailValue: true,
          photos: { where: { isPrimary: true }, take: 1, select: { url: true } },
        },
      },
      entries: { where: { won: true }, select: { clerkUserId: true, wonItemId: true } },
    },
  });

  // Ticket totals from the SAME pool the draw uses — never an approximation, so the
  // number on the card is exactly what's in the drum.
  const elig = rows.length ? await eligibility(rows[0].organizationId) : null;
  const pools = new Map<string, Awaited<ReturnType<typeof getEligibleEntrants>>>();
  for (const g of rows) pools.set(g.id, await getEligibleEntrants(g.id, elig ?? undefined));

  // Winner names for completed giveaways.
  const winnerIds = [...new Set(rows.flatMap((g) => g.entries.map((e) => e.clerkUserId)))];
  const profiles = winnerIds.length
    ? await prisma.bidderProfile.findMany({ where: { clerkUserId: { in: winnerIds } }, select: { clerkUserId: true, name: true } })
    : [];
  const nameById = new Map(profiles.map((p) => [p.clerkUserId, publicName(p.name)]));

  const { userId } = await auth();
  const signedIn = !!userId;
  const myWon = userId && rows.length
    ? new Set((await prisma.giveawayEntry.findMany({ where: { clerkUserId: userId, won: true, giveawayId: { in: rows.map((r) => r.id) } }, select: { giveawayId: true } })).map((e) => e.giveawayId))
    : new Set<string>();

  const giveaways = [];
  for (const g of rows) {
    const prizes = g.items.map((it) => ({
      id: it.id,
      title: it.title,
      retailValue: it.retailValue ? Number(it.retailValue) : null,
      photo: it.photos[0]?.url ?? null,
    }));
    const totalValue = prizes.reduce((s, p) => s + (p.retailValue ?? 0), 0);
    const pool = pools.get(g.id) ?? [];
    const meRow = userId ? pool.find((e) => e.clerkUserId === userId) : undefined;
    const mine = meRow
      ? { tickets: meRow.tickets, entered: true, eligible: true, reason: null as string | null }
      : {
          tickets: 0,
          entered: !!userId && myWon.has(g.id),
          eligible: !!userId && !!elig?.ok.has(userId),
          // No BidderProfile yet (signed up, never finished /register) = incomplete.
          reason: userId && elig ? (elig.ineligible.get(userId) ?? (elig.name.has(userId) ? null : "incomplete")) : null,
        };
    giveaways.push({
      id: g.id,
      title: g.title,
      description: g.description,
      phase: phaseOf(g, now),
      entryMode: g.entryMode,
      drawStyle: g.drawStyle,
      requirement: g.requirement,
      requirementPrompt: g.requirementPrompt,
      startsAt: g.startsAt,
      endsAt: g.endsAt,
      minBidAmount: g.minBidAmount != null ? Number(g.minBidAmount) : null,
      maxTicketsPerUser: g.maxTicketsPerUser,
      winners: prizes.length,
      totalValue,
      totalTickets: pool.reduce((s, e) => s + e.tickets, 0),
      totalPeople: pool.length,
      prizes,
      me: { entered: mine.entered, tickets: mine.tickets, eligible: mine.eligible, reason: mine.reason, won: !!userId && myWon.has(g.id) },
      wonBy: g.entries.map((e) => ({
        name: nameById.get(e.clerkUserId) ?? "Bidder",
        prize: prizes.find((p) => p.id === e.wonItemId)?.title ?? "Prize",
      })),
    });
  }

  // Order for display: live first, then ended (waiting), then scheduled, then complete.
  const rank: Record<string, number> = { live: 0, ended: 1, scheduled: 2, complete: 3, draft: 9 };
  giveaways.sort((a, b) => rank[a.phase] - rank[b.phase]);

  const visible = all ? giveaways : giveaways.filter((g) => g.phase !== "complete").slice(0, 2);
  const first = visible[0] ?? null;

  return NextResponse.json({
    giveaways: visible,
    // Back-compat for anything still reading the single-giveaway shape.
    giveaway: first,
    signedIn,
    entered: first?.me.entered ?? false,
  });
}
