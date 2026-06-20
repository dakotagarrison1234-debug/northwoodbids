import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessOrg } from "@/lib/auth";

interface Props {
  params: Promise<{ itemId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { itemId } = await params;
    const { status } = await request.json();

    const validStatuses = ["DRAFT", "ACTIVE", "SOLD", "UNSOLD", "PENDING_PICKUP", "PICKED_UP"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Verify org membership
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { organizationId: true, status: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (!(await canAccessOrg(item.organizationId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // State machine guard — prevent illegal backward transitions
    // PICKED_UP is terminal. PENDING_PICKUP can only go to PICKED_UP.
    // SOLD can only advance (PENDING_PICKUP). Nothing can go back to DRAFT/ACTIVE once sold.
    const allowedTransitions: Record<string, string[]> = {
      DRAFT:          ["ACTIVE", "UNSOLD"],
      ACTIVE:         ["SOLD", "UNSOLD", "DRAFT"],
      SOLD:           ["PENDING_PICKUP", "UNSOLD"],
      UNSOLD:         ["ACTIVE"],        // allow re-activation for edge cases
      PENDING_PICKUP: ["PICKED_UP"],
      PICKED_UP:      [],                // terminal state
    };
    const allowed = allowedTransitions[item.status] ?? [];
    if (!allowed.includes(status)) {
      return NextResponse.json(
        { error: `Cannot move item from ${item.status} to ${status}` },
        { status: 422 }
      );
    }

    const updated = await prisma.item.update({
      where: { id: itemId },
      data: { status },
    });

    return NextResponse.json({ success: true, item: updated });
  } catch (error) {
    console.error("Item status update error:", error);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
