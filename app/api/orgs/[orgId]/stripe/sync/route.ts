import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canAccessOrg } from "@/lib/auth";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface Props {
  params: Promise<{ orgId: string }>;
}

/**
 * POST /api/orgs/[orgId]/stripe/sync
 *
 * Pulls the connected account's current status straight from Stripe and
 * syncs it to the DB. Fallback for the Connect webhook — called by the
 * payments settings page on load and when returning from onboarding
 * (?onboarded=1), so org activation never depends solely on webhook delivery.
 */
export async function POST(_request: NextRequest, { params }: Props) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { orgId } = await params;

    if (!(await canAccessOrg(orgId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, stripeAccountId: true, status: true },
    });
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!org.stripeAccountId) {
      return NextResponse.json({ synced: false, reason: "No Stripe account connected yet" });
    }

    const account = await stripe.accounts.retrieve(org.stripeAccountId);

    const chargesEnabled = account.charges_enabled ?? false;
    const payoutsEnabled = account.payouts_enabled ?? false;
    const detailsSubmitted = account.details_submitted ?? false;

    const updated = await prisma.organization.update({
      where: { id: org.id },
      data: {
        stripeChargesEnabled: chargesEnabled,
        stripePayoutsEnabled: payoutsEnabled,
        stripeDetailsSubmitted: detailsSubmitted,
        // Promote to LIVE as soon as charges are enabled (same rule as the webhook)
        ...(chargesEnabled ? { status: "LIVE" } : {}),
      },
      select: {
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeDetailsSubmitted: true,
      },
    });

    return NextResponse.json({ synced: true, ...updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[stripe/sync POST]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
