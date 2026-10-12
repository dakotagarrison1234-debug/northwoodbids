export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";
import { issueDoorCode, refreshDoorCodeStatus, revokeDoorCode, seamConfigured, textDoorCode } from "@/lib/doorLock";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/admin/pickup/appointments/[id]/door — { action }
 *   "resend"  text the customer the code they already have
 *   "new"     program a fresh PIN (old one revoked) and text it
 *   "revoke"  pull the code with no replacement (e.g. a no-show you want locked out)
 *   "check"   ask Seam whether the PIN actually landed on the locks
 */
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!seamConfigured()) return NextResponse.json({ error: "Doors aren't set up (SEAM_API_KEY)." }, { status: 422 });

    const { id } = await params;
    const appt = await prisma.pickupAppointment.findUnique({ where: { id }, select: { organizationId: true, status: true, doorCode: true } });
    if (!appt || appt.organizationId !== membership.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { action } = await request.json();
    if (action === "check") {
      const status = await refreshDoorCodeStatus(id);
      const row = await prisma.pickupAppointment.findUnique({ where: { id }, select: { doorCode: true, doorCodeStatus: true } });
      return NextResponse.json({ doorCode: row?.doorCode ?? null, doorCodeStatus: status ?? row?.doorCodeStatus ?? null });
    }
    if (action === "revoke") {
      await revokeDoorCode(id);
      return NextResponse.json({ doorCode: null, doorCodeStatus: null });
    }
    if (appt.status !== "SCHEDULED") return NextResponse.json({ error: "Only scheduled pickups get door codes." }, { status: 409 });
    if (action === "new") {
      const r = await issueDoorCode(id);
      if (!r) return NextResponse.json({ error: "Couldn't program a code. Is a lock assigned to this location and online?" }, { status: 502 });
      const sent = await textDoorCode(id, "booked");
      return NextResponse.json({ doorCode: r.code, doorCodeStatus: r.status, sent });
    }
    if (action === "resend") {
      if (!appt.doorCode) return NextResponse.json({ error: "No code on this pickup yet — use New code." }, { status: 409 });
      const sent = await textDoorCode(id, "resend");
      if (!sent) return NextResponse.json({ error: "Text didn't go out (no phone on file, or texting isn't set up)." }, { status: 502 });
      return NextResponse.json({ doorCode: appt.doorCode, sent: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/pickup/appointments/[id]/door]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
