export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma, type OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";

/**
 * POST /api/admin/giveaways/[id]/revert   Body: { itemId }
 *
 * Undo a giveaway win — for when the wheel landed on someone who shouldn't have won.
 * Fully reverses the award (it was free, so nothing to refund): deletes the WON bid and
 * the comped $0 payment, detaches the prize from any pickup/transfer, returns it to
 * DRAFT so it's unclaimed and can be re-drawn, and puts the winner back in the wheel.
 * Blocked once the prize has been physically picked up.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;
  if (!(await requireRole(orgId, ["OWNER", "ADMIN"] as OrgRole[]))) {
    return NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 });
  }
  const { id } = await params;

  const g = await prisma.giveaway.findUnique({ where: { id }, select: { organizationId: true, status: true } });
  if (!g || g.organizationId !== orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const itemId = String(body.itemId ?? "").trim();
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { id: true, giveawayId: true, status: true, transferRequestId: true },
  });
  if (!item || item.giveawayId !== id) return NextResponse.json({ error: "Prize not found." }, { status: 404 });
  if (item.status === "PICKED_UP") {
    return NextResponse.json({ error: "This prize was already collected — handle it in person." }, { status: 409 });
  }

  // The winning bid tells us who to put back in the wheel.
  const wonBid = await prisma.bid.findFirst({ where: { itemId, status: "WON" }, select: { clerkUserId: true } });

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  // Remove the comped payment + WON bid so it's unclaimed again.
  ops.push(prisma.payment.deleteMany({ where: { itemId } }));
  ops.push(prisma.bid.deleteMany({ where: { itemId, status: "WON" } }));
  // Return the prize to unclaimed, detached from any pickup/transfer.
  ops.push(
    prisma.item.update({
      where: { id: itemId },
      data: { status: "DRAFT", pickupAppointmentId: null, transferRequestId: null, soldLocationId: null },
    })
  );
  // Cancel a transfer this item left empty (only a still-REQUESTED one).
  if (item.transferRequestId) {
    ops.push(
      prisma.transferRequest.updateMany({
        where: { id: item.transferRequestId, status: "REQUESTED", items: { none: { id: { not: itemId } } } },
        data: { status: "CANCELLED", stagedSpot: null, stagedAt: null },
      })
    );
  }
  // Put the winner back in the pool.
  if (wonBid) {
    ops.push(
      prisma.giveawayEntry.updateMany({
        where: { giveawayId: id, clerkUserId: wonBid.clerkUserId },
        data: { won: false, wonItemId: null },
      })
    );
  }
  // A completed giveaway now has an open prize again — reopen it for drawing.
  if (g.status === "DRAWN") {
    ops.push(prisma.giveaway.update({ where: { id }, data: { status: "ACTIVE" } }));
  }

  await prisma.$transaction(ops);
  return NextResponse.json({ success: true });
}
