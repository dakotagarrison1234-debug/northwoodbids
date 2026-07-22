export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, getUserOrg } from "@/lib/auth";

const MAX_LEN = 480; // ~3 SMS segments — a sane ceiling for a "quick text".

/**
 * POST /api/admin/message   body: { clerkUserId, message }
 *
 * Sends a one-off custom SMS to a single bidder through the same GoHighLevel
 * webhook plumbing every automated text already uses — it just carries a message
 * the admin typed instead of a pre-composed one. GHL owns actual delivery and
 * opt-out/STOP handling.
 *
 * OWNER/ADMIN only: this reaches real customers' phones, so it's not a plain-staff
 * action. Awaited (not fire-and-forget) so the admin gets a real success/failure —
 * a "message sent" that silently didn't is worse than an error.
 */
export async function POST(req: NextRequest) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await requireRole(membership.organizationId, ["OWNER", "ADMIN"]))) {
    return NextResponse.json({ error: "Only owners and admins can text customers." }, { status: 403 });
  }

  const webhook = process.env.GHL_CUSTOM_SMS_WEBHOOK;
  if (!webhook) {
    return NextResponse.json(
      { error: "Texting isn't set up yet. Add GHL_CUSTOM_SMS_WEBHOOK to enable it." },
      { status: 422 }
    );
  }

  let body: { clerkUserId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const clerkUserId = String(body.clerkUserId ?? "").trim();
  const message = String(body.message ?? "").trim();
  if (!clerkUserId) return NextResponse.json({ error: "Missing recipient" }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Type a message first." }, { status: 400 });
  if (message.length > MAX_LEN) {
    return NextResponse.json({ error: `Keep it under ${MAX_LEN} characters.` }, { status: 400 });
  }

  const profile = await prisma.bidderProfile.findUnique({
    where: { clerkUserId },
    select: { name: true, email: true, phone: true },
  });
  if (!profile) return NextResponse.json({ error: "That bidder wasn't found." }, { status: 404 });
  if (!profile.phone) {
    return NextResponse.json(
      { error: "No phone number on file for this bidder — can't text them." },
      { status: 422 }
    );
  }

  const name = profile.name ?? "Bidder";

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // TOP-LEVEL email/phone/name are required, not optional decoration: GHL's
        // "Create contact" step maps from these standard keys. Sending only the
        // bidder* variants makes that step error, which in turn SKIPS the SMS —
        // the workflow reports a clean run and nothing is delivered. Every other
        // webhook in this codebase sends both shapes; this one must match.
        email: profile.email ?? "",
        phone: profile.phone,
        name,
        firstName: name.split(" ")[0] || name,
        lastName: name.split(" ").slice(1).join(" ") || "",
        event: "custom_message",
        // The admin's text goes out verbatim. No "Northwood Bids:" prefix is forced —
        // they can write it however they want.
        smsMessage: message,
        bidderEmail: profile.email ?? "",
        bidderPhone: profile.phone,
        bidderName: name,
        orgName: membership.organization?.name ?? "Northwood Bids",
      }),
    });
    if (!res.ok) {
      console.error("GHL custom SMS rejected:", res.status, await res.text().catch(() => ""));
      return NextResponse.json({ error: "The SMS provider rejected it. Try again." }, { status: 502 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("GHL custom SMS failed:", err);
    return NextResponse.json({ error: "Couldn't send. Please try again." }, { status: 500 });
  }
}
