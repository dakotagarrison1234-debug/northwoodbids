export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { autoCollectUsedPickups, seamConfigured } from "@/lib/doorLock";

// GET /api/cron/door-pickups — every 2 minutes (vercel.json).
// A customer's door code opened the door 10+ minutes ago → their pickup is
// marked picked up (items PICKED_UP, staged spot freed, code pulled).
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Misconfigured: CRON_SECRET not set" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!seamConfigured()) return NextResponse.json({ ok: true, skipped: "doors off" });
  try {
    const collected = await autoCollectUsedPickups();
    return NextResponse.json({ ok: true, collected });
  } catch (err) {
    console.error("[cron/door-pickups]:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
