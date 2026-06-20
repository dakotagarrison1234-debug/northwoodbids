import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canAccessOrg } from "@/lib/auth";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface Props {
  params: Promise<{ orgId: string }>;
}

// POST /api/orgs/[orgId]/stripe/onboard
// Creates or resumes Stripe Express onboarding for the org.
// Returns { url } — redirect the user there.
export async function POST(_request: NextRequest, { params }: Props) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { orgId } = await params;

    if (!(await canAccessOrg(orgId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "STRIPE_SECRET_KEY is not configured." }, { status: 500 });
    }

    if (!process.env.NEXT_PUBLIC_APP_URL) {
      return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL is not configured." }, { status: 500 });
    }

    let accountId = org.stripeAccountId;

    if (!accountId) {
      // First time — create a new Express account
      const account = await stripe.accounts.create({
        type: "express",
        metadata: { orgId },
      });
      accountId = account.id;
      await prisma.organization.update({
        where: { id: orgId },
        data: { stripeAccountId: accountId },
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      return_url: `${baseUrl}/admin/settings/payments?onboarded=1`,
      refresh_url: `${baseUrl}/admin/settings/payments?refresh=1`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Stripe onboard error:", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
