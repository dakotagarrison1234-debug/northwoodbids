import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { seasonBounds } from "@/lib/gameSeason";
import { GAMES, MAX_SCORE } from "@/app/play/games/types";

export const dynamic = "force-dynamic";

type Leader = { rank: number; name: string; avatarKey: string | null; score: number };

/**
 * GET /api/game/leaderboard — everything the arcade floor needs in one call,
 * current 30-day season only.
 *
 * {
 *   seasonEnd,
 *   overall: { top: Leader[10] (score = arcade total), you: { total, rank, played } | null },
 *   games: { [key]: { top: Leader[5], you: { best, rank } | null } },
 * }
 */
export async function GET() {
  const { start: seasonStart, end: seasonEnd } = seasonBounds();
  const { userId } = await auth();

  const rows = (await prisma.gameScore.findMany({
    where: { seasonStart },
    select: { clerkUserId: true, game: true, name: true, avatarKey: true, bestScore: true },
  })).map((r) => ({ ...r, bestScore: Math.min(MAX_SCORE, r.bestScore) })); // pre-arcade raw scores never exceed the ceiling

  // Per cabinet.
  const games: Record<string, { top: Leader[]; you: { best: number; rank: number } | null }> = {};
  for (const g of GAMES) {
    const list = rows.filter((r) => r.game === g.key).sort((a, b) => b.bestScore - a.bestScore);
    const top = list.slice(0, 5).map((r, i) => ({ rank: i + 1, name: r.name || "Anonymous", avatarKey: r.avatarKey, score: r.bestScore }));
    let you: { best: number; rank: number } | null = null;
    if (userId) {
      const mine = list.find((r) => r.clerkUserId === userId);
      if (mine) you = { best: mine.bestScore, rank: list.filter((r) => r.bestScore > mine.bestScore).length + 1 };
    }
    games[g.key] = { top, you };
  }

  // Arcade total = sum of a player's bests across cabinets.
  const totals = new Map<string, { name: string | null; avatarKey: string | null; total: number; played: number }>();
  for (const r of rows) {
    const cur = totals.get(r.clerkUserId) ?? { name: r.name, avatarKey: r.avatarKey, total: 0, played: 0 };
    cur.total += r.bestScore;
    cur.played += 1;
    if (!cur.name && r.name) cur.name = r.name;
    if (!cur.avatarKey && r.avatarKey) cur.avatarKey = r.avatarKey;
    totals.set(r.clerkUserId, cur);
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1].total - a[1].total);
  const overallTop = ranked.slice(0, 10).map(([, t], i) => ({ rank: i + 1, name: t.name || "Anonymous", avatarKey: t.avatarKey, score: t.total }));
  let overallYou: { total: number; rank: number; played: number } | null = null;
  if (userId) {
    const mine = totals.get(userId);
    if (mine) overallYou = { total: mine.total, played: mine.played, rank: ranked.filter(([, t]) => t.total > mine.total).length + 1 };
  }

  return NextResponse.json({ seasonEnd: seasonEnd.toISOString(), overall: { top: overallTop, you: overallYou }, games });
}
