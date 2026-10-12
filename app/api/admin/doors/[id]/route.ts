export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";
import { lockSeamDoor, unlockSeamDoor } from "@/lib/doorLock";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/admin/doors/[id] — { name?, locationId?, active? }  assign / rename / pause
 * POST  /api/admin/doors/[id] — { action: "unlock" | "lock" }    buzz someone in from the board
 */
export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!(await requireRole(membership.organizationId, ["OWNER", "ADMIN"]))) {
      return NextResponse.json({ error: "Owner or admin only" }, { status: 403 });
    }
    const { id } = await params;
    const lock = await prisma.doorLock.findUnique({ where: { id } });
    if (!lock || lock.organizationId !== membership.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const data: { name?: string; locationId?: string | null; active?: boolean } = {};
    if (body.name !== undefined) {
      const n = String(body.name).trim().slice(0, 40);
      if (!n) return NextResponse.json({ error: "Name can't be blank" }, { status: 400 });
      data.name = n;
    }
    if (body.locationId !== undefined) {
      if (body.locationId === null || body.locationId === "") data.locationId = null;
      else {
        const loc = await prisma.pickupLocation.findUnique({ where: { id: String(body.locationId) } });
        if (!loc || loc.organizationId !== membership.organizationId) return NextResponse.json({ error: "Invalid location" }, { status: 400 });
        data.locationId = loc.id;
      }
    }
    if (body.active !== undefined) data.active = !!body.active;

    const updated = await prisma.doorLock.update({ where: { id }, data });
    return NextResponse.json({ lock: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/doors/[id] PATCH]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Props) {
  try {
    // Any team member (STAFF included) can buzz a door: the person on the pickup
    // board at 4pm is exactly who needs this. Every unlock is logged with who did it.
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const lock = await prisma.doorLock.findUnique({ where: { id } });
    if (!lock || lock.organizationId !== membership.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { action } = await request.json();
    if (action !== "unlock" && action !== "lock") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    const r = action === "unlock" ? await unlockSeamDoor(lock.seamDeviceId) : await lockSeamDoor(lock.seamDeviceId);
    if (!r.ok) return NextResponse.json({ error: r.error ?? "The lock didn't respond." }, { status: 502 });
    console.info(`[doors] ${action} ${lock.name} by ${membership.clerkUserId}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/doors/[id] POST]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
