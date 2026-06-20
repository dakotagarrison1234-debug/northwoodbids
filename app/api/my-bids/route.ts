export const dynamic = "force-dynamic";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile, allBids] = await Promise.all([
    prisma.bidderProfile.findUnique({
      where: { clerkUserId: userId },
      include: { preferredOrg: { select: { id: true, name: true, slug: true, logoUrl: true } } },
    }),
    prisma.bid.findMany({
      where: { clerkUserId: userId },
      include: {
        item: {
          include: {
            photos: { where: { isPrimary: true }, take: 1 },
            auction: { include: { organization: { select: { name: true, slug: true, id: true, stripeAccountId: true, platformFeePercent: true, taxPercent: true, taxExempt: true } } } },
          },
        },
      },
      orderBy: { placedAt: "desc" },
      take: 200,
    }),
  ]);

  // One entry per item — most recent bid (desc order guarantees this)
  const seen = new Set<string>();
  const latestBids: typeof allBids = [];
  for (const bid of allBids) {
    if (!seen.has(bid.itemId)) {
      seen.add(bid.itemId);
      latestBids.push(bid);
    }
  }

  // Fetch payment records for all won items — this is the authoritative paid/unpaid source.
  // Do NOT rely on item.status (PENDING_PICKUP) to infer payment; admins can stage items
  // for pickup before payment is received, which would incorrectly hide unpaid wins.
  const wonItemIds = latestBids
    .filter((b) => b.status === "WON")
    .map((b) => b.itemId);

  const payments = wonItemIds.length
    ? await prisma.payment.findMany({
        where: { itemId: { in: wonItemIds }, clerkUserId: userId },
        select: { itemId: true, status: true },
      })
    : [];

  const paidItemIds = new Set(
    payments.filter((p) => p.status === "PAID").map((p) => p.itemId)
  );
  const failedItemIds = new Set(
    payments.filter((p) => p.status === "FAILED").map((p) => p.itemId)
  );

  const winning = [];    // Active bids I'm currently leading in an open auction
  const losing = [];     // Bids I've been outbid on in a still-open auction
  const past = [];       // Completed items I won (paid) or lost
  const unpaidWins = []; // Items I won but haven't paid yet (including failed charges)

  for (const bid of latestBids) {
    const item = bid.item;
    const auction = item.auction;
    if (!auction) continue;

    const photo = item.photos[0]?.url ?? null;
    const base = {
      itemId: item.id,
      itemTitle: item.title,
      itemStatus: item.status,
      storageLocation: item.storageLocation ?? null,
      photo,
      auctionTitle: auction.title,
      auctionSlug: auction.slug,
      auctionEndAt: auction.endAt,
      auctionStatus: auction.status,
      orgName: auction.organization.name,
      orgSlug: auction.organization.slug,
    };

    const itemActive  = item.status === "ACTIVE";
    const itemSold    = item.status === "SOLD";
    const itemPickup  = item.status === "PENDING_PICKUP";
    const itemDone    = item.status === "PICKED_UP";
    const itemUnsold  = item.status === "UNSOLD";
    const auctionOpen = auction.status === "OPEN" || auction.status === "CLOSING";

    // ── ACTIVE: item is live and auction is open ──────────────────────────────
    if (itemActive && auctionOpen) {
      if (bid.status === "ACTIVE") {
        winning.push({
          ...base,
          myBid: Number(bid.amount),
          currentBid: Number(item.currentBid),
          itemEndAt: item.itemEndAt,
        });
      } else if (bid.status === "OUTBID") {
        losing.push({
          ...base,
          myBid: Number(bid.amount),
          currentBid: Number(item.currentBid),
          itemEndAt: item.itemEndAt,
        });
      }
      continue;
    }

    // ── SOLD / WON: item has closed with a winner ─────────────────────────────
    if (itemSold || itemPickup || itemDone) {
      if (bid.status === "WON") {
        const isPaid = paidItemIds.has(item.id);

        if (!isPaid && !itemDone) {
          // No confirmed payment — still owed (includes failed auto-charge)
          unpaidWins.push({
            ...base,
            amountOwed: Number(item.currentBid),
            // Fee/tax disclosure — same cent math as the auto-charge in chargeWinners
            ...(() => {
              const bidCents = Math.round(Number(item.currentBid) * 100);
              const feePercent = Number(auction.organization.platformFeePercent);
              const taxPercent = auction.organization.taxExempt ? 0 : Number(auction.organization.taxPercent);
              const feeCents = Math.round(Number(item.currentBid) * feePercent / 100 * 100);
              const taxCents = Math.round(Number(item.currentBid) * taxPercent / 100 * 100);
              return {
                feePercent,
                taxPercent,
                feeAmount: feeCents / 100,
                taxAmount: taxCents / 100,
                totalDue: (bidCents + feeCents + taxCents) / 100,
              };
            })(),
            paymentFailed: failedItemIds.has(item.id),
            orgId: auction.organization.id,
            orgStripeAccountId: auction.organization.stripeAccountId,
          });
        } else {
          // Confirmed paid (Payment.status = PAID) or already picked up
          past.push({
            ...base,
            myBid: Number(bid.amount),
            finalBid: Number(item.currentBid),
            outcome: "won" as const,
            paid: true,
            pickedUp: itemDone,
          });
        }
      } else {
        // I placed a bid but didn't win this item
        past.push({
          ...base,
          myBid: Number(bid.amount),
          finalBid: Number(item.currentBid),
          outcome: "lost" as const,
          paid: false,
        });
      }
      continue;
    }

    // ── UNSOLD: item closed with no bids or reserve not met ───────────────────
    if (itemUnsold) {
      past.push({
        ...base,
        myBid: Number(bid.amount),
        finalBid: Number(item.currentBid),
        outcome: "unsold" as const,
        paid: false,
      });
      continue;
    }

    // ── CATCH-ALL: auction is closed/settled but item status wasn't caught above
    if (auction.status === "CLOSED" || auction.status === "SETTLED") {
      if (bid.status === "WON") {
        const isPaid = paidItemIds.has(item.id);
        if (!isPaid) {
          unpaidWins.push({
            ...base,
            amountOwed: Number(item.currentBid),
            // Fee/tax disclosure — same cent math as the auto-charge in chargeWinners
            ...(() => {
              const bidCents = Math.round(Number(item.currentBid) * 100);
              const feePercent = Number(auction.organization.platformFeePercent);
              const taxPercent = auction.organization.taxExempt ? 0 : Number(auction.organization.taxPercent);
              const feeCents = Math.round(Number(item.currentBid) * feePercent / 100 * 100);
              const taxCents = Math.round(Number(item.currentBid) * taxPercent / 100 * 100);
              return {
                feePercent,
                taxPercent,
                feeAmount: feeCents / 100,
                taxAmount: taxCents / 100,
                totalDue: (bidCents + feeCents + taxCents) / 100,
              };
            })(),
            paymentFailed: failedItemIds.has(item.id),
            orgId: auction.organization.id,
            orgStripeAccountId: auction.organization.stripeAccountId,
          });
        } else {
          past.push({
            ...base,
            myBid: Number(bid.amount),
            finalBid: Number(item.currentBid),
            outcome: "won" as const,
            paid: true,
            pickedUp: false,
          });
        }
      } else {
        past.push({
          ...base,
          myBid: Number(bid.amount),
          finalBid: Number(item.currentBid),
          outcome: "lost" as const,
          paid: false,
        });
      }
    }
  }

  return NextResponse.json({ profile, winning, losing, past, unpaidWins });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[my-bids GET]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
