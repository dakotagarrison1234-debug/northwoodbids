import { prisma } from "@/lib/prisma";
import { engagedBidderProfiles, runPooled } from "@/lib/closeAuction";

/**
 * "Text a group" — one message to a chosen slice of bidders, sent through the same
 * GoHighLevel webhook the auction-started blast uses (the workflow reads
 * `smsMessage`). Segments are computed live so the count you see is who gets it.
 */

export type BlastSegment =
  | { kind: "everyone" }
  | { kind: "preferred"; locationId: string } // chose this warehouse as their pickup spot
  | { kind: "waiting"; locationId: string } // has paid items sitting / booked at this warehouse right now
  | { kind: "preferred_or_waiting"; locationId: string };

export type Recipient = { clerkUserId: string; name: string; phone: string; email: string };

function dedupe(list: { clerkUserId: string; name: string | null; phone: string | null; email: string | null }[]): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const p of list) {
    const phone = (p.phone ?? "").trim();
    const email = (p.email ?? "").trim();
    const key = (phone || email).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ clerkUserId: p.clerkUserId, name: p.name || "Bidder", phone, email });
  }
  return out;
}

/** Bidders who currently have something at a warehouse: a booked pickup there, or paid items waiting there. */
async function waitingAt(organizationId: string, locationId: string): Promise<Set<string>> {
  const now = new Date();
  const [appts, items] = await Promise.all([
    prisma.pickupAppointment.findMany({
      where: { organizationId, locationId, status: "SCHEDULED", startsAt: { gte: new Date(now.getTime() - 24 * 3600_000) } },
      select: { clerkUserId: true },
    }),
    prisma.item.findMany({
      where: {
        organizationId,
        status: "PENDING_PICKUP",
        OR: [
          { locationId },
          { transferRequest: { toLocationId: locationId, status: { in: ["REQUESTED", "LOADED"] } } },
        ],
      },
      select: { id: true },
    }),
  ]);
  const ids = new Set(appts.map((a) => a.clerkUserId));
  if (items.length) {
    const owners = await prisma.bid.findMany({
      where: { itemId: { in: items.map((i) => i.id) }, status: "WON" },
      select: { clerkUserId: true },
      distinct: ["clerkUserId"],
    });
    for (const o of owners) ids.add(o.clerkUserId);
  }
  return ids;
}

export async function resolveSegment(organizationId: string, seg: BlastSegment): Promise<Recipient[]> {
  if (seg.kind === "everyone") return dedupe(await engagedBidderProfiles(organizationId));

  const want = new Set<string>();
  if (seg.kind === "preferred" || seg.kind === "preferred_or_waiting") {
    const prefs = await prisma.bidderProfile.findMany({
      where: { preferredPickupLocationId: seg.locationId, blocked: false },
      select: { clerkUserId: true },
    });
    for (const p of prefs) want.add(p.clerkUserId);
  }
  if (seg.kind === "waiting" || seg.kind === "preferred_or_waiting") {
    for (const id of await waitingAt(organizationId, seg.locationId)) want.add(id);
  }
  if (want.size === 0) return [];
  const profiles = await prisma.bidderProfile.findMany({
    where: { clerkUserId: { in: [...want] }, blocked: false, NOT: [{ phone: null, email: null }] },
    select: { clerkUserId: true, name: true, phone: true, email: true },
    orderBy: { name: "asc" },
  });
  return dedupe(profiles);
}

/** Fire the message to each recipient. Returns how many the webhook accepted. */
export async function sendBlast(recipients: Recipient[], message: string, tag: string): Promise<{ sent: number; failed: number }> {
  const hook = process.env.GHL_AUCTION_STARTED_WEBHOOK;
  if (!hook) throw new Error("Texting isn't configured (GHL_AUCTION_STARTED_WEBHOOK).");
  let sent = 0;
  let failed = 0;
  await runPooled(
    recipients,
    async (r) => {
      try {
        const res = await fetch(hook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: r.email,
            phone: r.phone,
            name: r.name,
            firstName: r.name.split(" ")[0] || r.name,
            lastName: r.name.split(" ").slice(1).join(" ") || "",
            bidderEmail: r.email,
            bidderPhone: r.phone,
            bidderName: r.name,
            event: "custom_blast",
            tag,
            smsMessage: message,
          }),
        });
        if (res.ok) sent++;
        else { failed++; console.error("GHL blast webhook rejected:", res.status); }
      } catch (err) {
        failed++;
        console.error("GHL blast webhook failed:", err);
      }
    },
    8
  );
  return { sent, failed };
}
