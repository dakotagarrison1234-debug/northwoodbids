export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

interface Props {
  params: Promise<{ id: string }>;
}

// PATCH /api/admin/pickup/transfers/[id] — mark a transfer COMPLETED or CANCELLED
export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const transfer = await prisma.transferRequest.findUnique({ where: { id } });
    if (!transfer || transfer.organizationId !== membership.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { status } = await request.json();
    if (!["COMPLETED", "CANCELLED"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    if (status === "COMPLETED") {
      // Items have arrived: set their home location to the destination, detach transfer.
      await prisma.item.updateMany({
        where: { transferRequestId: id },
        data: { locationId: transfer.toLocationId, transferRequestId: null },
      });
      await prisma.transferRequest.update({
        where: { id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    } else {
      // Cancelled: detach items, leaving their home location unchanged.
      await prisma.item.updateMany({
        where: { transferRequestId: id },
        data: { transferRequestId: null },
      });
      await prisma.transferRequest.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/pickup/transfers/[id] PATCH]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
