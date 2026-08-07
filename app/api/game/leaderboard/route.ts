import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { seasonBounds } from "@/lib/gameSeason";

export const dynamic = "force-dynamic";

// Public leaderboard for the auction game — CURRENT 30-day season only (top 10).
export async function GET() {
  const { start: seasonStart, end: seasonEnd } = seasonBounds();

  const top = await prisma.gameScore.findMany({
    where: { seasonStart },
    orderBy: { bestScore: "desc" },
    take: 10,
    select: { clerkUserId: true, name: true, avatarKey: true, bestScore: true },
  });

  const leaders = top.map((t, i) => ({
    rank: i + 1,
    name: t.name || "Anonymous",
    avatarKey: t.avatarKey,
    score: t.bestScore,
  }));

  // If signed in, also return the caller's personal best THIS SEASON.
  let you: { best: number } | null = null;
  const { userId } = await auth();
  if (userId) {
    const mine = await prisma.gameScore.findUnique({
      where: { clerkUserId_seasonStart: { clerkUserId: userId, seasonStart } },
      select: { bestScore: true },
    });
    if (mine) you = { best: mine.bestScore };
  }

  return NextResponse.json({ leaders, you, seasonEnd: seasonEnd.toISOString() });
}
