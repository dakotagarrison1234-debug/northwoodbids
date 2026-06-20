import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import Stripe from "stripe";
import { triggerAuctionUpdated } from "@/lib/pusherServer";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type ItemWithBidsAndOrg = {
  id: string;
  title: string;
  auctionId: string | null;
  reservePrice: Prisma.Decimal | null;
  bids: { id: string; clerkUserId: string; amount: Prisma.Decimal }[];
  auction: { id: string; title: string; organization: { name: string; slug: string } } | null;
};

type WinnerEntry = {
  clerkUserId: string;
  auctionName: string;
  orgName: string;
  items: { id: string; title: string; amount: number }[];
};

type OrgForCharging = {
  id: string;
  stripeAccountId: string | null;
  platformFeePercent: Prisma.Decimal;
  taxPercent: Prisma.Decimal;
  taxExempt: boolean;
};

/**
 * Closes a single item: marks winning bid WON + item SOLD (or UNSOLD), deactivates proxies.
 * Does NOT fire GHL notifications — callers collect winners and send one email per bidder.
 * Returns the winning bid info if there was one, null if unsold.
 */
async function closeItem(
  item: ItemWithBidsAndOrg
): Promise<{ clerkUserId: string; amount: number } | null> {
  // C3: Re-read the top bid fresh from DB to avoid stale pre-fetched value
  const freshTopBid = await prisma.bid.findFirst({
    where: { itemId: item.id, status: "ACTIVE" },
    orderBy: { amount: "desc" },
  });
  const winningBid = freshTopBid;

  // Reserve price enforcement: if the top bid is below the reserve, the item
  // does NOT sell. Mark UNSOLD, cancel the standing bid, deactivate proxies.
  if (
    winningBid &&
    item.reservePrice != null &&
    Number(winningBid.amount) < Number(item.reservePrice)
  ) {
    await prisma.$transaction([
      prisma.bid.update({ where: { id: winningBid.id }, data: { status: "CANCELLED" } }),
      prisma.item.update({ where: { id: item.id }, data: { status: "UNSOLD" } }),
      prisma.proxyBid.updateMany({ where: { itemId: item.id, isActive: true }, data: { isActive: false } }),
    ]);
    console.log(
      `closeItem: reserve not met for "${item.title}" (${item.id}) — top bid $${Number(winningBid.amount)} < reserve $${Number(item.reservePrice)}`
    );
    return null;
  }

  if (winningBid) {
    await prisma.$transaction([
      prisma.bid.update({ where: { id: winningBid.id }, data: { status: "WON" } }),
      prisma.item.update({ where: { id: item.id }, data: { status: "SOLD" } }),
      prisma.proxyBid.updateMany({ where: { itemId: item.id, isActive: true }, data: { isActive: false } }),
    ]);
    return { clerkUserId: winningBid.clerkUserId, amount: Number(winningBid.amount) };
  } else {
    await prisma.$transaction([
      prisma.item.update({ where: { id: item.id }, data: { status: "UNSOLD" } }),
      prisma.proxyBid.updateMany({ where: { itemId: item.id, isActive: true }, data: { isActive: false } }),
    ]);
    return null;
  }
}

/**
 * Auto-charges every winner in a closed auction exactly once.
 *
 * One PaymentIntent per winner per auction — covers all their won items.
 * Uses off_session: true so no 3DS prompt is required (the card was saved
 * with usage: "off_session" during setup).
 *
 * application_fee_amount = platform fee on bid amount (not including tax).
 * Tax = org.taxPercent of bid amount, added on top of the bid total.
 *
 * On success:  creates Payment records (status=PAID) + sets items to PENDING_PICKUP.
 * On failure:  creates Payment records (status=FAILED) + logs the reason.
 *              Winners will see a retry option on their dashboard.
 */
