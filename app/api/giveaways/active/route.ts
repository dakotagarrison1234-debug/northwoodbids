export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/giveaways/active
 *
 * The live giveaway for the home-page card (single-business app → the one ACTIVE
 * giveaway), plus the signed-in viewer's entry state so the card can show "You're
 * entered", a join form, or a sign-up nudge.
 */
export async function GET() {
  const g = await prisma.giveaway.findFirst({
    where: { status: "ACTIVE", archived: false },
    orderBy: { createdAt: "desc" },
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
    },
  });

  if (!g) return NextResponse.json({ giveaway: null });

  const prizes = g.items.map((it) => ({
    id: it.id,
    title: it.title,
    retailValue: it.retailValue ? Number(it.retailValue) : null,
    photo: it.photos[0]?.url ?? null,
  }));
  const totalValue = prizes.reduce((s, p) => s + (p.retailValue ?? 0), 0);

  // Viewer state.
  const { userId } = await auth();
  let entered = false;
  let signedIn = false;
  if (userId) {
    signedIn = true;
    const profile = await prisma.bidderProfile.findUnique({ where: { clerkUserId: userId }, select: { clerkUserId: true } });
    const entry = await prisma.giveawayEntry.findUnique({
      where: { giveawayId_clerkUserId: { giveawayId: g.id, clerkUserId: userId } },
      select: { removed: true, won: true },
    });
    if (g.requirement === "NONE") {
      // Auto-entered for anyone with a bidder profile, unless the admin pulled them.
      entered = !!profile && !entry?.removed;
    } else {
      // Opt-in: entered only once they've submitted an accepted answer (row exists).
      entered = !!entry && !entry.removed;
    }
  }

  return NextResponse.json({
    giveaway: {
      id: g.id,
      title: g.title,
      description: g.description,
      requirement: g.requirement,
      requirementPrompt: g.requirementPrompt,
      endsAt: g.endsAt,
      winners: prizes.length,
      totalValue,
      prizes,
    },
    signedIn,
    entered,
  });
}
