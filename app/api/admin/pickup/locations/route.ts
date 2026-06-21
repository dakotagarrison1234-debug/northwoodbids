export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

// GET /api/admin/pickup/locations — list this org's pickup locations (with windows)
export async function GET() {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const locations = await prisma.pickupLocation.findMany({
      where: { organizationId: membership.organizationId },
      include: {
        windows: { orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }] },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ locations });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/pickup/locations GET]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/admin/pickup/locations — create a pickup location for this org
export async function POST(request: NextRequest) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { name, address, instructions } = await request.json();
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const location = await prisma.pickupLocation.create({
      data: {
        organizationId: membership.organizationId,
        name: String(name).trim(),
        address: address ? String(address).trim() : null,
        instructions: instructions ? String(instructions).trim() : null,
      },
      include: { windows: true },
    });

    return NextResponse.json({ success: true, location });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/pickup/locations POST]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
