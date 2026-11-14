import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg, isSuperAdmin } from "@/lib/auth";
import { getCreditBalance } from "@/lib/referral";
import { textBuyer } from "@/lib/shippingNotify";

/** GET ?clerkUserId= — one customer's Bid Bucks balance (Bidders page). Owner/Admin only. */
export async function GET(req: NextRequest) {
  const [membership, superAdmin] = await Promise.all([getUserOrg(), isSuperAdmin()]);
  const role = membership?.role;
  if (!superAdmin && role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("clerkUserId")?.trim();
  if (!id) return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
  return NextResponse.json({ balance: await getCreditBalance(id) });
}

/**
 * POST /api/admin/referrals/adjust
 * Body: { clerkUserId: string; amount: number; reason?: string; notify?: boolean }
 *   notify: text the customer that Bid Bucks were added (gifts only).
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

  const { clerkUserId, amount, reason, notify } = await req.json();

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
    const [hasCard, hasBid, homeHere] = await Promise.all([
      prisma.bidderStripeCustomer.findFirst({
        where: { clerkUserId: target, organizationId: orgId },
        select: { id: true },
      }),
      prisma.bid.findFirst({
        where: { clerkUserId: target, item: { organizationId: orgId } },
        select: { id: true },
      }),
      // Signed up and picked one of OUR pickup spots (new customers who haven't bid yet).
      prisma.bidderProfile.findFirst({
        where: { clerkUserId: target, preferredPickupLocationId: { not: null } },
        select: { preferredPickupLocationId: true },
      }).then(async (p) =>
        p?.preferredPickupLocationId
          ? prisma.pickupLocation.findFirst({ where: { id: p.preferredPickupLocationId, organizationId: orgId }, select: { id: true } })
          : null
      ),
    ]);
    if (!hasCard && !hasBid && !homeHere) {
      return NextResponse.json(
        { error: "That bidder isn't part of your auction house." },
        { status: 403 }
      );
    }
  }

  const cleanReason = (typeof reason === "string" && reason.trim()) || "manual adjustment";
  // Gifts come in whole $5 Bid Bucks — each order redeems one $5, so an odd
  // amount would strand change that can never be spent.
  if (cleanReason.startsWith("gift") && (amt <= 0 || Math.round(amt * 100) % 500 !== 0)) {
    return NextResponse.json({ error: "Bid Bucks gifts come in $5s." }, { status: 400 });
  }

  await prisma.creditLedger.create({
    data: {
      clerkUserId: clerkUserId.trim(),
      amount: Math.round(amt * 100) / 100,
      reason: `adjustment: ${cleanReason}`.slice(0, 180),
    },
  });

  const balance = await getCreditBalance(clerkUserId.trim());

  // Gift text: "You've got $10 in Bid Bucks". Only for additions, never blocks.
  let texted = false;
  if (notify === true && amt > 0) {
    const gift = Math.round(amt * 100) / 100;
    const fmt = (n: number) => `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
    texted = await textBuyer(
      clerkUserId.trim(),
      "bid_bucks_gift",
      `We added ${fmt(gift)} in Bid Bucks to your account${balance > gift ? ` (${fmt(balance)} total)` : ""}. $5 comes off each winning bill of $5 or more, automatically. northwoodbids.com`,
      { bidBucksAdded: gift, bidBucksBalance: balance },
    );
  }
  return NextResponse.json({ success: true, balance, texted });
}
