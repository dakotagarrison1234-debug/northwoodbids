export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { sendAppointmentsDigest, isBusinessHour } from "@/lib/appointmentNotify";

// GET /api/cron/appointments-digest
// One morning text (8:00 AM Eastern) listing today's booked pickups.
//
// Vercel cron runs in UTC with no DST awareness, so this is scheduled at BOTH
// 12:00 and 13:00 UTC and we only actually send when it's the 8 o'clock hour in
// America/Detroit — that lands exactly once at 8am ET whether it's EST or EDT.
// Add ?force=1 (with the cron auth header) to send immediately for testing.
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Misconfigured: CRON_SECRET not set" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = request.nextUrl.searchParams.get("force") === "1";
  if (!force && !isBusinessHour(8)) {
    return NextResponse.json({ ok: true, skipped: "not 8am ET" });
  }

  const result = await sendAppointmentsDigest();
  return NextResponse.json({ ok: true, ...result });
}
