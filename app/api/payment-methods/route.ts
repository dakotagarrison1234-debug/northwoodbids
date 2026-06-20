export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * GET /api/payment-methods
 *
 * Returns all saved payment methods for the current user across all orgs.
 * Each entry has { orgId, orgName, stripeAccountId, hasCard, last4, brand }.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const records = await prisma.bidderStripeCustomer.findMany({
    where: { clerkUserId: userId },
    include: {
      organization: {
        select: { id: true, name: true, slug: true, stripeAccountId: true, stripeChargesEnabled: true },
      },
    },
  });

  const settled = await Promise.allSettled(
    records.map(async (r) => {
      const base = {
        orgId: r.organizationId,
        orgName: r.organization.name,
        orgSlug: r.organization.slug,
        stripeAccountId: r.organization.stripeAccountId,
        stripeChargesEnabled: r.organization.stripeChargesEnabled,
        hasCard: !!r.defaultPaymentMethodId,
        last4: null as string | null,
        brand: null as string | null,
      };

      if (r.defaultPaymentMethodId && r.organization.stripeAccountId) {
        try {
          const pm = await stripe.paymentMethods.retrieve(
            r.defaultPaymentMethodId,
            undefined,
            { stripeAccount: r.organization.stripeAccountId }
          );
          base.last4 = pm.card?.last4 ?? null;
          base.brand = pm.card?.brand ?? null;
        } catch {
          // non-fatal — just show "Card on file" without details
        }
      }

      return base;
    })
  );

  const results = settled
    .filter((r): r is PromiseFulfilledResult<typeof r extends PromiseFulfilledResult<infer T> ? T : never> => r.status === "fulfilled")
    .map((r) => r.value);

  return NextResponse.json({ paymentMethods: results });
}
