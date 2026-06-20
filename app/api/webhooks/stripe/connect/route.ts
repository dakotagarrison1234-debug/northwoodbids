import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// POST /api/webhooks/stripe/connect
// Handles Stripe Connect account events.
// Register this endpoint in the Stripe dashboard under Connect → Webhooks.
// Required events: account.updated
export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_CONNECT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_CONNECT_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe Connect webhook signature error:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "account.updated") {
    try {
      const account = event.data.object as Stripe.Account;

      const org = await prisma.organization.findUnique({
        where: { stripeAccountId: account.id },
      });
      if (!org) {
        // Unknown account — acknowledge and move on
        return NextResponse.json({ received: true });
      }

      const chargesEnabled = account.charges_enabled ?? false;
      const payoutsEnabled = account.payouts_enabled ?? false;
      const detailsSubmitted = account.details_submitted ?? false;

      await prisma.organization.update({
        where: { id: org.id },
        data: {
          stripeChargesEnabled: chargesEnabled,
          stripePayoutsEnabled: payoutsEnabled,
          stripeDetailsSubmitted: detailsSubmitted,
          // Promote to LIVE as soon as charges are enabled
          ...(chargesEnabled ? { status: "LIVE" } : {}),
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal error";
      console.error("[webhooks/stripe/connect account.updated]:", msg, err);
      // Always return 200 so Stripe doesn't retry forever
      return NextResponse.json({ received: true });
    }
  }

  return NextResponse.json({ received: true });
}
