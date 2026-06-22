import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface Props {
  params: Promise<{ orgId: string }>;
}

/**
 * GET /api/orgs/[orgId]/stripe/payment-method
 *
 * Returns whether the current user has a saved card on file for this org.
 * Also returns masked card details (last4, brand) for display.
 */
export async function GET(_request: NextRequest, { params }: Props) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { orgId } = await params;

    const bidderCustomer = await prisma.bidderStripeCustomer.findUnique({
      where: { clerkUserId_organizationId: { clerkUserId: userId, organizationId: orgId } },
    });

    if (!bidderCustomer?.defaultPaymentMethodId) {
      return NextResponse.json({ hasCard: false });
    }

    // Fetch card details from Stripe for display (best-effort — don't fail if Stripe errors)
    try {
      const pm = await stripe.paymentMethods.retrieve(
        bidderCustomer.defaultPaymentMethodId
      );
      return NextResponse.json({
        hasCard: true,
        last4: pm.card?.last4 ?? null,
        brand: pm.card?.brand ?? null,
      });
    } catch {
      // Fall through — just say hasCard: true without details
    }

    return NextResponse.json({ hasCard: true });
  } catch (error) {
    console.error("Payment method GET error:", error);
    return NextResponse.json({ error: "Failed to check payment method" }, { status: 500 });
  }
}

/**
 * POST /api/orgs/[orgId]/stripe/payment-method
 * Body: { paymentMethodId: string }
 *
 * Called after the client successfully confirms a SetupIntent.
 * Saves the payment method as the default for future off-session charges.
 */
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { orgId } = await params;
    const { paymentMethodId } = await request.json();
    if (!paymentMethodId) {
      return NextResponse.json({ error: "paymentMethodId required" }, { status: 400 });
    }

    const bidderCustomer = await prisma.bidderStripeCustomer.findUnique({
      where: { clerkUserId_organizationId: { clerkUserId: userId, organizationId: orgId } },
    });

    if (!bidderCustomer) {
      return NextResponse.json({ error: "Customer not found — start setup again" }, { status: 404 });
    }

    // Verify the payment method actually belongs to this customer before making
    // it the default. Without this, a user could pass an arbitrary payment-method
    // id (belonging to someone else) and have it set on their customer record.
    let pm: Stripe.PaymentMethod;
    try {
      pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    } catch {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }
    if (pm.customer !== bidderCustomer.stripeCustomerId) {
      return NextResponse.json({ error: "Payment method does not belong to this customer" }, { status: 400 });
    }

    // Set as default on the platform-account customer
    await stripe.customers.update(
      bidderCustomer.stripeCustomerId,
      { invoice_settings: { default_payment_method: paymentMethodId } }
    );

    // Persist the payment method ID
    await prisma.bidderStripeCustomer.update({
      where: { clerkUserId_organizationId: { clerkUserId: userId, organizationId: orgId } },
      data: { defaultPaymentMethodId: paymentMethodId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Payment method POST error:", error);
    return NextResponse.json({ error: "Failed to save payment method" }, { status: 500 });
  }
}
