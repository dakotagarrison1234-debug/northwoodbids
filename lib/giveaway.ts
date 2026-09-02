import { prisma } from "@/lib/prisma";
import { autoAttachPaidItems } from "@/lib/pickup";

export type Entrant = { clerkUserId: string; name: string };

/**
 * The current pool of names eligible to win a giveaway (already-won bidders removed).
 *
 *  - NONE:        every registered bidder, minus anyone the admin pulled (removed) and
 *                 minus prior winners. New signups appear automatically — the pool is
 *                 computed live from BidderProfile, never a frozen snapshot.
 *  - INFO/ANSWER: only bidders who submitted an accepted entry (a GiveawayEntry row is
 *                 created only on an accepted submission) plus admin-added names, minus
 *                 removed and prior winners.
 */
export async function getEligibleEntrants(giveawayId: string): Promise<Entrant[]> {
  const g = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    select: { requirement: true },
  });
  if (!g) return [];

  const entries = await prisma.giveawayEntry.findMany({
    where: { giveawayId },
    select: { clerkUserId: true, removed: true, won: true },
  });
  const byUser = new Map(entries.map((e) => [e.clerkUserId, e]));

  if (g.requirement === "NONE") {
    const profiles = await prisma.bidderProfile.findMany({ select: { clerkUserId: true, name: true } });
    return profiles
      .filter((p) => {
        const e = byUser.get(p.clerkUserId);
        return !e?.removed && !e?.won;
      })
      .map((p) => ({ clerkUserId: p.clerkUserId, name: p.name || "Bidder" }));
  }

  // INFO / ANSWER: entry rows ARE the pool (accepted submissions + manual adds).
  const ids = entries.filter((e) => !e.removed && !e.won).map((e) => e.clerkUserId);
  if (ids.length === 0) return [];
  const profiles = await prisma.bidderProfile.findMany({
    where: { clerkUserId: { in: ids } },
    select: { clerkUserId: true, name: true },
  });
  const nameById = new Map(profiles.map((p) => [p.clerkUserId, p.name || "Bidder"]));
  return ids.map((id) => ({ clerkUserId: id, name: nameById.get(id) || "Bidder" }));
}

/**
 * Award a giveaway prize to a winner, recorded so every downstream system — pickups,
 * transfers, the bidder's dashboard — treats it EXACTLY like an auction win:
 *   - a WON Bid (amount $0) so the pickup engine (which keys off WON bids) picks it up,
 *   - a comped $0 PAID Payment so it reads as paid and stays out of sales revenue
 *     (no Stripe fee, no tax — it was free), and
 *   - item → PENDING_PICKUP with its source location snapshotted, then auto-attached
 *     to the winner's pickup/transfer flow.
 *
 * Idempotent: a prize already awarded (has a WON bid) is left untouched.
 */
export async function awardGiveawayItem(clerkUserId: string, itemId: string): Promise<void> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { id: true, organizationId: true, locationId: true },
  });
  if (!item) throw new Error("Prize item not found");

  const already = await prisma.bid.findFirst({ where: { itemId, status: "WON" }, select: { id: true } });
  if (already) return; // already awarded

  const now = new Date();
  await prisma.$transaction([
    prisma.bid.create({ data: { itemId, clerkUserId, amount: 0, status: "WON", isProxy: false } }),
    prisma.payment.upsert({
      where: { itemId_clerkUserId: { itemId, clerkUserId } },
      update: {
        status: "PAID",
        comped: true,
        amount: 0,
        applicationFeeAmount: 0,
        taxAmount: 0,
        autoChargeAttemptedAt: now,
        failureReason: null,
      },
      create: {
        clerkUserId,
        itemId,
        amount: 0,
        applicationFeeAmount: 0,
        taxAmount: 0,
        status: "PAID",
        comped: true,
        autoChargeAttemptedAt: now,
      },
    }),
    prisma.item.update({
      where: { id: itemId },
      data: { status: "PENDING_PICKUP", soldLocationId: item.locationId },
    }),
  ]);

  // Fold the prize into the winner's pickup appointment / preferred-location transfer.
  await autoAttachPaidItems(clerkUserId, item.organizationId, { notifyTeam: false });
}
