export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

interface Props {
  params: Promise<{ itemId: string }>;
}

/**
 * POST /api/admin/items/[itemId]/pickup
 * Body: { pickedUp: boolean }
 *
 * Owner/admin override of an item's collection state — independent of any
 * appointment. pickedUp=true stamps it PICKED_UP; pickedUp=false reverses it back
 * to PENDING_PICKUP. Only valid on sold items (a DRAFT/ACTIVE/UNSOLD item has no
 * pickup to toggle). Any org member — the owner is never limited here.
 */
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { itemId } = await params;
    const { pickedUp } = await request.json();

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { id: true, organizationId: true, status: true },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    if (item.organizationId !== membership.organizationId) {
      return NextResponse.json({ error: "Not your item" }, { status: 403 });
    }

    const collectable = ["SOLD", "PENDING_PICKUP", "PICKED_UP"];
    if (!collectable.includes(item.status)) {
      return NextResponse.json(
        { error: "Only a sold item can be marked picked up." },
        { status: 422 }
      );
    }

    if (pickedUp) {
      await prisma.item.update({
        where: { id: itemId },
        data: { status: "PICKED_UP", pickedUpAt: new Date(), grabbedAt: null },
      });
    } else {
      // Undo — back to awaiting pickup. Detach from any appointment so it re-flows
      // through the normal ready/gather path if the customer books again.
      await prisma.item.update({
        where: { id: itemId },
        data: { status: "PENDING_PICKUP", pickedUpAt: null },
      });
    }

    return NextResponse.json({ success: true, status: pickedUp ? "PICKED_UP" : "PENDING_PICKUP" });
  } catch (err) {
    console.error("[admin/items/[itemId]/pickup POST]:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
