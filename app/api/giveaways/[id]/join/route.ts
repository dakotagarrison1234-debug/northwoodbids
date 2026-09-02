export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/giveaways/[id]/join   Body: { answer }
 *
 * Enter a requirement-gated giveaway. For INFO any non-empty answer is accepted; for
 * ANSWER it must match the expected answer (case-insensitive, trimmed). NONE giveaways
 * need no join — everyone's already in — so this rejects them. Creating the entry row
 * IS the entry (the eligible pool for INFO/ANSWER is exactly the accepted rows).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Please sign in to enter." }, { status: 401 });
  const { id } = await params;

  const g = await prisma.giveaway.findUnique({
    where: { id },
    select: { id: true, status: true, requirement: true, requirementAnswer: true },
  });
  if (!g || g.status !== "ACTIVE") return NextResponse.json({ error: "This giveaway isn't open." }, { status: 404 });
  if (g.requirement === "NONE") {
    return NextResponse.json({ error: "You're already entered — no answer needed." }, { status: 400 });
  }

  // Must have a bidder profile so a win can flow into their orders.
  const profile = await prisma.bidderProfile.findUnique({ where: { clerkUserId: userId }, select: { clerkUserId: true } });
  if (!profile) return NextResponse.json({ error: "Finish setting up your account first." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const answer = String(body.answer ?? "").trim();
  if (!answer) return NextResponse.json({ error: "Please fill this in to enter." }, { status: 400 });

  if (g.requirement === "ANSWER") {
    const expected = (g.requirementAnswer ?? "").trim().toLowerCase();
    if (answer.toLowerCase() !== expected) {
      return NextResponse.json({ error: "That's not the right answer — give it another try." }, { status: 422 });
    }
  }

  await prisma.giveawayEntry.upsert({
    where: { giveawayId_clerkUserId: { giveawayId: id, clerkUserId: userId } },
    update: { answer: answer.slice(0, 300), removed: false },
    create: { giveawayId: id, clerkUserId: userId, answer: answer.slice(0, 300) },
  });

  return NextResponse.json({ success: true, entered: true });
}
