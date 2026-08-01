import { prisma } from "@/lib/prisma";
import { BUSINESS_TZ, formatDateTime } from "@/lib/format";

/**
 * Pickup-appointment alerts to the TEAM (you). Reuses the SAME GHL webhook the
 * transfer team alerts use (GHL_TRANSFER_REQUESTED_WEBHOOK) — blank contact so
 * GHL routes it to the workflow's staff recipient — so no new GHL setup needed.
 *
 * Two triggers:
 *  1. notifyAppointmentBooked — fires the moment a customer books a pickup.
 *  2. sendAppointmentsDigest  — one morning summary of the day's pickups (cron).
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://northwoodbids.com";

// Post a team alert through the shared transfer webhook. Blank contact fields =
// route to the staff recipient configured in the GHL workflow.
async function postTeamAlert(event: string, smsMessage: string, extra: Record<string, unknown> = {}) {
  if (!process.env.GHL_TRANSFER_REQUESTED_WEBHOOK) return;
  try {
    await fetch(process.env.GHL_TRANSFER_REQUESTED_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "", phone: "", name: "Team", firstName: "Team", lastName: "",
        event,
        smsMessage,
        ...extra,
      }),
    });
  } catch (err) {
    console.error(`GHL ${event} webhook failed:`, err);
  }
}

const timeOf = (d: Date) =>
  d.toLocaleTimeString("en-US", { timeZone: BUSINESS_TZ, hour: "numeric", minute: "2-digit" });

/**
 * Real-time: a customer just booked a pickup. Fire-and-forget — safe to call
 * without awaiting.
 */
export async function notifyAppointmentBooked(appointmentId: string): Promise<void> {
  const appt = await prisma.pickupAppointment.findUnique({
    where: { id: appointmentId },
    include: {
      location: { select: { name: true } },
      items: { select: { id: true } },
    },
  });
  if (!appt) return;

  const profile = await prisma.bidderProfile.findUnique({
    where: { clerkUserId: appt.clerkUserId },
    select: { name: true, email: true, phone: true },
  });
  const who = profile?.name || profile?.email || "A customer";
  const n = appt.items.length;
  const loc = appt.location?.name ? ` at ${appt.location.name}` : "";

  await postTeamAlert(
    "appointment_booked",
    `New pickup booked: ${who} — ${n} item${n !== 1 ? "s" : ""}${loc}, ${formatDateTime(appt.startsAt)}. ${APP_URL}/admin/pickup`,
    { itemCount: n, when: appt.startsAt.toISOString(), location: appt.location?.name ?? null }
  );
}

// UTC instants for the start and end of "today" in the business timezone.
function businessDayRange(now: Date): { start: Date; end: Date; label: string } {
  // Today's Y-M-D as seen in the business tz.
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ }).format(now); // "2026-08-01"
  const [y, m, d] = ymd.split("-").map(Number);

  // How far ahead of UTC the business tz is right now (handles EST/EDT).
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(now).reduce<Record<string, string>>((a, p) => { a[p.type] = p.value; return a; }, {});
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMs = asUTC - now.getTime();

  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMs);
  const end = new Date(start.getTime() + 86_400_000);
  const label = now.toLocaleDateString("en-US", { timeZone: BUSINESS_TZ, weekday: "short", month: "short", day: "numeric" });
  return { start, end, label };
}

/** True when it is currently the given hour (0–23) in the business timezone. */
export function isBusinessHour(hour: number, now: Date = new Date()): boolean {
  const h = Number(now.toLocaleString("en-US", { timeZone: BUSINESS_TZ, hour: "numeric", hour12: false }));
  return h === hour;
}

/**
 * Morning digest: one text listing every pickup scheduled for today. Sends even
 * when there are none, so the 8am text is a reliable daily heads-up.
 */
export async function sendAppointmentsDigest(): Promise<{ sent: boolean; count: number }> {
  const { start, end, label } = businessDayRange(new Date());

  const appts = await prisma.pickupAppointment.findMany({
    where: { status: "SCHEDULED", startsAt: { gte: start, lt: end } },
    orderBy: { startsAt: "asc" },
    include: {
      location: { select: { name: true } },
      items: { select: { id: true } },
    },
  });

  const count = appts.length;

  if (count === 0) {
    await postTeamAlert("appointments_digest", `Good morning! No pickups booked for today (${label}).`, { count: 0 });
    return { sent: true, count: 0 };
  }

  // Names for the day's bidders.
  const ids = [...new Set(appts.map((a) => a.clerkUserId))];
  const profiles = await prisma.bidderProfile.findMany({
    where: { clerkUserId: { in: ids } },
    select: { clerkUserId: true, name: true, email: true },
  });
  const nameBy = new Map(profiles.map((p) => [p.clerkUserId, p.name || p.email || "Bidder"]));

  const lines = appts.slice(0, 12).map((a) => {
    const n = a.items.length;
    const loc = a.location?.name ? `, ${a.location.name}` : "";
    return `• ${timeOf(a.startsAt)} ${nameBy.get(a.clerkUserId) ?? "Bidder"} (${n} item${n !== 1 ? "s" : ""}${loc})`;
  });
  const more = count > 12 ? `\n+${count - 12} more` : "";

  const sms =
    `Good morning! ${count} pickup${count !== 1 ? "s" : ""} booked for today (${label}):\n` +
    lines.join("\n") + more +
    `\n${APP_URL}/admin/pickup`;

  await postTeamAlert("appointments_digest", sms, { count });
  return { sent: true, count };
}
