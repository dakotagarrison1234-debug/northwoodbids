export const dynamic = "force-dynamic";
export const maxDuration = 120;
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://northwoodbids.com";

const INACTIVE_DAYS = 30; // no bid in this long → "we miss you"
const COOLOFF_DAYS = 45;  // never re-text the same person within this window
const MAX_PER_RUN = 100;  // bound GHL calls per daily run

// GET /api/cron/winback — daily re-engagement text to customers who've gone quiet.
// Only texts people who HAVE bid before (real customers), haven't bid in 30 days,
// have a phone, aren't blocked, and weren't texted in the last 45 days.
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Misconfigured: CRON_SECRET not set" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.GHL_WINBACK_WEBHOOK) {
    return NextResponse.json({ ok: true, skipped: "GHL_WINBACK_WEBHOOK not set", sent: 0 });
  }

  const now = new Date();
  const inactiveBefore = new Date(now.getTime() - INACTIVE_DAYS * 86400_000);
  const cooloffBefore = new Date(now.getTime() - COOLOFF_DAYS * 86400_000);

  // Candidates: reachable, not blocked, not recently win-backed.
  const candidates = await prisma.bidderProfile.findMany({
    where: {
      blocked: false,
      phone: { not: null },
      OR: [{ lastWinbackAt: null }, { lastWinbackAt: { lt: cooloffBefore } }],
    },
    select: { clerkUserId: true, name: true, email: true, phone: true },
    take: 1000,
  });
  if (candidates.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  // Most-recent bid per candidate — only people who've actually bid before qualify.
  const ids = candidates.map((c) => c.clerkUserId);
  const lastBids = await prisma.bid.groupBy({
    by: ["clerkUserId"],
    where: { clerkUserId: { in: ids } },
    _max: { placedAt: true },
  });
  const lastBidBy = new Map(lastBids.map((r) => [r.clerkUserId, r._max.placedAt]));

  // Inactive = has a prior bid, and it was more than 30 days ago.
  const targets = candidates
    .filter((c) => {
      const last = lastBidBy.get(c.clerkUserId);
      return last != null && last < inactiveBefore;
    })
    .slice(0, MAX_PER_RUN);

  if (targets.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const browseUrl = `${APP_URL}/auctions`;
  const results = await Promise.allSettled(
    targets.map((t) => {
      const name = t.name || "there";
      const first = name.split(" ")[0] || name;
      const smsMessage =
        `Hi ${first}! We miss you at Northwood Bids. It's been a while — ` +
        `come see what's up for auction this week and grab a deal: ${browseUrl}. Hope to see you back soon!`;
      return fetch(process.env.GHL_WINBACK_WEBHOOK!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: t.email || "",
          phone: t.phone || "",
          name,
          firstName: first,
          lastName: name.split(" ").slice(1).join(" ") || "",
          event: "winback",
          smsMessage,
          browseUrl,
          orgName: "Northwood Bids",
        }),
      });
    })
  );

  // Stamp everyone we attempted so we honor the cool-off even if a send hiccups.
  const sentIds = targets.map((t) => t.clerkUserId);
  await prisma.bidderProfile.updateMany({
    where: { clerkUserId: { in: sentIds } },
    data: { lastWinbackAt: now },
  });

  const ok = results.filter((r) => r.status === "fulfilled").length;
  return NextResponse.json({ ok: true, sent: ok, attempted: targets.length });
}
