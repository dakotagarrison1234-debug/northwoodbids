import { requireSuperAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function GET() {
  await requireSuperAdmin();

  // Pull all application fees directly from Stripe — this is the real money you collected
  const fees: Stripe.ApplicationFee[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const page = await stripe.applicationFees.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
      expand: ["data.charge"],
    });
    fees.push(...page.data);
    hasMore = page.has_more;
    if (page.data.length > 0) startingAfter = page.data[page.data.length - 1].id;
  }

  // Extract payment intent IDs from the expanded charges
  const piIds: string[] = [];
  for (const fee of fees) {
    const charge = fee.charge as Stripe.Charge | null;
    if (charge?.payment_intent && typeof charge.payment_intent === "string") {
      piIds.push(charge.payment_intent);
    }
  }

  // Look up our Payment records to get org attribution
  const payments = await prisma.payment.findMany({
    where: { stripePaymentIntentId: { in: piIds } },
    select: {
      stripePaymentIntentId: true,
      item: {
        select: {
          organizationId: true,
          auction: {
            select: {
              organization: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      },
    },
  });

  const piToOrg = new Map<string, { id: string; name: string; slug: string }>();
  for (const p of payments) {
    if (p.stripePaymentIntentId && p.item?.auction?.organization) {
      piToOrg.set(p.stripePaymentIntentId, p.item.auction.organization);
    }
  }

  // Aggregate by org using real Stripe fee amounts
  const orgMap = new Map<string, {
    orgId: string;
    orgName: string;
    orgSlug: string;
    platformRevenue: number;
    feeCount: number;
    lastActivity: number;
  }>();

  let totalRevenue = 0;
  let unattributedRevenue = 0;

  for (const fee of fees) {
    const netFee = (fee.amount - fee.amount_refunded) / 100;
    totalRevenue += netFee;

    const charge = fee.charge as Stripe.Charge | null;
    const piId = typeof charge?.payment_intent === "string" ? charge.payment_intent : null;
    const org = piId ? piToOrg.get(piId) : null;

    if (!org) {
      unattributedRevenue += netFee;
      continue;
    }

    if (!orgMap.has(org.id)) {
      orgMap.set(org.id, {
        orgId: org.id,
        orgName: org.name,
        orgSlug: org.slug,
        platformRevenue: 0,
        feeCount: 0,
        lastActivity: 0,
      });
    }
    const entry = orgMap.get(org.id)!;
    entry.platformRevenue += netFee;
    entry.feeCount++;
    if (fee.created > entry.lastActivity) entry.lastActivity = fee.created;
  }

  // Also get the platform Stripe balance for real available/pending amounts
  const balance = await stripe.balance.retrieve();
  const available = balance.available.reduce((s, b) => s + b.amount, 0) / 100;
  const pending = balance.pending.reduce((s, b) => s + b.amount, 0) / 100;

  // Failed/pending from our DB (Stripe doesn't track these — they never succeeded)
  const dbIssues = await prisma.payment.findMany({
    where: { status: { in: ["FAILED", "PENDING"] } },
    select: {
      id: true,
      clerkUserId: true,
      amount: true,
      applicationFeeAmount: true,
      status: true,
      failureReason: true,
      createdAt: true,
      item: {
        select: {
          id: true,
          title: true,
          auction: {
            select: {
              title: true,
              organization: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const issueUserIds = [...new Set(dbIssues.map((p) => p.clerkUserId))];
  const profiles = await prisma.bidderProfile.findMany({
    where: { clerkUserId: { in: issueUserIds } },
    select: { clerkUserId: true, name: true, email: true },
  });
  const profileMap = new Map(profiles.map((p) => [p.clerkUserId, p]));

  return NextResponse.json({
    // Stripe-verified numbers
    totalRevenue,
    unattributedRevenue,
    stripeAvailable: available,
    stripePending: pending,
    feeCount: fees.length,
    // Per-org breakdown (attributed via payment intent lookup)
    orgs: Array.from(orgMap.values()).sort((a, b) => b.platformRevenue - a.platformRevenue),
    // DB-only: failed/pending (never hit Stripe successfully)
    issues: dbIssues.map((p) => ({
      ...p,
      amount: Number(p.amount),
      applicationFeeAmount: p.applicationFeeAmount ? Number(p.applicationFeeAmount) : null,
      user: profileMap.get(p.clerkUserId) ?? null,
    })),
    fetchedAt: new Date().toISOString(),
  });
}