async function chargeWinners(
  winnerMap: Map<string, WinnerEntry>,
  org: OrgForCharging,
  auctionId: string
): Promise<void> {
  if (!org.stripeAccountId || winnerMap.size === 0) return;

  const platformFeePercent = Number(org.platformFeePercent);
  // If the org is tax-exempt, force tax to zero regardless of taxPercent.
  const taxPercent = org.taxExempt ? 0 : Number(org.taxPercent);

  for (const [clerkUserId, winner] of winnerMap) {
    const itemIds = winner.items.map((i) => i.id);

    // Look up the bidder's saved card on this connected account
    const bidderCustomer = await prisma.bidderStripeCustomer.findUnique({
      where: {
        clerkUserId_organizationId: {
          clerkUserId,
          organizationId: org.id,
        },
      },
    });

    // H7: Idempotency guard — skip if all items already have a payment for this user
    const paymentCount = await prisma.payment.count({ where: { itemId: { in: itemIds }, clerkUserId } });
    if (paymentCount >= itemIds.length) {
      console.log(`Auto-charge: payment already exists for items ${itemIds.join(",")} — skipping`);
      continue;
    }

    if (!bidderCustomer?.defaultPaymentMethodId) {
      // No card on file — mark all items as FAILED so bidder sees them on dashboard
      console.warn(`Auto-charge: no card on file for ${clerkUserId} in org ${org.id}`);
      const now = new Date();
      for (const item of winner.items) {
        await prisma.payment.create({
          data: {
            clerkUserId,
            itemId: item.id,
            amount: item.amount,
            status: "FAILED",
            autoChargeAttemptedAt: now,
            failureReason: "No payment card on file",
          },
        });
      }
      continue;
    }

    // Calculate totals (all in cents for Stripe)
    const totalBidAmount = winner.items.reduce((s, i) => s + i.amount, 0);
    // Tax only collected if org is not exempt (set at approval by ForPurpose).
    const taxAmountCents = Math.round(totalBidAmount * taxPercent / 100 * 100);
    const feeAmountCents = Math.round(totalBidAmount * platformFeePercent / 100 * 100);
    // Fee AND tax ADDED ON TOP of the bid — buyer pays bid + fee + tax.
    // ForPurpose holds fee + tax via application_fee_amount; org nets exactly the bid.
    const chargeAmountCents = Math.round(totalBidAmount * 100) + feeAmountCents + taxAmountCents;
    const appFeeAmountCents = feeAmountCents + taxAmountCents;

    const now = new Date();

    try {
      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: chargeAmountCents,
          currency: "usd",
          customer: bidderCustomer.stripeCustomerId,
          payment_method: bidderCustomer.defaultPaymentMethodId,
          off_session: true,
          confirm: true,
          application_fee_amount: appFeeAmountCents,
          metadata: {
            clerkUserId,
            orgId: org.id,
            auctionId,
            itemIds: itemIds.slice(0, 5).join(","), // Stripe metadata 500-char limit
          },
        },
        {
          stripeAccount: org.stripeAccountId,
          // Stable per winner per auction — a winner is only ever charged once.
          idempotencyKey: `autocharge-${auctionId}-${clerkUserId}`,
        }
      );

      // Charge succeeded — create PAID Payment records + move items to PENDING_PICKUP.
      // Distribute fee/tax across items in whole cents; any leftover cent goes to item 0
      // so the per-item rows sum back to the actual charged total.
      const n = winner.items.length;
      // Distribute fee only (not fee+tax) across per-item Payment rows.
      // applicationFeeAmount = fee portion; taxAmount = tax portion (recorded separately).
      const baseFeeCents = Math.floor(feeAmountCents / n);
      const feeRemainderCents = feeAmountCents - baseFeeCents * n;
      const baseTaxCents = Math.floor(taxAmountCents / n);
      const taxRemainderCents = taxAmountCents - baseTaxCents * n;

      for (let idx = 0; idx < winner.items.length; idx++) {
        const item = winner.items[idx];
        const itemFeeCents = baseFeeCents + (idx === 0 ? feeRemainderCents : 0);
        const itemTaxCents = baseTaxCents + (idx === 0 ? taxRemainderCents : 0);
        try {
          await prisma.payment.create({
            data: {
              clerkUserId,
              itemId: item.id,
              amount: item.amount,
              applicationFeeAmount: itemFeeCents / 100,
              taxAmount: itemTaxCents / 100,
              stripePaymentIntentId: paymentIntent.id,
              status: "PAID",
              autoChargeAttemptedAt: now,
            },
          });
        } catch (e) {
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
          // P2002 = a payment row for this item+user already exists; safe to ignore.
        }
        await prisma.item.update({
          where: { id: item.id },
          data: { status: "PENDING_PICKUP" },
        });
      }

      console.log(
        `Auto-charge: $${(chargeAmountCents / 100).toFixed(2)} charged to ${clerkUserId} ` +
          `(PI: ${paymentIntent.id})`
      );
    } catch (err: unknown) {
      // Charge failed — mark all items FAILED so bidder sees them on dashboard
      let failureReason = "Charge failed";
      if (
        typeof err === "object" &&
        err !== null &&
        "message" in err &&
        typeof (err as { message: unknown }).message === "string"
      ) {
        failureReason = (err as { message: string }).message;
      }
      console.error(`Auto-charge FAILED for ${clerkUserId}:`, failureReason);

      for (const item of winner.items) {
        try {
          await prisma.payment.create({
            data: {
              clerkUserId,
              itemId: item.id,
              amount: item.amount,
              status: "FAILED",
              autoChargeAttemptedAt: now,
              failureReason,
            },
          });
        } catch (p2002err) {
          if (!(p2002err instanceof Prisma.PrismaClientKnownRequestError && p2002err.code === "P2002")) throw p2002err;
          // P2002 = payment row already exists; safe to ignore.
        }
      }
    }
  }
}

