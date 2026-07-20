export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

interface Props {
  params: Promise<{ itemId: string }>;
}

/**
 * POST /api/admin/pickup/items/[itemId]/grab   body: { grabbed: boolean }
 *
 * Ticks one item off the gather list while staff walk the warehouse. Deliberately
 * persisted rather than kept in component state: a phone locking, a page refresh,
 * or a second person helping with the same order would all wipe local checkmarks,
 * and re-walking a 20-item order because the screen reset is exactly the kind of
 * thing that makes staff stop using the tool.
 *
 * This is only a checklist. It never changes the item's real status — staging and
 * collecting are the actions that mean something.
 */
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { itemId } = await params;
    const { grabbed } = await request.json();

    // Scope to this org — an item id from elsewhere must not be touchable.
    const updated = await prisma.item.updateMany({
      where: { id: itemId, organizationId: membership.organizationId },
      data: { grabbedAt: grabbed ? new Date() : null },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, grabbed: !!grabbed });
  } catch (err) {
    console.error("[admin/pickup/items/grab]:", err);
    return NextResponse.json({ error: "Could not update that item." }, { status: 500 });
  }
}
