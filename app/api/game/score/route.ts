import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { seasonBounds } from "@/lib/gameSeason";
import { GAME_KEYS, MAX_SCORE, gameMeta } from "@/app/play/games/types";

/**
 * POST /api/game/score  { game, score }
 *
 * Saves a run. Keeps the player's BEST per cabinet for the current 30-day
 * season; the arcade total is the sum of those bests. `score` is the game's
 * raw score — the cabinet's `scale` (types.ts) is applied here so every
 * cabinet lands on the shared scale, and the server never trusts more than
 * MAX_SCORE. Sign-in required so the board shows real names + critters.
 *
 * → { success, points, best, isBest, rank, total, totalRank }
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to save your score" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const game = typeof body.game === "string" ? body.game : "gavel";
  const meta = gameMeta(game);
  if (!meta || !GAME_KEYS.has(game)) return NextResponse.json({ error: "Unknown game" }, { status: 400 });

  const raw = Number(body.score);
  if (!Number.isFinite(raw) || raw < 0) return NextResponse.json({ error: "Invalid score" }, { status: 400 });
  const points = Math.min(MAX_SCORE, Math.floor(raw * meta.scale));

  const { start: seasonStart } = seasonBounds();

  const profile = await prisma.bidderProfile.findUnique({
    where: { clerkUserId: userId },
    select: { name: true, avatarKey: true },
  });

  const existing = await prisma.gameScore.findUnique({
    where: { clerkUserId_seasonStart_game: { clerkUserId: userId, seasonStart, game } },
  });
  // Rows from before the arcade held raw, unscaled scores; never let one of
  // those sit above the shared ceiling.
  const prevBest = Math.min(MAX_SCORE, existing?.bestScore ?? 0);

  await prisma.gameScore.upsert({
    where: { clerkUserId_seasonStart_game: { clerkUserId: userId, seasonStart, game } },
    update: { plays: { increment: 1 }, name: profile?.name ?? existing?.name ?? null, avatarKey: profile?.avatarKey ?? existing?.avatarKey ?? null },
    create: { clerkUserId: userId, seasonStart, game, bestScore: points, plays: 1, name: profile?.name ?? null, avatarKey: profile?.avatarKey ?? null },
  });
  // Raise the best only if this run beats what's stored right now (atomic, so
  // two tabs finishing at once can't lower it).
  await prisma.gameScore.updateMany({
    where: { clerkUserId: userId, seasonStart, game, bestScore: { lt: points } },
    data: { bestScore: points },
  });
  const best = Math.max(prevBest, points);

  // Cabinet rank: players with a strictly higher best on this game, + 1.
  const higher = await prisma.gameScore.count({ where: { seasonStart, game, bestScore: { gt: best } } });

  // Arcade total + rank across every cabinet.
  const totals = await prisma.gameScore.groupBy({
    by: ["clerkUserId"],
    where: { seasonStart },
    _sum: { bestScore: true },
  });
  const mine = totals.find((t) => t.clerkUserId === userId)?._sum.bestScore ?? best;
  const totalRank = totals.filter((t) => (t._sum.bestScore ?? 0) > mine).length + 1;

  return NextResponse.json({ success: true, points, best, isBest: points > prevBest, rank: higher + 1, total: mine, totalRank });
}