/**
 * Fires one GHL "auction won" webhook per unique bidder.
 * Summarises all the items they won in that auction — no per-item spam.
 */
async function notifyWinners(winnerMap: Map<string, WinnerEntry>): Promise<void> {
  if (!process.env.GHL_AUCTION_WON_WEBHOOK || winnerMap.size === 0) return;

  const bidderIds = [...winnerMap.keys()];
  const profiles = await prisma.bidderProfile.findMany({
    where: { clerkUserId: { in: bidderIds } },
    select: { clerkUserId: true, email: true, phone: true, name: true },
  });
  const profileMap = new Map(profiles.map((p) => [p.clerkUserId, p]));

  for (const [clerkUserId, winner] of winnerMap) {
    const profile = profileMap.get(clerkUserId);
    const email = profile?.email ?? "";
    const phone = profile?.phone ?? "";
    const name = profile?.name ?? "Winner";
    const totalAmount = winner.items.reduce((s, i) => s + i.amount, 0);
    const itemCount = winner.items.length;
    const paymentUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`;

    fetch(process.env.GHL_AUCTION_WON_WEBHOOK!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // GHL contact lookup fields
        email,
        phone,
        name,
        firstName: name.split(" ")[0] || name,
        lastName: name.split(" ").slice(1).join(" ") || "",
        // Notification payload
        event: "auction_won",
        bidderEmail: email,
        bidderPhone: phone,
        bidderName: name,
        itemCount,
        totalAmount,
        auctionName: winner.auctionName,
        orgName: winner.orgName,
        paymentUrl,
      }),
    }).catch((err) => console.error("GHL won webhook failed:", err));
  }
}

/**
 * Fires GHL_AUCTION_STARTED_WEBHOOK once per org follower (bidder with preferredOrgId = org.id).
 * Each call includes the bidder's contact info so GHL can route the email to them.
 */
export async function notifyAuctionStartedToFollowers(
  auction: { title: string; slug: string },
  org: { id: string; name: string; slug: string }
): Promise<void> {
  if (!process.env.GHL_AUCTION_STARTED_WEBHOOK) return;

  const followers = await prisma.bidderProfile.findMany({
    where: { preferredOrgId: org.id },
    select: { clerkUserId: true, email: true, phone: true, name: true },
  });
  if (followers.length === 0) return;

  const auctionUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${org.slug}/${auction.slug}`;

  for (const follower of followers) {
    const email = follower.email ?? "";
    const phone = follower.phone ?? "";
    const name = follower.name ?? "Bidder";
    fetch(process.env.GHL_AUCTION_STARTED_WEBHOOK!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        phone,
        name,
        firstName: name.split(" ")[0] || name,
        lastName: name.split(" ").slice(1).join(" ") || "",
        event: "auction_started",
        bidderEmail: email,
        bidderPhone: phone,
        bidderName: name,
        auctionName: auction.title,
        auctionUrl,
        orgName: org.name,
      }),
    }).catch((err) => console.error("GHL auction-started webhook failed:", err));
  }
}

