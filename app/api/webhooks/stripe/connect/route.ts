import { NextResponse } from "next/server";

/**
 * Stripe Connect webhook — DISABLED.
 *
 * Northwood Bids runs payments directly on a single platform Stripe account
 * (no Stripe Connect / connected accounts), so there is no account.updated
 * event to process. Kept as a harmless no-op so any stale webhook delivery
 * returns 200 instead of erroring.
 */
export async function POST() {
  return NextResponse.json({ received: true, disabled: true });
}
