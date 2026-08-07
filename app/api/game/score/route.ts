import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { seasonBounds } from "@/lib/gameSeason";

// Submit a game score. Keeps the player's BEST score FOR THE CURRENT 30-day season.
// Sign-in required so the leaderboard shows real names + avatars.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to save your score" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const score = Number(body.score);
  if (!Number.isFinite(score) || score < 0 || score > 10_000_000) {
    return NextResponse.json({ error: "Invalid score" }, { status: 400 });
  }
  const s = Math.floor(score);
  const { start: seasonStart } = seasonBounds();

  // Pull the player's name + avatar from their bidder profile for the board.
  const profile = await prisma.bidderProfile.findUnique({
    where: { clerkUserId: userId },
    select: { name: true, avatarKey: true },
  });

  const existing = await prisma.gameScore.findUnique({
    where: { clerkUserId_seasonStart: { clerkUserId: userId, seasonStart } },
  });
  const best = Math.max(existing?.bestScore ?? 0, s);

  await prisma.gameScore.upsert({
    where: { clerkUserId_seasonStart: { clerkUserId: userId, seasonStart } },
    update: { bestScore: best, plays: { increment: 1 }, name: profile?.name ?? existing?.name ?? null, avatarKey: profile?.avatarKey ?? existing?.avatarKey ?? null },
    create: { clerkUserId: userId, seasonStart, bestScore: s, plays: 1, name: profile?.name ?? null, avatarKey: profile?.avatarKey ?? null },
  });

  // Rank = how many players have a strictly higher best THIS SEASON, + 1.
  const higher = await prisma.gameScore.count({ where: { seasonStart, bestScore: { gt: best } } });

  return NextResponse.json({ success: true, best, isBest: s >= best, rank: higher + 1 });
}