/**
 * Finds OPEN auctions closing within the next 60 minutes that haven't sent an
 * "ending soon" notification yet. Fires GHL_AUCTION_ENDING_WEBHOOK once per
 * active bidder, then stamps endingSoonNotifiedAt so it never fires again.
 */
export async function notifyAuctionEndingSoon(): Promise<{ notifiedAuctions: number }> {
  if (!process.env.GHL_AUCTION_ENDING_WEBHOOK) return { notifiedAuctions: 0 };

  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);

  const soonAuctions = await prisma.auction.findMany({
    where: {
      status: "OPEN",
      endAt: { gte: now, lte: inOneHour },
      endingSoonNotifiedAt: null,
    },
    include: { organization: { select: { id: true, name: true, slug: true } } },
  });

  let notifiedAuctions = 0;

  for (const auction of soonAuctions) {
    // Find all unique bidders currently winning items in this auction
    const activeBids = await prisma.bid.findMany({
      where: {
        item: { auctionId: auction.id, status: "ACTIVE" },
        status: "ACTIVE",
      },
      select: { clerkUserId: true },
      distinct: ["clerkUserId"],
    });

    if (activeBids.length > 0) {
      const bidderIds = activeBids.map((b) => b.clerkUserId);
      const profiles = await prisma.bidderProfile.findMany({
        where: { clerkUserId: { in: bidderIds } },
        select: { clerkUserId: true, email: true, phone: true, name: true },
      });
      const profileMap = new Map(profiles.map((p) => [p.clerkUserId, p]));

      const auctionUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${auction.organization.slug}/${auction.slug}`;

      for (const { clerkUserId } of activeBids) {
        const profile = profileMap.get(clerkUserId);
        const email = profile?.email ?? "";
        const phone = profile?.phone ?? "";
        const name = profile?.name ?? "Bidder";
        fetch(process.env.GHL_AUCTION_ENDING_WEBHOOK!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            phone,
            name,
            firstName: name.split(" ")[0] || name,
            lastName: name.split(" ").slice(1).join(" ") || "",
            event: "auction_ending_soon",
            bidderEmail: email,
            bidderPhone: phone,
            bidderName: name,
            auctionName: auction.title,
            auctionUrl,
            orgName: auction.organization.name,
            endsAt: auction.endAt.toISOString(),
          }),
        }).catch((err) => console.error("GHL auction-ending-soon webhook failed:", err));
      }
    }

    // Stamp so this auction never triggers again even if no active bidders
    await prisma.auction.update({
      where: { id: auction.id },
      data: { endingSoonNotifiedAt: now },
    });

    notifiedAuctions++;
  }

  return { notifiedAuctions };
}

/**
 * Find DRAFT auctions whose startAt has passed and open them,
 * activating all their DRAFT items in the same pass.
 */
export async function openScheduledAuctions(): Promise<{ openedAuctions: number }> {
  const now = new Date();

  const dueAuctions = await prisma.auction.findMany({
    where: { status: "DRAFT", startAt: { lte: now } },
    include: { organization: true },
  });

  let opened = 0;
  for (const auction of dueAuctions) {
    // Stripe gate — same rule as manual publish. An org that can't accept
    // payments must not have auctions auto-opened; the auction stays DRAFT
    // and will open on a later cron pass once Stripe charges are enabled.
    if (!auction.organization.stripeChargesEnabled) {
      console.warn(
        `[cron] Skipping auto-open of auction "${auction.title}" (${auction.id}) — org ${auction.organization.id} has not enabled Stripe charges`
      );
      continue;
    }
    opened++;
    await prisma.$transaction([
      prisma.auction.update({ where: { id: auction.id }, data: { status: "OPEN" } }),
      prisma.item.updateMany({ where: { auctionId: auction.id, status: "DRAFT" }, data: { status: "ACTIVE" } }),
    ]);

    notifyAuctionStartedToFollowers(
      { title: auction.title, slug: auction.slug },
      { id: auction.organization.id, name: auction.organization.name, slug: auction.organization.slug }
    ).catch((e) => console.error("GHL auction-started (cron) failed:", e));
  }

  // Also activate any DRAFT items that are already inside an OPEN auction
  await prisma.item.updateMany({
    where: { status: "DRAFT", auction: { status: "OPEN" } },
    data: { status: "ACTIVE" },
  });

  if (opened > 0) {
    triggerAuctionUpdated().catch(() => {});
  }

  return { openedAuctions: opened };
}

/**
 * Find and close all ACTIVE items whose effective end time has passed,
 * then close any OPEN auctions that have no remaining ACTIVE items.
 *
 * Auto-charges all winners when each auction fully closes.
 * GHL notifications fire AFTER charges are attempted.
 *
 * Called by the cron job every minute.
 */
export async function closeExpiredItems(): Promise<{ closedItems: number; closedAuctions: number }> {
  const now = new Date();

  // M4: Merge two item queries into one with OR condition
  const expiredItems = await prisma.item.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        {
          itemEndAt: { lte: now },
          auction: { status: { in: ["OPEN", "CLOSING"] } },
        },
        {
          itemEndAt: null,
          auction: { status: { in: ["OPEN", "CLOSING"] }, endAt: { lte: now } },
        },
      ],
    },
    include: {
      bids: { where: { status: "ACTIVE" }, orderBy: { amount: "desc" }, take: 1 },
      auction: { include: { organization: true } },
    },
  });

  for (const item of expiredItems) {
    await closeItem(item as ItemWithBidsAndOrg);
  }

  // Broadcast item-level closings immediately so live grids drop ended items
  // in real time (don't wait for the whole auction to close).
  if (expiredItems.length > 0) {
    const closedSlugs = [
      ...new Set(
        expiredItems
          .map((i) => i.auction?.organization?.slug)
          .filter(Boolean)
      ),
    ] as string[];
    for (const slug of closedSlugs) {
      await triggerAuctionUpdated(slug);
    }
  }

  // Close auctions with no remaining ACTIVE items
  const affectedAuctionIds = [
    ...new Set(expiredItems.map((i) => i.auctionId).filter(Boolean)),
  ] as string[];

  // Close auctions that now have no ACTIVE items — and notify winners at this point
  const auctionsToCheck = [
    ...new Set([
      ...affectedAuctionIds,
      // Also pick up auctions past endAt with no active items (edge case)
      ...(await prisma.auction.findMany({
        where: { status: { in: ["OPEN", "CLOSING"] }, endAt: { lte: now }, items: { none: { status: "ACTIVE" } } },
        select: { id: true },
      })).map((a) => a.id),
    ]),
  ];

  let closedAuctions = 0;
  for (const auctionId of auctionsToCheck) {
    const remaining = await prisma.item.count({ where: { auctionId, status: "ACTIVE" } });
    if (remaining > 0) continue; // still items running (popcorn extension still live)

    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            stripeAccountId: true,
            platformFeePercent: true,
            taxPercent: true,
            taxExempt: true,
          },
        },
      },
    });
    if (!auction || (auction.status !== "OPEN" && auction.status !== "CLOSING")) continue;

    // C1: Atomic close — prevent cron+manual double-close
    const closed = await prisma.auction.updateMany({
      where: { id: auctionId, status: { in: ["OPEN", "CLOSING"] } },
      data: { status: "CLOSED" },
    });
    if (closed.count === 0) continue; // already closed by another process
    closedAuctions++;

    // Build winner map from WON bids
    const wonBids = await prisma.bid.findMany({
      where: { item: { auctionId }, status: "WON" },
      include: { item: { select: { id: true, title: true } } },
    });
    const winnerMap = new Map<string, WinnerEntry>();
    for (const bid of wonBids) {
      if (!winnerMap.has(bid.clerkUserId)) {
        winnerMap.set(bid.clerkUserId, {
          clerkUserId: bid.clerkUserId,
          auctionName: auction.title,
          orgName: auction.organization.name,
          items: [],
        });
      }
      winnerMap.get(bid.clerkUserId)!.items.push({
        id: bid.item.id,
        title: bid.item.title,
        amount: Number(bid.amount),
      });
    }

    // Auto-charge winners BEFORE sending GHL notifications
    await chargeWinners(winnerMap, auction.organization, auctionId);
    await notifyWinners(winnerMap);
    triggerAuctionUpdated(auction.organization.slug).catch(() => {});
  }

  return { closedItems: expiredItems.length, closedAuctions };
}

/**
 * Manually close a specific auction (used by the admin "Close Auction" button).
 * Auto-charges all winners and sends ONE "you won" email per bidder.
 */
export async function closeAuction(auctionId: string): Promise<{ winnersCount: number }> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          stripeAccountId: true,
          platformFeePercent: true,
          taxPercent: true,
          taxExempt: true,
        },
      },
      items: {
        where: { status: "ACTIVE" },
        include: {
          bids: { where: { status: "ACTIVE" }, orderBy: { amount: "desc" }, take: 1 },
        },
      },
    },
  });

  if (!auction) throw new Error(`Auction ${auctionId} not found`);

  // C1/H2/H5: Guard against double-close
  if (auction.status === "CLOSED" || auction.status === "SETTLED") {
    throw new Error("Auction is already closed");
  }

  // Atomically claim the auction before processing items
  const claimed = await prisma.auction.updateMany({
    where: { id: auctionId, status: { in: ["OPEN", "CLOSING"] } },
    data: { status: "CLOSED" },
  });
  if (claimed.count === 0) throw new Error("Auction already closed by another process");

  const winnerMap = new Map<string, WinnerEntry>();

  for (const item of auction.items) {
    const result = await closeItem({
      ...item,
      auction: { id: auction.id, title: auction.title, organization: auction.organization },
    });
    if (result) {
      const key = result.clerkUserId;
      if (!winnerMap.has(key)) {
        winnerMap.set(key, {
          clerkUserId: result.clerkUserId,
          auctionName: auction.title,
          orgName: auction.organization.name,
          items: [],
        });
      }
      winnerMap.get(key)!.items.push({ id: item.id, title: item.title, amount: result.amount });
    }
  }

  // Auto-charge winners BEFORE sending GHL notifications
  await chargeWinners(winnerMap, auction.organization, auctionId);
  await notifyWinners(winnerMap);
  triggerAuctionUpdated(auction.organization.slug).catch(() => {});

  return { winnersCount: winnerMap.size };
}
