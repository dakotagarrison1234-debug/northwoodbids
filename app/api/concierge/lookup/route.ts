export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getBidderStatus } from "@/lib/concierge";

/**
 * POST /api/concierge/lookup   — called by the GoHighLevel bot / web widget.
 *
 * Auth: a shared secret in the `x-concierge-key` header (or `Authorization: Bearer`).
 * Reuses the existing GHL webhook secret so there's no new key to manage; a
 * dedicated CONCIERGE_API_KEY is honored too if you'd rather separate them.
 *
 * Body (JSON) or query string: { phone: "+15551234567" }
 * Returns the caller's non-financial status (see lib/concierge). Money is never
 * included. Only the passed-in phone is ever looked up.
 */
function authorized(req: NextRequest): boolean {
  const expected = process.env.CONCIERGE_API_KEY || process.env.GHL_WEBHOOK_SECRET;
  if (!expected) return false; // fail closed if nothing configured
  const header = req.headers.get("x-concierge-key");
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  return (header ?? bearer) === expected;
}

async function handle(req: NextRequest, phone: string | null) {
  if (!phone || !phone.trim()) {
    return NextResponse.json({ error: "Missing phone" }, { status: 400 });
  }
  const status = await getBidderStatus(phone.trim());
  return NextResponse.json(status);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let phone: string | null = req.nextUrl.searchParams.get("phone");
  try {
    const body = await req.json().catch(() => null);
    if (body && typeof body === "object") {
      phone = phone ?? (body.phone ?? body.Phone ?? body.from ?? body.contact_phone ?? null);
    }
  } catch {
    /* no/invalid body — fall back to query string */
  }
  return handle(req, phone);
}

// GET is handy for a quick test in the browser/GHL: /api/concierge/lookup?phone=...
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return handle(req, req.nextUrl.searchParams.get("phone"));
}
