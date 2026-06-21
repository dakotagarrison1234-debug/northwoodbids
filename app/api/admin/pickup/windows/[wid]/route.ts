export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

interface Props {
  params: Promise<{ wid: string }>;
}

// DELETE /api/admin/pickup/windows/[wid] — remove a window (verify via location → org)
export async function DELETE(_request: NextRequest, { params }: Props) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { wid } = await params;
    const window = await prisma.pickupWindow.findUnique({
      where: { id: wid },
      include: { location: { select: { organizationId: true } } },
    });
    if (!window || window.location.organizationId !== membership.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.pickupWindow.delete({ where: { id: wid } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/pickup/windows/[wid] DELETE]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
