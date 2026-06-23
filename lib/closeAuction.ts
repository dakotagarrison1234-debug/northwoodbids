import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import Stripe from "stripe";
import { triggerAuctionUpdated } from "@/lib/pusherServer";
import { autoAttachPaidItems } from "@/lib/pickup";
import { notifyPaymentFailed, notifyPaymentReceipt } from "@/lib/paymentNotify";
import {
  reserveReferralCredit,
  releaseReferralCredit,
  vestReferralForPayer,
} from "@/lib/referral";

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
 * Runs `worker` over `items` with bounded concurrency (default 5) using a simple
 * dependency-free Promise pool — process in chunks so a large auction doesn't
 * fan out unbounded fetches/charges, but still parallelizes within each chunk.
 */
async function runPooled<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency = 5
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    await Promise.all(chunk.map(worker));
  }
}

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
      // Terminalize every other standing bid so no one is left showing "active/winning".
      prisma.bid.updateMany({
        where: { itemId: item.id, status: "ACTIVE", id: { not: winningBid.id } },
        data: { status: "OUTBID" },
      }),
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
      // Terminalize every losing standing bid so dashboards don't show stale "winning".
      prisma.bid.updateMany({
        where: { itemId: item.id, status: "ACTIVE", id: { not: winningBid.id } },
        data: { status: "OUTBID" },
      }),
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
  if (winnerMap.size === 0) return;

  // Bound concurrency: charge winners in chunks of 5 instead of fully serial so
  // a large auction can't time out the cron, but Stripe isn't hit unbounded.
  await runPooled(
    [...winnerMap.values()],
    (winner) => chargeOneWinner(winner, org, auctionId),
    5
  );
}

/**
 * Charges a single winner for all their won items in one PaymentIntent.
 *
 * Branches on the resulting PaymentIntent status:
 *   - "succeeded":   Payment rows PAID + items -> PENDING_PICKUP (in one tx).
 *   - "processing":  Payment rows PENDING; items stay SOLD (webhook reconciles).
 *   - anything else (requires_action / requires_payment_method /
 *                    requires_confirmation / ...): Payment rows FAILED with
 *                    failureReason = the status; items stay SOLD.
 * A thrown Stripe error is also recorded as FAILED.
 *
 * Idempotent: skips winners whose items already have a PAID/PENDING row, ignores
 * P2002 on inserts, and uses a stable per-winner idempotency key.
 */
