export const dynamic = "force-dynamic";
export const maxDuration = 120;
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getUserOrg, isSuperAdmin } from "@/lib/auth";
import { textBuyer } from "@/lib/shippingNotify";

/**
 * POST /api/admin/referrals/nudge — { clerkUserIds: string[]; message?: string }
 *   message: the text to send (optional; the default below is used when blank).
 *   "Northwood Bids:" is put in front automatically.
 *
 * "Send $5 to people who haven't bid" (Bidder report). Each person gets ONE $5
 * Bid Buck and a text inviting them to bid. Owner/Admin only.
 *
 * Re-checked on the server for every person, whatever the page sent:
 *   - skipped if blocked, on the team, if they've placed a bid since, or if they
 *     already got a nudge (so sending twice never double-gives — enforced by a
 *     unique key in the database, not just this check);
 *   - the text only goes to people with a phone (the $5 is added either way).
 * Single-business site: every signed-up profile is one of our bidders (the
 * report's universe), so no per-org bid/card check here.
 */
const NUDGE_REASON = "adjustment: gift: bid nudge";
const NUDGE_AMOUNT = 5;

export async function POST(req: NextRequest) {
  const [membership, superAdmin] = await Promise.all([getUserOrg(), isSuperAdmin()]);
  const role = membership?.role;
  if (!superAdmin && role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Owner or admin only" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.clerkUserIds)
    ? [...new Set((body.clerkUserIds as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()))]
    : [];
  if (ids.length === 0) return NextResponse.json({ error: "Pick at least one person." }, { status: 400 });
  if (ids.length > 500) return NextResponse.json({ error: "Send to 500 or fewer at a time." }, { status: 400 });

  const [profiles, bidders, already, team] = await Promise.all([
    prisma.bidderProfile.findMany({ where: { clerkUserId: { in: ids } }, select: { clerkUserId: true, blocked: true, phone: true } }),
    prisma.bid.groupBy({ by: ["clerkUserId"], where: { clerkUserId: { in: ids } } }),
    prisma.creditLedger.findMany({ where: { clerkUserId: { in: ids }, reason: NUDGE_REASON }, select: { clerkUserId: true } }),
    prisma.orgMember.findMany({ where: { clerkUserId: { in: ids } }, select: { clerkUserId: true } }),
  ]);
  const hasBid = new Set(bidders.map((b) => b.clerkUserId));
  const nudged = new Set(already.map((a) => a.clerkUserId));
  const isTeam = new Set(team.map((t) => t.clerkUserId));
  const eligible = profiles.filter(
    (p) => !p.blocked && !hasBid.has(p.clerkUserId) && !nudged.has(p.clerkUserId) && !isTeam.has(p.clerkUserId)
  );

  // One row per person, guaranteed by the database: redemptionKey is unique, so
  // two admins sending at the same moment can't both give the same person $5.
  // (Positive rows with a "nudge:" key are never touched by the redeem/release code.)
  const given: typeof eligible = [];
  for (const p of eligible) {
    try {
      await prisma.creditLedger.create({
        data: { clerkUserId: p.clerkUserId, amount: NUDGE_AMOUNT, reason: NUDGE_REASON, redemptionKey: `nudge:${p.clerkUserId}` },
      });
      given.push(p);
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  const skipped = ids.length - given.length;
  if (given.length === 0) {
    return NextResponse.json({ success: true, given: 0, texted: 0, skipped });
  }

  // Texts, five at a time so a big batch doesn't hammer the SMS webhook.
  // Bid Bucks only come off winning bills of $5+ (lib/referral.ts), so say so.
  const custom = typeof body.message === "string" ? body.message.replace(/\s+/g, " ").trim() : "";
  const msg = custom
    ? custom.replace(/^northwood bids:\s*/i, "").slice(0, 320)
    : `Here's $${NUDGE_AMOUNT} in Bid Bucks to get you started! Place your first bid at northwoodbids.com. ` +
      `It comes off your first winning bill of $5 or more, automatically.`;
  let texted = 0;
  const withPhone = given.filter((p) => !!p.phone);
  for (let i = 0; i < withPhone.length; i += 5) {
    const batch = withPhone.slice(i, i + 5);
    const sent = await Promise.all(
      batch.map((p) => textBuyer(p.clerkUserId, "bid_bucks_gift", msg, { bidBucksAdded: NUDGE_AMOUNT, nudge: true }).catch(() => false))
    );
    texted += sent.filter(Boolean).length;
  }

  console.info(`[nudge] $${NUDGE_AMOUNT} to ${given.length} non-bidders (${texted} texted, ${skipped} skipped)`);
  return NextResponse.json({ success: true, given: given.length, texted, skipped });
}
