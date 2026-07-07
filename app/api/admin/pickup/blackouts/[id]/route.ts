export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

interface Props {
  params: Promise<{ id: string }>;
}

// DELETE /api/admin/pickup/blackouts/[id] — remove a block-off date range
export async function DELETE(_request: NextRequest, { params }: Props) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const blackout = await prisma.pickupBlackout.findUnique({
      where: { id },
      include: { location: { select: { organizationId: true } } },
    });
    if (!blackout || blackout.location.organizationId !== membership.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.pickupBlackout.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/pickup/blackouts/[id] DELETE]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
