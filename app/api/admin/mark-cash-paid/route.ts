export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";
import { settleItemsPaid } from "@/lib/settlePayments";
import { autoAttachPaidItems } from "@/lib/pickup";

/**
 * POST /api/admin/mark-cash-paid
 * Body: { clerkUserId: string, itemIds?: string[], note?: string, undo?: boolean }
 *
 * Record (or reverse) an in-person CASH payment for a customer's won items.
 *
 * No card is ever charged: this marks the customer's outstanding Payment rows PAID
 * with paidInCash=true, so the money shows up in Reports as real revenue — but with
 * NO Stripe fee (cash has no processor cut) and broken out on its own cash report —
 * and the items flow into pickup exactly like a card payment.
 *
 * Safety:
 *  - Org-scoped. Only the customer's WON items in THIS org are touched.
 *  - Already-PAID rows (card OR cash) and comped rows are skipped — a real Stripe
 *    payment is never overwritten.
 *  - Undo only reverses rows WE marked cash-paid, and only while the item is still
 *    simply awaiting pickup (not on an appointment/transfer, not collected).
 */
export async function POST(request: NextRequest) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const orgId = membership.organizationId;
    const adminId = membership.clerkUserId;

    const body = await request.json().catch(() => ({}));
    const clerkUserId: string | undefined = body.clerkUserId;
    const itemIds: string[] | undefined = Array.isArray(body.itemIds) ? body.itemIds : undefined;
    const note: string | null =
      typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
    const undo: boolean = body.undo === true;
    if (!clerkUserId) return NextResponse.json({ error: "clerkUserId required" }, { status: 400 });

    // The customer's wins in this org (source of truth for what they owe).
    const wonBids = await prisma.bid.findMany({
      where: { clerkUserId, status: "WON", item: { organizationId: orgId } },
      select: {
        amount: true,
        item: { select: { id: true, status: true, pickupAppointmentId: true, transferRequestId: true } },
      },
    });
    if (wonBids.length === 0) return NextResponse.json({ error: "This bidder has no wins." }, { status: 404 });

    const restrict = itemIds && itemIds.length ? new Set(itemIds) : null;

    const itemIdList = wonBids.map((b) => b.item.id);
    const payments = await prisma.payment.findMany({
      where: { itemId: { in: itemIdList }, clerkUserId },
      select: { itemId: true, status: true, paidInCash: true, comped: true },
    });
    const payByItem = new Map(payments.map((p) => [p.itemId, p]));

    // ── Undo ──────────────────────────────────────────────────────────────────
    if (undo) {
      const targets = wonBids.filter((b) => {
        if (restrict && !restrict.has(b.item.id)) return false;
        const p = payByItem.get(b.item.id);
        if (!p || !p.paidInCash || p.status !== "PAID") return false; // only our cash rows
        // Reversible only while it's still simply awaiting pickup.
        return (
          b.item.status === "PENDING_PICKUP" &&
          !b.item.pickupAppointmentId &&
          !b.item.transferRequestId
        );
      });
      if (targets.length === 0) {
        return NextResponse.json(
          { error: "Nothing to undo — these weren't cash-paid, or they've already moved into pickup." },
          { status: 409 }
        );
      }
      const ids = targets.map((t) => t.item.id);
      await prisma.payment.updateMany({
        where: { itemId: { in: ids }, clerkUserId, paidInCash: true },
        data: { status: "PENDING", paidInCash: false, paidAt: null, markedPaidBy: null, cashNote: null },
      });
      await prisma.item.updateMany({ where: { id: { in: ids }, status: "PENDING_PICKUP" }, data: { status: "SOLD" } });
      return NextResponse.json({ success: true, undone: ids.length });
    }

    // ── Mark cash paid ──────────────────────────────────────────────────────────
    const outstanding = wonBids.filter((b) => {
      if (restrict && !restrict.has(b.item.id)) return false;
      const p = payByItem.get(b.item.id);
      if (p?.comped) return false;      // comps are never charged
      if (p?.status === "PAID") return false; // already paid (card or cash) — never overwrite
      return true;
    });
    if (outstanding.length === 0) {
      return NextResponse.json({ error: "Nothing outstanding — already paid." }, { status: 409 });
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { platformFeePercent: true, taxPercent: true, taxExempt: true },
    });
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
    const feePct = Number(org.platformFeePercent);
    const taxPct = org.taxExempt ? 0 : Number(org.taxPercent);

    const items = outstanding.map((b) => ({ id: b.item.id, bid: Number(b.amount) }));

    // Settle with NO Stripe PaymentIntent and NO Bid Bucks credit — full cash — then
    // stamp the cash flags + audit fields on exactly those rows.
    await settleItemsPaid(clerkUserId, items, feePct, taxPct, null, 0, "PAID");
    await prisma.payment.updateMany({
      where: { itemId: { in: items.map((i) => i.id) }, clerkUserId },
      data: { paidInCash: true, paidAt: new Date(), markedPaidBy: adminId, cashNote: note },
    });

    // Flow the items into pickup / preferred-location transfer like a normal paid win.
    await autoAttachPaidItems(clerkUserId, orgId);

    const hammerTotal = items.reduce((s, i) => s + i.bid, 0);
    const cashCollected =
      Math.round((hammerTotal * (1 + feePct / 100) * (1 + taxPct / 100)) * 100) / 100;
    return NextResponse.json({ success: true, paid: items.length, hammerTotal, cashCollected });
  } catch (error) {
    console.error("[admin/mark-cash-paid POST]:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
