import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import Stripe from "stripe";

/**
 * Bid Bucks referral program — core logic.
 *
 * Rules (all enforced here, server-side, and impossible to bypass from the client):
 *   • Each bidder has ONE permanent share code.
 *   • A brand-new bidder who signs up through a code is attributed to that inviter,
 *     once and forever (Referral.referredUserId is unique).
 *   • The inviter earns $5 Bid Bucks ONLY when the referred bidder PAYS for their
 *     first won item — not when they sign up, bid, or merely win. A win costs the
 *     winner nothing until their card is charged, so "paid" is the bulletproof gate.
 *   • Anti-abuse at vesting: no self-referral, no shared phone number, no shared
 *     payment card (same Stripe card fingerprint) between inviter and referred.
 *   • Cap: an inviter can EARN credit from at most 5 referred bidders.
 *   • Redemption: one $5 comes off any single bill of $5 or more, auto-applied at
 *     charge time. Credit never makes a bill negative or drops a charge below the
 *     Stripe minimum.
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const CREDIT_PER_REFERRAL = 5; // dollars granted to the inviter
export const MAX_EARNED_REFERRALS = 5; // most referrals one inviter can earn from
export const MIN_BILL_CENTS = 500; // credit only applies to bills of $5.00+
export const STRIPE_MIN_CENTS = 50; // never leave a non-zero charge below $0.50

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://northwoodbids.com";

// Unambiguous alphabet (no 0/O/1/I/L) so codes are easy to read aloud / type.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function makeCode(len = 6): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return s;
}

/** Last-10-digits comparison key for a phone number (null if too short). */
function phoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/** Returns the user's permanent share code, creating it on first request. */
export async function getOrCreateReferralCode(clerkUserId: string): Promise<string> {
  const existing = await prisma.referralCode.findUnique({ where: { clerkUserId } });
  if (existing) return existing.code;

  // Retry on the (extremely unlikely) code collision.
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode(attempt < 4 ? 6 : 7);
    try {
      const created = await prisma.referralCode.create({ data: { clerkUserId, code } });
      return created.code;
    } catch (e) {
      // Another request created this user's code first — return it.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const again = await prisma.referralCode.findUnique({ where: { clerkUserId } });
        if (again) return again.code;
        // else the collision was on `code`, not the user — loop and try a new code.
      } else {
        throw e;
      }
    }
  }
  throw new Error("Could not generate a referral code");
}

export function referralLink(code: string): string {
  return `${APP_URL}/r/${code}`;
}

type AttributeResult =
  | { ok: true }
  | { ok: false; reason: "invalid_code" | "self" | "already_referred" | "not_new" };

/**
 * Attributes a NEW bidder to the inviter who owns `code`. Idempotent and safe to
 * call repeatedly — only the first valid attribution sticks (referredUserId is
 * unique). Refuses self-referral and refuses to attribute an established bidder
 * (anyone who has already paid for something), so codes can't be used to claim
 * credit for accounts that already existed.
 */
export async function attributeReferral(
  referredUserId: string,
  rawCode: string
): Promise<AttributeResult> {
  const code = (rawCode || "").trim().toUpperCase();
  if (!code) return { ok: false, reason: "invalid_code" };

  const owner = await prisma.referralCode.findUnique({ where: { code } });
  if (!owner) return { ok: false, reason: "invalid_code" };
  if (owner.clerkUserId === referredUserId) return { ok: false, reason: "self" };

  // Already attributed to someone? Leave it — one inviter per bidder, forever.
  const existing = await prisma.referral.findUnique({ where: { referredUserId } });
  if (existing) return { ok: false, reason: "already_referred" };

  // Can't retroactively "refer" an established buyer.
  const priorPaid = await prisma.payment.count({
    where: { clerkUserId: referredUserId, status: "PAID" },
  });
  if (priorPaid > 0) return { ok: false, reason: "not_new" };

  try {
    await prisma.referral.create({
      data: { referrerUserId: owner.clerkUserId, referredUserId, code, status: "PENDING" },
    });
    return { ok: true };
  } catch (e) {
    // Raced with another create — treat as already referred.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, reason: "already_referred" };
    }
    throw e;
  }
}

