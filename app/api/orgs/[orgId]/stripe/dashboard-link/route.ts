import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canAccessOrg } from "@/lib/auth";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface Props {
  params: Promise<{ orgId: string }>;
}

// POST /api/orgs/[orgId]/stripe/dashboard-link
// Returns a Stripe Express dashboard login link for the connected account.
export async function POST(_request: NextRequest, { params }: Props) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;

  if (!(await canAccessOrg(orgId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org?.stripeAccountId) {
      return NextResponse.json({ error: "No Stripe account connected" }, { status: 400 });
    }

    const loginLink = await stripe.accounts.createLoginLink(org.stripeAccountId);
    return NextResponse.json({ url: loginLink.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[stripe/dashboard-link POST]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
