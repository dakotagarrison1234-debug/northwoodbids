export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { eligibility, sweepEndedGiveaways, windowOpen } from "@/lib/giveaway";

// Brake on answer guessing: a handful of tries per person per giveaway, per 10 min.
const ATTEMPTS = new Map<string, { n: number; resetAt: number }>();
const MAX_TRIES = 6;
const WINDOW_MS = 10 * 60_000;
function tooMany(key: string): boolean {
  const now = Date.now();
  const cur = ATTEMPTS.get(key);
  if (!cur || cur.resetAt < now) { ATTEMPTS.set(key, { n: 1, resetAt: now + WINDOW_MS }); return false; }
  cur.n += 1;
  return cur.n > MAX_TRIES;
}

/**
 * POST /api/giveaways/[id]/join   Body: { answer? }
 *
 * Take a ticket in a tap-to-enter giveaway. With a question attached: INFO accepts any
 * non-empty answer; ANSWER must match (case-insensitive, trimmed). AUTO giveaways need
 * no join (everyone's in) and BID giveaways are entered by bidding, so both reject.
 * Creating the entry row IS the ticket.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Please sign in to enter." }, { status: 401 });
  const { id } = await params;

  await sweepEndedGiveaways();
  const g = await prisma.giveaway.findUnique({ where: { id } });
  if (!g || g.status !== "ACTIVE") return NextResponse.json({ error: "This giveaway isn't open." }, { status: 404 });
  if (!windowOpen(g)) {
    return NextResponse.json({ error: g.startsAt && g.startsAt > new Date() ? "Entries open soon — check back." : "Entries have closed." }, { status: 409 });
  }
  if (g.entryMode === "AUTO") return NextResponse.json({ error: "You're already entered — no tap needed." }, { status: 400 });
  if (g.entryMode === "BID") return NextResponse.json({ error: "Every bid you place is a ticket — go bid!" }, { status: 400 });

  // Same bar as bidding: real profile, not blocked, card on file, not a duplicate
  // account. Tickets for ineligible accounts would never be drawable anyway.
  const elig = await eligibility(g.organizationId, { requireCard: g.requireCard });
  if (!elig.ok.has(userId)) {
    const why = elig.ineligible.get(userId) ?? (elig.name.has(userId) ? undefined : "incomplete");
    const msg =
      why === "no_card" ? "This one's for bidders with a card on file — add one to your account to enter."
      : why === "incomplete" ? "Finish setting up your account (phone + email) to enter."
      : why === "duplicate" ? "Looks like you already have an account with this phone number — use that one."
      : "This account can't enter giveaways.";
    return NextResponse.json({ error: msg, reason: why ?? "ineligible" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const answer = String(body.answer ?? "").trim();

  if (g.requirement !== "NONE") {
    if (!answer) return NextResponse.json({ error: "Please fill this in to enter." }, { status: 400 });
    if (g.requirement === "ANSWER") {
      if (tooMany(`${id}:${userId}`)) {
        return NextResponse.json({ error: "Too many guesses — try again in a few minutes." }, { status: 429 });
      }
      const expected = (g.requirementAnswer ?? "").trim().toLowerCase();
      if (answer.toLowerCase() !== expected) {
        return NextResponse.json({ error: "That's not the right answer — give it another try." }, { status: 422 });
      }
    }
  }

  // Someone the admin pulled stays pulled — tapping again doesn't sneak them back in.
  const existing = await prisma.giveawayEntry.findUnique({
    where: { giveawayId_clerkUserId: { giveawayId: id, clerkUserId: userId } },
    select: { removed: true },
  });
  if (existing?.removed) return NextResponse.json({ error: "You're not eligible for this one." }, { status: 403 });

  await prisma.giveawayEntry.upsert({
    where: { giveawayId_clerkUserId: { giveawayId: id, clerkUserId: userId } },
    update: { answer: answer ? answer.slice(0, 300) : undefined },
    create: { giveawayId: id, clerkUserId: userId, answer: answer ? answer.slice(0, 300) : null },
  });

  return NextResponse.json({ success: true, entered: true, tickets: 1 });
}
