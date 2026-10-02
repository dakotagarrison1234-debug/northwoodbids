export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { type OrgRole } from "@prisma/client";
import { getUserOrg, requireRole } from "@/lib/auth";
import { resolveSegment, sendBlast, type BlastSegment } from "@/lib/blast";

function parseSegment(raw: unknown): BlastSegment | null {
  const s = (raw ?? {}) as { kind?: string; locationId?: string };
  if (s.kind === "everyone") return { kind: "everyone" };
  if ((s.kind === "preferred" || s.kind === "waiting" || s.kind === "preferred_or_waiting") && typeof s.locationId === "string" && s.locationId) {
    return { kind: s.kind, locationId: s.locationId };
  }
  return null;
}

async function gate() {
  const membership = await getUserOrg();
  if (!membership) return { err: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await requireRole(membership.organizationId, ["OWNER", "ADMIN"] as OrgRole[]))) {
    return { err: NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 }) };
  }
  return { orgId: membership.organizationId };
}

// GET /api/admin/blast?kind=preferred&locationId=… — preview who'd get it.
export async function GET(request: NextRequest) {
  const g = await gate();
  if ("err" in g) return g.err;
  const seg = parseSegment({ kind: request.nextUrl.searchParams.get("kind"), locationId: request.nextUrl.searchParams.get("locationId") ?? undefined });
  if (!seg) return NextResponse.json({ error: "Pick a group." }, { status: 400 });
  const recipients = await resolveSegment(g.orgId, seg);
  return NextResponse.json({
    count: recipients.length,
    withPhone: recipients.filter((r) => r.phone).length,
    sample: recipients.slice(0, 200).map((r) => ({ name: r.name, phone: r.phone ? r.phone.replace(/\d(?=\d{4})/g, "•") : "" })),
    configured: !!process.env.GHL_AUCTION_STARTED_WEBHOOK,
  });
}

// POST /api/admin/blast  Body: { segment, message, confirmCount } — send it.
export async function POST(request: NextRequest) {
  const g = await gate();
  if ("err" in g) return g.err;
  const body = await request.json().catch(() => ({}));
  const seg = parseSegment(body.segment);
  const message = String(body.message ?? "").trim();
  if (!seg) return NextResponse.json({ error: "Pick a group." }, { status: 400 });
  if (message.length < 10) return NextResponse.json({ error: "Write the message first." }, { status: 400 });
  if (message.length > 900) return NextResponse.json({ error: "Keep it under 900 characters." }, { status: 400 });

  const recipients = await resolveSegment(g.orgId, seg);
  // The admin confirmed a specific number on screen; if the group changed since,
  // make them look again rather than texting a different crowd.
  if (Number(body.confirmCount) !== recipients.length) {
    return NextResponse.json({ error: `The group changed (${recipients.length} now). Re-check and send again.`, count: recipients.length }, { status: 409 });
  }
  const tag = `blast-${Date.now()}`;
  const r = await sendBlast(recipients, message, tag);
  console.info(`[blast] ${tag} ${JSON.stringify(seg)} → sent ${r.sent}, failed ${r.failed}`);
  return NextResponse.json({ success: true, ...r, total: recipients.length });
}