/** Default-card Stripe fingerprint for a user (null if no card / lookup fails). */
async function cardFingerprint(clerkUserId: string): Promise<string | null> {
  try {
    const customers = await prisma.bidderStripeCustomer.findMany({
      where: { clerkUserId, defaultPaymentMethodId: { not: null } },
      select: { defaultPaymentMethodId: true },
    });
    for (const c of customers) {
      if (!c.defaultPaymentMethodId) continue;
      const pm = await stripe.paymentMethods.retrieve(c.defaultPaymentMethodId);
      const fp = pm.card?.fingerprint;
      if (fp) return fp;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Vests the inviter's reward when a referred bidder pays for the first time.
 * Call this on EVERY transition of a Payment to PAID (auto-charge, webhook,
 * manual retry) — it no-ops unless the payer has a PENDING referral.
 *
 * Idempotent and concurrency-safe: the PENDING->EARNED transition is a guarded
 * updateMany and the credit row is unique per referral, so it can never grant
 * twice. Anti-abuse (self / shared phone / shared card) and the 5-referral cap
 * are enforced atomically under a per-inviter advisory lock.
 */
export async function vestReferralForPayer(payerUserId: string): Promise<void> {
  try {
    const ref = await prisma.referral.findUnique({ where: { referredUserId: payerUserId } });
    if (!ref || ref.status !== "PENDING") return;

    // Self-protecting: only vest once the referred bidder has a real PAID payment.
    // This makes the function safe to call from anywhere (including a post-charge
    // sweep over all auction winners, some of whom may have failed to pay).
    const paidCount = await prisma.payment.count({
      where: { clerkUserId: payerUserId, status: "PAID" },
    });
    if (paidCount === 0) return;

    const referrer = ref.referrerUserId;

    // ── Anti-abuse ──────────────────────────────────────────────────────────
    let blockReason: string | null = null;
    if (referrer === payerUserId) {
      blockReason = "self-referral";
    } else {
      const [inviterProfile, payerProfile] = await Promise.all([
        prisma.bidderProfile.findUnique({ where: { clerkUserId: referrer }, select: { phone: true } }),
        prisma.bidderProfile.findUnique({ where: { clerkUserId: payerUserId }, select: { phone: true } }),
      ]);
      const ip = phoneKey(inviterProfile?.phone);
      const pp = phoneKey(payerProfile?.phone);
      if (ip && pp && ip === pp) {
        blockReason = "shared phone number";
      } else {
        const [inviterCard, payerCard] = await Promise.all([
          cardFingerprint(referrer),
          cardFingerprint(payerUserId),
        ]);
        if (inviterCard && payerCard && inviterCard === payerCard) {
          blockReason = "shared payment card";
        }
      }
    }

    if (blockReason) {
      await prisma.referral.updateMany({
        where: { referredUserId: payerUserId, status: "PENDING" },
        data: { status: "BLOCKED", blockedReason: blockReason, earnedAt: new Date() },
      });
      console.warn(`[referral] BLOCKED ${ref.id} (${blockReason})`);
      return;
    }

    // ── Cap + grant, serialized per inviter ────────────────────────────────
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"refvest:" + referrer}))`;

      const earnedCount = await tx.referral.count({
        where: { referrerUserId: referrer, status: "EARNED" },
      });

      if (earnedCount >= MAX_EARNED_REFERRALS) {
        await tx.referral.updateMany({
          where: { referredUserId: payerUserId, status: "PENDING" },
          data: { status: "CAPPED", earnedAt: new Date() },
        });
        return;
      }

      const flipped = await tx.referral.updateMany({
        where: { referredUserId: payerUserId, status: "PENDING" },
        data: { status: "EARNED", earnedAt: new Date() },
      });
      if (flipped.count === 0) return; // someone else already handled it

      // Unique on referralId guarantees the grant is recorded at most once.
      try {
        await tx.creditLedger.create({
          data: {
            clerkUserId: referrer,
            amount: CREDIT_PER_REFERRAL,
            reason: "referral_earned",
            referralId: ref.id,
          },
        });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      }
    });

    console.log(`[referral] EARNED ${ref.id} -> +$${CREDIT_PER_REFERRAL} to ${referrer}`);
  } catch (e) {
    // Never let referral vesting break a payment flow.
    console.error("vestReferralForPayer error:", e);
  }
}

/** Current Bid Bucks balance (dollars) for a user. */
export async function getCreditBalance(clerkUserId: string): Promise<number> {
  const agg = await prisma.creditLedger.aggregate({
    where: { clerkUserId },
    _sum: { amount: true },
  });
  return Number(agg._sum.amount ?? 0);
}

/**
 * Reserves Bid Bucks against a bill and returns the discount in CENTS to subtract
 * from the charge. Writes a negative ledger row immediately so the balance is
 * spent atomically. Caller MUST release (see releaseReferralCredit) if the charge
 * ultimately fails.
 *
 * Guarantees:
 *   • Only bills of $5.00+ get any discount.
 *   • At most one $5 credit per bill.
 *   • Never makes the charge negative; never leaves a non-zero charge below the
 *     Stripe minimum ($0.50) — it shaves the discount instead.
 *   • Idempotent per redemptionKey: re-charging the same bill returns the same
 *     discount without double-spending.
 *
 * `redemptionKey` must uniquely identify the bill (e.g. the PaymentIntent's
 * idempotency key: `autocharge-{auctionId}-{userId}` or `retry-{itemId}-{userId}`).
 */
export async function reserveReferralCredit(
  clerkUserId: string,
  billCents: number,
  redemptionKey: string
): Promise<number> {
  if (billCents < MIN_BILL_CENTS) return 0;

  // Cheap pre-check so we don't open a locked transaction for the (vast) majority
  // of winners who have no Bid Bucks. The authoritative balance check happens
  // again inside the transaction, so this can't cause an overspend.
  const quick = await getCreditBalance(clerkUserId);
  if (quick < CREDIT_PER_REFERRAL) return 0;

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"refcred:" + clerkUserId}))`;

      // Already reserved for this exact bill — return the same discount.
      const prior = await tx.creditLedger.findUnique({ where: { redemptionKey } });
      if (prior) return Math.round(Math.abs(Number(prior.amount)) * 100);

      const agg = await tx.creditLedger.aggregate({
        where: { clerkUserId },
        _sum: { amount: true },
      });
      const balanceCents = Math.round(Number(agg._sum.amount ?? 0) * 100);
      if (balanceCents < CREDIT_PER_REFERRAL * 100) return 0; // need a full $5 to redeem

      // One $5 per bill, but never exceed the bill or strand a sub-minimum residual.
      let discount = Math.min(CREDIT_PER_REFERRAL * 100, billCents);
      const net = billCents - discount;
      if (net > 0 && net < STRIPE_MIN_CENTS) {
        discount = billCents - STRIPE_MIN_CENTS; // leave exactly the Stripe minimum
      }
      if (discount <= 0) return 0;

      await tx.creditLedger.create({
        data: {
          clerkUserId,
          amount: -(discount / 100),
          reason: "referral_redeemed",
          redemptionKey,
        },
      });
      return discount;
    });
  } catch (e) {
    // Raced another reserve for the same key — return whatever stuck.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const prior = await prisma.creditLedger.findUnique({ where: { redemptionKey } });
      if (prior) return Math.round(Math.abs(Number(prior.amount)) * 100);
      return 0;
    }
    console.error("reserveReferralCredit error:", e);
    return 0; // fail safe — just don't discount
  }
}

