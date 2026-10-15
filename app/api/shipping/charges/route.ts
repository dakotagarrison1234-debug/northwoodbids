export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/shipping/charges — every shipping charge on the signed-in bidder's
 * bills, newest first, 50 max. One row per lot that carried a shipping delta
 * (Payment.shippingAmount > 0): the date it was billed, the lot, the amount,
 * and whether it's been paid / refunded / is still owed.
 *
 * `refunded` is true when that shipping was given back (the lot left its box
 * before the label) — the row stays, struck through.
 *
 * { charges: [{ id, itemId, title, cents, createdAt, status: "PAID"|"PENDING"|"FAILED"|"REFUNDED", refunded, box: { id, status, location } | null }] }
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const rows = await prisma.payment.findMany({
    where: { clerkUserId: userId, shippingAmount: { gt: 0 } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true, itemId: true, shippingAmount: true, shippingRefundedAt: true, createdAt: true, status: true, paidAt: true,
      item: {
        select: {
          title: true,
          shippingBundle: { select: { id: true, status: true, location: { select: { name: true } } } },
        },
      },
    },
  });

  const charges = rows.map((r) => ({
    id: r.id,
    itemId: r.itemId,
    title: r.item.title,
    cents: Math.round(Number(r.shippingAmount) * 100),
    createdAt: (r.paidAt ?? r.createdAt).toISOString(),
    status: r.status,
    refunded: !!r.shippingRefundedAt,
    box: r.item.shippingBundle
      ? { id: r.item.shippingBundle.id, status: r.item.shippingBundle.status, location: r.item.shippingBundle.location?.name ?? null }
      : null,
  }));
  return NextResponse.json({ charges });
}
