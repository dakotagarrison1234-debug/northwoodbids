import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg, isSuperAdmin } from "@/lib/auth";
import { getCreditBalance } from "@/lib/referral";

/**
 * POST /api/admin/referrals/adjust
 * Body: { clerkUserId: string; amount: number; reason?: string }
 *
 * Manually credits (+) or debits (-) a bidder's Bid Bucks by writing an
 * adjustment row to the ledger. Owner/Admin only. Used to correct issues.
 */
export async function POST(req: NextRequest) {
  const [membership, superAdmin] = await Promise.all([getUserOrg(), isSuperAdmin()]);
  const role = membership?.role;
  if (!superAdmin && role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clerkUserId, amount, reason } = await req.json();

  if (typeof clerkUserId !== "string" || !clerkUserId.trim()) {
    return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt === 0) {
    return NextResponse.json({ error: "Enter a non-zero dollar amount." }, { status: 400 });
  }
  // Sanity cap so a typo can't grant thousands of dollars.
  if (Math.abs(amt) > 1000) {
    return NextResponse.json({ error: "Amount must be within ±$1000." }, { status: 400 });
  }

  // Org scoping: a non-super-admin may only adjust a bidder who has actually
  // transacted with THEIR auction house (added a card or placed a bid here).
  // Without this, any org admin could mint Bid Bucks onto any platform account.
  if (!superAdmin) {
    const orgId = membership!.organizationId;
    const target = clerkUserId.trim();
    const [hasCard, hasBid] = await Promise.all([
      prisma.bidderStripeCustomer.findFirst({
        where: { clerkUserId: target, organizationId: orgId },
        select: { id: true },
      }),
      prisma.bid.findFirst({
        where: { clerkUserId: target, item: { organizationId: orgId } },
        select: { id: true },
      }),
    ]);
    if (!hasCard && !hasBid) {
      return NextResponse.json(
        { error: "That bidder isn't part of your auction house." },
        { status: 403 }
      );
    }
  }

  const cleanReason = (typeof reason === "string" && reason.trim()) || "manual adjustment";

  await prisma.creditLedger.create({
    data: {
      clerkUserId: clerkUserId.trim(),
      amount: Math.round(amt * 100) / 100,
      reason: `adjustment: ${cleanReason}`.slice(0, 180),
    },
  });

  const balance = await getCreditBalance(clerkUserId.trim());
  return NextResponse.json({ success: true, balance });
}
