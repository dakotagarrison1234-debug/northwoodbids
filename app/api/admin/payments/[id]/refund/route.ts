import { NextRequest, NextResponse } from "next/server";
import type { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Refund a PAID payment. Owner/Admin only. Issues a Stripe refund against the
// original PaymentIntent, marks the Payment REFUNDED, and returns the item to
// UNSOLD so it can be re-listed.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireRole(membership.organizationId, ["OWNER", "ADMIN"] as OrgRole[]))) {
    return NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 });
  }

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { item: { select: { id: true, organizationId: true } } },
  });
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  // The payment's item must belong to the caller's org.
  if (payment.item.organizationId !== membership.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (payment.status !== "PAID" || !payment.stripePaymentIntentId) {
    return NextResponse.json(
      { error: "Only a paid payment with a recorded charge can be refunded." },
      { status: 400 }
    );
  }

  try {
    await stripe.refunds.create({ payment_intent: payment.stripePaymentIntentId });
  } catch (err) {
    console.error("[admin refund] Stripe refund failed:", err);
    return NextResponse.json(
      { error: "Could not process the refund. Please try again." },
      { status: 502 }
    );
  }

  await prisma.$transaction([
    prisma.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } }),
    prisma.item.update({ where: { id: payment.item.id }, data: { status: "UNSOLD" } }),
  ]);

  return NextResponse.json({ success: true });
}
