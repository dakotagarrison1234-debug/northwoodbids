import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface Props {
  params: Promise<{ orgId: string }>;
}

/**
 * POST /api/orgs/[orgId]/stripe/setup-intent
 *
 * Creates (or reuses) a Stripe Customer on the org's connected account for the
 * current user, then returns a SetupIntent client_secret so the client can
 * collect + save a card via Stripe Elements.
 *
 * The SetupIntent uses usage: "off_session" so the saved payment method can be
 * charged automatically when the auction closes — no 3DS prompts at charge time.
 */
export async function POST(_request: NextRequest, { params }: Props) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { orgId } = await params;

    // Org must exist. Payments run directly on the platform Stripe account.
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    });
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Look up existing BidderStripeCustomer for this user + org
    const existing = await prisma.bidderStripeCustomer.findUnique({
      where: { clerkUserId_organizationId: { clerkUserId: userId, organizationId: orgId } },
    });

    let customerId: string;

    if (existing) {
      customerId = existing.stripeCustomerId;
    } else {
      // Create a new Customer on the platform account
      const profile = await prisma.bidderProfile.findUnique({
        where: { clerkUserId: userId },
        select: { email: true, name: true },
      });

      const customer = await stripe.customers.create({
        metadata: { clerkUserId: userId, orgId },
        ...(profile?.email ? { email: profile.email } : {}),
        ...(profile?.name ? { name: profile.name } : {}),
      });
      customerId = customer.id;

      // Persist the record now (without a PM — that comes after setup confirmation)
      await prisma.bidderStripeCustomer.create({
        data: {
          clerkUserId: userId,
          organizationId: orgId,
          stripeCustomerId: customerId,
        },
      });
    }

    // Create a SetupIntent on the platform account
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session", // allows future off-session charging
      metadata: { clerkUserId: userId, orgId },
    });

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      customerId,
    });
  } catch (error) {
    console.error("Setup intent error:", error);
    return NextResponse.json({ error: "Failed to create setup intent" }, { status: 500 });
  }
}
