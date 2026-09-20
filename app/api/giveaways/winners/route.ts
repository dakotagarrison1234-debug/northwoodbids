export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicName } from "@/lib/giveaway";

/**
 * GET /api/giveaways/winners — the public winners wall: every prize ever awarded,
 * newest first, as "Sarah M. won the Dyson V8 · Fall Kickoff Giveaway". First name +
 * last initial only. Capped at the last 60.
 */
export async function GET() {
  const rows = await prisma.giveawayEntry.findMany({
    where: { won: true, wonItemId: { not: null }, giveaway: { archived: false } },
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: {
      clerkUserId: true,
      updatedAt: true,
      wonItemId: true,
      giveaway: { select: { id: true, title: true } },
    },
  });
  if (rows.length === 0) return NextResponse.json({ winners: [] });

  const itemIds = rows.map((r) => r.wonItemId!).filter(Boolean);
  const userIds = [...new Set(rows.map((r) => r.clerkUserId))];
  const [items, profiles] = await Promise.all([
    prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, title: true, retailValue: true, photos: { where: { isPrimary: true }, take: 1, select: { url: true } } },
    }),
    prisma.bidderProfile.findMany({ where: { clerkUserId: { in: userIds } }, select: { clerkUserId: true, name: true } }),
  ]);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const nameById = new Map(profiles.map((p) => [p.clerkUserId, publicName(p.name)]));

  return NextResponse.json({
    winners: rows.map((r) => {
      const it = r.wonItemId ? itemById.get(r.wonItemId) : null;
      return {
        name: nameById.get(r.clerkUserId) ?? "Bidder",
        prize: it?.title ?? "Prize",
        photo: it?.photos[0]?.url ?? null,
        value: it?.retailValue ? Number(it.retailValue) : null,
        giveawayId: r.giveaway.id,
        giveawayTitle: r.giveaway.title,
        wonAt: r.updatedAt,
      };
    }),
  });
}