/** Releases a previously-reserved discount (call when the charge fails). */
export async function releaseReferralCredit(redemptionKey: string): Promise<void> {
  try {
    await prisma.creditLedger.deleteMany({
      where: { redemptionKey, reason: "referral_redeemed" },
    });
  } catch (e) {
    console.error("releaseReferralCredit error:", e);
  }
}

export type CouponState = "available" | "redeemed" | "locked";

export type ReferralSummary = {
  code: string;
  link: string;
  balance: number;
  earnedCount: number;
  redeemedCount: number;
  availableCount: number;
  cap: number;
  pendingCount: number;
  totalRedeemed: number;
  // Exactly `cap` entries — the bidder's coupon book. Redeemed first, then
  // available, then still-locked slots they can still earn.
  coupons: CouponState[];
  referrals: {
    name: string;
    status: "PENDING" | "EARNED" | "CAPPED" | "BLOCKED";
    createdAt: string;
    earnedAt: string | null;
  }[];
};

/** Privacy-preserving display name for a referred bidder. */
function maskName(name: string | null): string {
  if (!name) return "New bidder";
  const first = name.trim().split(/\s+/)[0] || "New bidder";
  return first;
}

/** Everything the /refer page needs in one shot. */
export async function getReferralSummary(clerkUserId: string): Promise<ReferralSummary> {
  const [code, balance, referrals, redeemAgg, redeemedCount] = await Promise.all([
    getOrCreateReferralCode(clerkUserId),
    getCreditBalance(clerkUserId),
    prisma.referral.findMany({
      where: { referrerUserId: clerkUserId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.creditLedger.aggregate({
      where: { clerkUserId, reason: "referral_redeemed" },
      _sum: { amount: true },
    }),
    // Each redemption row = one $5 coupon spent on a bill.
    prisma.creditLedger.count({
      where: { clerkUserId, reason: "referral_redeemed" },
    }),
  ]);

  const referredIds = referrals.map((r) => r.referredUserId);
  const profiles = referredIds.length
    ? await prisma.bidderProfile.findMany({
        where: { clerkUserId: { in: referredIds } },
        select: { clerkUserId: true, name: true },
      })
    : [];
  const nameById = new Map(profiles.map((p) => [p.clerkUserId, p.name]));

  const earnedCount = referrals.filter((r) => r.status === "EARNED").length;
  const pendingCount = referrals.filter((r) => r.status === "PENDING").length;

  // Build the coupon book: redeemed slots, then still-available, then locked.
  const cap = MAX_EARNED_REFERRALS;
  const redeemed = Math.min(redeemedCount, earnedCount);
  const available = Math.max(0, earnedCount - redeemed);
  const locked = Math.max(0, cap - redeemed - available);
  const coupons: CouponState[] = [
    ...Array<CouponState>(redeemed).fill("redeemed"),
    ...Array<CouponState>(available).fill("available"),
    ...Array<CouponState>(locked).fill("locked"),
  ];

  return {
    code,
    link: referralLink(code),
    balance,
    earnedCount,
    redeemedCount: redeemed,
    availableCount: available,
    cap,
    pendingCount,
    totalRedeemed: Math.abs(Number(redeemAgg._sum.amount ?? 0)),
    coupons,
    referrals: referrals
      // Don't surface blocked rows as "referrals" — they're fraud signals, not invites.
      .filter((r) => r.status !== "BLOCKED")
      .map((r) => ({
        name: maskName(nameById.get(r.referredUserId) ?? null),
        status: r.status as "PENDING" | "EARNED" | "CAPPED",
        createdAt: r.createdAt.toISOString(),
        earnedAt: r.earnedAt ? r.earnedAt.toISOString() : null,
      })),
  };
}
