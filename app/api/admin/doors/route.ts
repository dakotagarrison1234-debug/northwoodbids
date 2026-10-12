export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";
import { seamConfigured, syncLocksFromSeam, listSeamLocks, type SeamDevice } from "@/lib/doorLock";

/**
 * GET  /api/admin/doors — every lock we know about, with live status from Seam
 *                         (online / locked / battery) and which location it's on.
 * POST /api/admin/doors — { action: "sync" } pull new locks in from the Schlage account.
 */
export async function GET() {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const orgId = membership.organizationId;

    const [locks, locations] = await Promise.all([
      prisma.doorLock.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" }, include: { location: { select: { id: true, name: true } } } }),
      prisma.pickupLocation.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    ]);

    // Live status (one call) — tolerate Seam being down; the page still renders.
    let live = new Map<string, SeamDevice>();
    let seamError: string | null = null;
    if (seamConfigured()) {
      try {
        const devices = await listSeamLocks();
        live = new Map(devices.map((d) => [d.device_id, d]));
      } catch (e) {
        seamError = e instanceof Error ? e.message : "Couldn't reach Seam.";
      }
    }

    // Upcoming codes, so the page can show "3 codes out today".
    const now = new Date();
    const codesOut = await prisma.pickupAppointment.count({
      where: { organizationId: orgId, status: "SCHEDULED", doorCode: { not: null }, startsAt: { gte: new Date(now.getTime() - 86_400_000) } },
    });

    return NextResponse.json({
      configured: seamConfigured(),
      seamError,
      codesOut,
      locations,
      locks: locks.map((l) => {
        const d = live.get(l.seamDeviceId);
        return {
          id: l.id,
          name: l.name,
          active: l.active,
          seamDeviceId: l.seamDeviceId,
          locationId: l.location?.id ?? null,
          locationName: l.location?.name ?? null,
          online: d?.properties?.online ?? null,
          locked: d?.properties?.locked ?? null,
          battery: typeof d?.properties?.battery_level === "number" ? Math.round(d.properties.battery_level * 100) : null,
          model: d?.properties?.model?.display_name ?? null,
          codeLength: d?.properties?.schlage_metadata?.access_code_length ?? null,
          canProgram: d?.can_program_online_access_codes ?? null,
          issues: [...(d?.errors ?? []).map((e) => e.message), ...(d?.warnings ?? []).map((w) => w.message)],
          seen: !!d,
        };
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/doors GET]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!(await requireRole(membership.organizationId, ["OWNER", "ADMIN"]))) {
      return NextResponse.json({ error: "Owner or admin only" }, { status: 403 });
    }
    if (!seamConfigured()) return NextResponse.json({ error: "Add SEAM_API_KEY to turn doors on." }, { status: 422 });
    const { action } = await request.json().catch(() => ({ action: "sync" }));
    if (action !== "sync") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    const r = await syncLocksFromSeam(membership.organizationId);
    return NextResponse.json({ added: r.added, total: r.total });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/doors POST]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