async function chargeOneWinner(
  winner: WinnerEntry,
  org: OrgForCharging,
  auctionId: string
): Promise<void> {
  const platformFeePercent = Number(org.platformFeePercent);
  // If the org is tax-exempt, force tax to zero regardless of taxPercent.
  const taxPercent = org.taxExempt ? 0 : Number(org.taxPercent);

  const clerkUserId = winner.clerkUserId;
  const itemIds = winner.items.map((i) => i.id);

  // Look up the bidder's saved card on the platform account
  const bidderCustomer = await prisma.bidderStripeCustomer.findUnique({
    where: {
      clerkUserId_organizationId: {
        clerkUserId,
        organizationId: org.id,
      },
    },
  });

  // H7: Idempotency guard — skip if every item already has a non-FAILED payment
  // (PAID or PENDING). FAILED rows should be re-attempted, so they don't count.
  const settledCount = await prisma.payment.count({
    where: { itemId: { in: itemIds }, clerkUserId, status: { in: ["PAID", "PENDING"] } },
  });
  if (settledCount >= itemIds.length) {
    console.log(`Auto-charge: payment already settled for items ${itemIds.join(",")} — skipping`);
    return;
  }

  const now = new Date();

  if (!bidderCustomer?.defaultPaymentMethodId) {
    // No card on file — mark all items as FAILED so bidder sees them on dashboard
    console.warn(`Auto-charge: no card on file for ${clerkUserId} in org ${org.id}`);
    await recordWinnerStatus(winner, "FAILED", now, { failureReason: "No payment card on file" });
    notifyPaymentFailed({
      clerkUserId,
      itemCount: itemIds.length,
      reason: "No payment card on file",
    }).catch((e) => console.error("notifyPaymentFailed (no card) failed:", e));
    return;
  }

  // Calculate totals (all in cents for Stripe)
  const totalBidAmount = winner.items.reduce((s, i) => s + i.amount, 0);
  // Buyer's premium added on top of the bid.
  const feeAmountCents = Math.round(totalBidAmount * platformFeePercent / 100 * 100);
  // Tax applies to the full purchase (bid + buyer's premium). Zero if exempt.
  const taxAmountCents = Math.round((totalBidAmount * 100 + feeAmountCents) * taxPercent / 100);
  // Fee AND tax ADDED ON TOP of the bid — buyer pays bid + fee + tax.
  const chargeAmountCents = Math.round(totalBidAmount * 100) + feeAmountCents + taxAmountCents;

  // ── Bid Bucks: auto-apply one $5 referral credit to bills of $5.00+ ─────────
  // Reserves (spends) the credit up front; we release it again if the charge
  // ultimately fails. Keyed to the per-winner idempotency key so a re-charge of
  // the same bill reuses the same reservation instead of double-spending.
  const redemptionKey = `autocharge-${auctionId}-${clerkUserId}`;
  const discountCents = await reserveReferralCredit(clerkUserId, chargeAmountCents, redemptionKey);
  const netChargeCents = chargeAmountCents - discountCents;

  // Bill fully covered by Bid Bucks — no card charge needed at all.
  if (discountCents > 0 && netChargeCents <= 0) {
    await recordWinnerStatus(winner, "PAID", now, {
      feeAmountCents,
      taxAmountCents,
      creditAppliedCents: discountCents,
      moveItemsToPendingPickup: true,
    });
    await autoAttachPaidItems(clerkUserId, org.id);
    // NOTE: vesting the inviter's reward is deliberately done AFTER the whole
    // charge pass (see vestWinners), so credit earned in an auction is never
    // spent on that same auction's bill — it always lands on the NEXT bill.
    console.log(
      `Auto-charge: $${(chargeAmountCents / 100).toFixed(2)} fully covered by Bid Bucks for ${clerkUserId}`
    );
    return;
  }

  let paymentIntent: Stripe.PaymentIntent;
  try {
    // Direct charge on the platform Stripe account (no Connect, no application fee).
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: netChargeCents,
        currency: "usd",
        customer: bidderCustomer.stripeCustomerId,
        payment_method: bidderCustomer.defaultPaymentMethodId,
        off_session: true,
        confirm: true,
        metadata: {
          clerkUserId,
          orgId: org.id,
          auctionId,
          itemIds: itemIds.slice(0, 5).join(","), // Stripe metadata 500-char limit
          creditAppliedCents: String(discountCents),
        },
      },
      {
        // Stable per winner per auction — a winner is only ever charged once.
        idempotencyKey: redemptionKey,
      }
    );
  } catch (err: unknown) {
    // Charge threw — give the reserved Bid Bucks back before recording FAILED.
    if (discountCents > 0) await releaseReferralCredit(redemptionKey);
    // Charge threw — mark all items FAILED so bidder sees them on dashboard
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
    await recordWinnerStatus(winner, "FAILED", now, { failureReason });
    notifyPaymentFailed({
      clerkUserId,
      itemCount: itemIds.length,
      reason: failureReason,
    }).catch((e) => console.error("notifyPaymentFailed (decline) failed:", e));
    return;
  }

  // BRANCH ON PI STATUS — a non-throw does NOT mean the charge succeeded.
  const status = paymentIntent.status;

  if (status === "succeeded") {
    await recordWinnerStatus(winner, "PAID", now, {
      feeAmountCents,
      taxAmountCents,
      creditAppliedCents: discountCents,
      stripePaymentIntentId: paymentIntent.id,
      moveItemsToPendingPickup: true,
    });
    // Fold newly-won items into any upcoming pickup appointment.
    await autoAttachPaidItems(clerkUserId, org.id);
    // Vesting happens AFTER the full charge pass (see vestWinners) so this
    // auction's credit can't be applied to this auction's own bills.
    notifyPaymentReceipt({
      clerkUserId,
      amount: Number((netChargeCents / 100).toFixed(2)),
    }).catch((e) => console.error("notifyPaymentReceipt (auto-charge) failed:", e));
    console.log(
      `Auto-charge: $${(netChargeCents / 100).toFixed(2)} charged to ${clerkUserId}` +
        (discountCents > 0 ? ` ($${(discountCents / 100).toFixed(2)} Bid Bucks applied)` : "") +
        ` (PI: ${paymentIntent.id})`
    );
    return;
  }

  if (status === "processing") {
    // Async settlement in progress — record PENDING, leave items SOLD, let the
    // webhook (payment_intent.succeeded / .payment_failed) reconcile. The credit
    // reservation is held; the webhook releases it if the charge ultimately fails.
    await recordWinnerStatus(winner, "PENDING", now, {
      feeAmountCents,
      taxAmountCents,
      creditAppliedCents: discountCents,
      stripePaymentIntentId: paymentIntent.id,
    });
    console.log(`Auto-charge: PI ${paymentIntent.id} processing for ${clerkUserId} — pending webhook`);
    return;
  }

  // requires_action / requires_payment_method / requires_confirmation / canceled / ...
  // Not a success — give the reserved Bid Bucks back and record FAILED; items stay SOLD.
  console.warn(`Auto-charge: PI ${paymentIntent.id} status "${status}" for ${clerkUserId} — not charged`);
  if (discountCents > 0) await releaseReferralCredit(redemptionKey);
  await recordWinnerStatus(winner, "FAILED", now, {
    failureReason: status,
    stripePaymentIntentId: paymentIntent.id,
  });
  notifyPaymentFailed({
    clerkUserId,
    itemCount: itemIds.length,
    reason: status,
  }).catch((e) => console.error("notifyPaymentFailed (non-succeeded) failed:", e));
}

