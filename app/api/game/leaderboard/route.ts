import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Public global leaderboard for the auction game (top 10 best scores).
export async function GET() {
  const top = await prisma.gameScore.findMany({
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

  // If signed in, also return the caller's personal best.
  let you: { best: number } | null = null;
  const { userId } = await auth();
  if (userId) {
    const mine = await prisma.gameScore.findUnique({
      where: { clerkUserId: userId },
      select: { bestScore: true },
    });
    if (mine) you = { best: mine.bestScore };
  }

  return NextResponse.json({ leaders, you });
}
