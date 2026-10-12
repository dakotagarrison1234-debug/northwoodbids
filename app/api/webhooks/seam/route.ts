export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifySeamWebhook, handleSeamEvent } from "@/lib/doorLock";
import { postTeamAlert } from "@/lib/appointmentNotify";

/**
 * POST /api/webhooks/seam — Seam tells us when a door code landed on the lock
 * (or didn't), and when a lock drops offline / runs low on batteries.
 * Register this URL in the Seam console (Webhooks) and paste the signing
 * secret into SEAM_WEBHOOK_SECRET. Public route (middleware) — signature-checked.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const ok = verifySeamWebhook(raw, {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  });
  if (!ok) return NextResponse.json({ error: "Bad signature" }, { status: 401 });

  let evt: { event_type?: string; access_code_id?: string; device_id?: string; battery_level?: number };
  try {
    evt = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (!evt.event_type) return NextResponse.json({ ok: true });

  try {
    const alert = await handleSeamEvent({ event_type: evt.event_type, access_code_id: evt.access_code_id, device_id: evt.device_id, battery_level: evt.battery_level });
    if (alert) postTeamAlert("door_alert", alert).catch(() => {});
  } catch (e) {
    console.error("[webhooks/seam]:", e);
  }
  return NextResponse.json({ ok: true });
}