/**
 * Writes per-item Payment rows for a winner at the given status, optionally
 * moving items to PENDING_PICKUP — all in a single transaction per winner so a
 * crash can't leave items charged-but-unrecorded.
 *
 * Fee/tax are distributed across items in whole cents; the leftover cent goes to
 * item[0] so per-item rows sum back to the charged total. Idempotent: pre-checks
 * existing rows and ignores P2002.
 */
async function recordWinnerStatus(
  winner: WinnerEntry,
  status: "PAID" | "PENDING" | "FAILED",
  attemptedAt: Date,
  opts: {
    feeAmountCents?: number;
    taxAmountCents?: number;
    creditAppliedCents?: number;
    stripePaymentIntentId?: string;
    failureReason?: string;
    moveItemsToPendingPickup?: boolean;
  } = {}
): Promise<void> {
  const { clerkUserId } = winner;
  const itemIds = winner.items.map((i) => i.id);
  const feeAmountCents = opts.feeAmountCents ?? 0;
  const taxAmountCents = opts.taxAmountCents ?? 0;
  // Whole Bid Bucks discount is attributed to the first item's row (like the
  // fee/tax remainder) so per-item rows still sum back to what was charged.
  const creditAppliedCents = opts.creditAppliedCents ?? 0;

  const n = winner.items.length;
  const baseFeeCents = Math.floor(feeAmountCents / n);
  const feeRemainderCents = feeAmountCents - baseFeeCents * n;
  const baseTaxCents = Math.floor(taxAmountCents / n);
  const taxRemainderCents = taxAmountCents - baseTaxCents * n;

  // Pre-check existing rows so we don't try to re-insert (keeps the tx clean and
  // preserves idempotency alongside the P2002 catch).
  const existing = await prisma.payment.findMany({
    where: { itemId: { in: itemIds }, clerkUserId },
    select: { itemId: true },
  });
  const existingItemIds = new Set(existing.map((p) => p.itemId));

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (let idx = 0; idx < winner.items.length; idx++) {
    const item = winner.items[idx];
    if (existingItemIds.has(item.id)) continue; // already recorded — skip (idempotent)

    const itemFeeCents = baseFeeCents + (idx === 0 ? feeRemainderCents : 0);
    const itemTaxCents = baseTaxCents + (idx === 0 ? taxRemainderCents : 0);
    const itemCreditCents = idx === 0 ? creditAppliedCents : 0;

    ops.push(
      prisma.payment.create({
        data: {
          clerkUserId,
          itemId: item.id,
          amount: item.amount,
          applicationFeeAmount: itemFeeCents / 100,
          taxAmount: itemTaxCents / 100,
          creditApplied: itemCreditCents > 0 ? itemCreditCents / 100 : null,
          stripePaymentIntentId: opts.stripePaymentIntentId,
          status,
          autoChargeAttemptedAt: attemptedAt,
          failureReason: opts.failureReason,
        },
      })
    );

    if (opts.moveItemsToPendingPickup) {
      ops.push(
        prisma.item.update({ where: { id: item.id }, data: { status: "PENDING_PICKUP" } })
      );
    }
  }

  if (ops.length === 0) return;

  try {
    // Single transaction per winner — Payment rows + item moves succeed together.
    await prisma.$transaction(ops);
  } catch (e) {
    // P2002 = a payment row for an item+user already exists; safe to ignore.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }
}

/**
 * Resumable charging, decoupled from auction status.
 *
 * Finds WON bids whose items are still SOLD and have NO PAID/PENDING Payment row
 * for the winner (across any auction closed recently), and charges them. Run
 * AFTER the normal close pass so a follow-up cron tick finishes anyone the first
 * run missed (e.g. cron timed out mid-charge). The per-winner idempotency key +
 * pre-checks ensure reruns never double-charge.
 */
export async function chargeUnchargedWinners(): Promise<{ chargedWinners: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h of closed auctions

  // WON bids on SOLD items belonging to recently-closed auctions
  const wonBids = await prisma.bid.findMany({
    where: {
      status: "WON",
      item: {
        status: "SOLD",
        auction: { status: { in: ["CLOSED", "SETTLED"] }, updatedAt: { gte: since } },
      },
    },
    include: {
      item: {
        select: { id: true, title: true, auctionId: true, organizationId: true },
      },
    },
  });
  if (wonBids.length === 0) return { chargedWinners: 0 };

  // Drop any whose item already has a PAID/PENDING payment (only re-charge truly uncharged)
  const candidateItemIds = wonBids.map((b) => b.item.id);
  const settled = await prisma.payment.findMany({
    where: { itemId: { in: candidateItemIds }, status: { in: ["PAID", "PENDING"] } },
    select: { itemId: true, clerkUserId: true },
  });
  const settledKey = new Set(settled.map((p) => `${p.itemId}:${p.clerkUserId}`));

  // Group by (auctionId, clerkUserId) — one PI per winner per auction, matching the
  // idempotency key used at close time.
  type Group = { auctionId: string; orgId: string; winner: WinnerEntry };
  const groups = new Map<string, Group>();
  for (const bid of wonBids) {
    if (settledKey.has(`${bid.item.id}:${bid.clerkUserId}`)) continue;
    const auctionId = bid.item.auctionId;
    if (!auctionId) continue;
    const key = `${auctionId}:${bid.clerkUserId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        auctionId,
        orgId: bid.item.organizationId,
        winner: {
          clerkUserId: bid.clerkUserId,
          auctionName: "",
          orgName: "",
          items: [],
        },
      });
    }
    groups.get(key)!.winner.items.push({
      id: bid.item.id,
      title: bid.item.title,
      amount: Number(bid.amount),
    });
  }
  if (groups.size === 0) return { chargedWinners: 0 };

  // Load org charging config once per org
  const orgIds = [...new Set([...groups.values()].map((g) => g.orgId))];
  const orgs = await prisma.organization.findMany({
    where: { id: { in: orgIds } },
    select: {
      id: true,
      stripeAccountId: true,
      platformFeePercent: true,
      taxPercent: true,
      taxExempt: true,
    },
  });
  const orgMap = new Map(orgs.map((o) => [o.id, o]));

  const groupList = [...groups.values()];
  let chargedWinners = 0;
  await runPooled(
    groupList,
    async (g) => {
      const org = orgMap.get(g.orgId);
      if (!org) return;
      await chargeOneWinner(g.winner, org, g.auctionId);
      chargedWinners++;
    },
    5
  );

  if (chargedWinners > 0) {
    console.log(`[resumable] Attempted charge for ${chargedWinners} uncharged winner(s)`);
  }
  return { chargedWinners };
}

/**
 * Fires one GHL "auction won" webhook per unique bidder.
 * Summarises all the items they won in that auction — no per-item spam.
 */
/**
 * Vests referral rewards for every winner who actually paid in this auction —
 * run AFTER the whole charge pass. Because the inviter's own bill in this same
 * auction was already charged before this runs, credit they earn here can never
 * be applied to this auction's bill; it always lands on their NEXT win.
 * vestReferralForPayer is a no-op for winners who aren't referred or didn't pay.
 */
async function vestWinners(winnerMap: Map<string, WinnerEntry>): Promise<void> {
  if (winnerMap.size === 0) return;
  await runPooled(
    [...winnerMap.keys()],
    (clerkUserId) => vestReferralForPayer(clerkUserId),
    5
  );
}

async function notifyWinners(winnerMap: Map<string, WinnerEntry>): Promise<void> {
  if (!process.env.GHL_AUCTION_WON_WEBHOOK || winnerMap.size === 0) return;

  const bidderIds = [...winnerMap.keys()];
  const profiles = await prisma.bidderProfile.findMany({
    where: { clerkUserId: { in: bidderIds } },
    select: { clerkUserId: true, email: true, phone: true, name: true },
  });
  const profileMap = new Map(profiles.map((p) => [p.clerkUserId, p]));

  // Bound the notify fan-out so a large auction doesn't open hundreds of sockets at once.
  await runPooled(
    [...winnerMap.values()],
    async (winner) => {
      const profile = profileMap.get(winner.clerkUserId);
      const email = profile?.email ?? "";
      const phone = profile?.phone ?? "";
      const name = profile?.name ?? "Winner";
      const totalAmount = winner.items.reduce((s, i) => s + i.amount, 0);
      const itemCount = winner.items.length;
      const paymentUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`;

      await fetch(process.env.GHL_AUCTION_WON_WEBHOOK!, {
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
          smsMessage: `Northwood Bids: You won ${itemCount} item${itemCount !== 1 ? "s" : ""} in ${winner.auctionName} — total $${totalAmount}. Your card on file is charged automatically. Receipt & pickup: ${paymentUrl}`,
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
    },
    5
  );
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
        smsMessage: `Northwood Bids: ${auction.title} is LIVE. Start bidding: ${auctionUrl}`,
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

  // Popcorn extensions only push out item.itemEndAt, never auction.endAt, so the
  // 60-minute window must be gated on each auction's LATEST effective item end —
  // MAX(COALESCE(itemEndAt, auction.endAt)) — not the static auction.endAt.
  const candidateAuctions = await prisma.auction.findMany({
    where: {
      status: "OPEN",
      endingSoonNotifiedAt: null,
    },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      items: { select: { itemEndAt: true } },
    },
  });

  let notifiedAuctions = 0;

  for (const auction of candidateAuctions) {
    // Effective end = latest of each item's end (itemEndAt, or auction.endAt when null).
    const effectiveEnd = auction.items.reduce<Date>(
      (max, it) => {
        const end = it.itemEndAt ?? auction.endAt;
        return end > max ? end : max;
      },
      auction.endAt
    );

    // Only alert (and stamp) once items are genuinely within the 60-minute window.
    if (!(effectiveEnd >= now && effectiveEnd <= inOneHour)) continue;

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
            smsMessage: `Northwood Bids: ${auction.title} closes within the hour and you're winning items — last chance: ${auctionUrl}`,
            bidderEmail: email,
            bidderPhone: phone,
            bidderName: name,
            auctionName: auction.title,
            auctionUrl,
            orgName: auction.organization.name,
            endsAt: effectiveEnd.toISOString(),
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
    // Vest referral rewards AFTER charging (credit lands on the inviter's NEXT bill).
    await vestWinners(winnerMap);
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
  // Vest referral rewards AFTER charging (credit lands on the inviter's NEXT bill).
  await vestWinners(winnerMap);
  await notifyWinners(winnerMap);
  triggerAuctionUpdated(auction.organization.slug).catch(() => {});

  return { winnersCount: winnerMap.size };
}
