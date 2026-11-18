import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { BUSINESS_TZ } from "@/lib/format";
import { APP_URL } from "@/lib/paymentNotify";

/**
 * Self-serve pickup doors — Schlage Encode Plus locks driven through Seam.
 *
 * The idea: when a customer books a pickup at a location that has smart locks,
 * they get ONE PIN that works on EVERY active lock there, all day on their pickup
 * date. It's texted at booking, shown on /pickup and on the admin board, moves
 * when they reschedule, and is pulled off the locks the moment the order is
 * collected or the appointment is cancelled.
 *
 * Seam does the heavy lifting (Schlage account link, programming the keypad,
 * removing the code when it expires). We talk to its REST API directly — no SDK
 * dependency — with `SEAM_API_KEY`. Nothing here throws into the booking path:
 * every public function swallows Seam errors, logs them, and leaves the
 * appointment usable without a code (staff can still let someone in).
 *
 * Env:
 *   SEAM_API_KEY          — production workspace key (sandbox keys only see fake locks)
 *   SEAM_WEBHOOK_SECRET   — optional; verifies Seam → /api/webhooks/seam events
 */

const SEAM_BASE = "https://connect.getseam.com";

/** The code works from this hour (local) on the pickup date until midnight.
 *  0 = the whole day, midnight to midnight, so self-serve pickup is truly any time. */
export const DOOR_CODE_DAY_START_HOUR = 0;

export function seamConfigured(): boolean {
  return !!process.env.SEAM_API_KEY;
}

export type SeamDevice = {
  device_id: string;
  device_type: string;
  display_name?: string;
  capabilities_supported?: string[];
  can_remotely_unlock?: boolean;
  can_program_online_access_codes?: boolean;
  properties: {
    name?: string;
    online?: boolean;
    locked?: boolean;
    battery_level?: number;
    manufacturer?: string;
    model?: { display_name?: string };
    schlage_metadata?: { device_name?: string; access_code_length?: number };
  };
  errors?: { error_code: string; message: string }[];
  warnings?: { warning_code: string; message: string }[];
};

export type SeamAccessCode = {
  access_code_id: string;
  device_id: string;
  code: string | null;
  name: string | null;
  status?: "setting" | "set" | "unset" | "removing" | "unknown";
  display_status?: string;
  starts_at?: string | null;
  ends_at?: string | null;
  errors?: { error_code: string; message: string }[];
  pending_mutations?: { mutation_code: string }[];
};

class SeamError extends Error {
  constructor(message: string, public status: number, public body: string) {
    super(message);
  }
}

async function seam<T>(path: string, body: Record<string, unknown> = {}, method: "POST" | "PUT" = "POST"): Promise<T> {
  const key = process.env.SEAM_API_KEY;
  if (!key) throw new SeamError("SEAM_API_KEY is not set", 0, "");
  const res = await fetch(`${SEAM_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `Seam ${path} returned ${res.status}`;
    try {
      const j = JSON.parse(text) as { error?: { message?: string; type?: string } };
      if (j.error?.message) msg += `: ${j.error.message}`;
    } catch {
      /* raw body below */
    }
    throw new SeamError(msg, res.status, text);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// ─── Devices ────────────────────────────────────────────────────────────────

export async function listSeamLocks(): Promise<SeamDevice[]> {
  const r = await seam<{ devices: SeamDevice[] }>("/devices/list", {});
  return (r.devices ?? []).filter((d) => (d.capabilities_supported ?? []).includes("lock") || d.device_type.endsWith("_lock"));
}

export async function getSeamDevice(deviceId: string): Promise<SeamDevice | null> {
  try {
    const r = await seam<{ device: SeamDevice }>("/devices/get", { device_id: deviceId });
    return r.device ?? null;
  } catch (e) {
    console.error("[doorLock] devices/get failed:", e);
    return null;
  }
}

/**
 * Pull every lock Seam can see into our DoorLock table. New locks land
 * unassigned (no location) so the owner picks a door for them in Settings.
 */
export async function syncLocksFromSeam(organizationId: string): Promise<{ added: number; total: number; devices: SeamDevice[] }> {
  const devices = await listSeamLocks();
  let added = 0;
  for (const d of devices) {
    const name = d.properties?.schlage_metadata?.device_name || d.properties?.name || d.display_name || "Door";
    const existing = await prisma.doorLock.findUnique({ where: { seamDeviceId: d.device_id } });
    if (!existing) {
      await prisma.doorLock.create({ data: { organizationId, seamDeviceId: d.device_id, name } });
      added++;
    }
  }
  return { added, total: devices.length, devices };
}

/** Connect Webview: the hosted page where the owner signs in to Schlage Home once. */
export async function createConnectWebview(redirectTo: string): Promise<{ url: string; id: string }> {
  const r = await seam<{ connect_webview: { connect_webview_id: string; url: string } }>("/connect_webviews/create", {
    accepted_providers: ["schlage"],
    custom_redirect_url: redirectTo,
    custom_redirect_failure_url: redirectTo,
    wait_for_device_creation: true,
  });
  return { url: r.connect_webview.url, id: r.connect_webview.connect_webview_id };
}

export async function unlockSeamDoor(deviceId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await seam("/locks/unlock_door", { device_id: deviceId });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unlock failed";
    console.error("[doorLock] unlock failed:", msg);
    return { ok: false, error: msg };
  }
}

export async function lockSeamDoor(deviceId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await seam("/locks/lock_door", { device_id: deviceId });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lock failed";
    console.error("[doorLock] lock failed:", msg);
    return { ok: false, error: msg };
  }
}

// ─── Code window ────────────────────────────────────────────────────────────

/**
 * "All day on the pickup date", in Michigan time: 12:00am → 11:59:59pm of the
 * calendar day the appointment falls on. If that start is already behind us
 * (same-day booking) the code starts now.
 */
export function doorCodeWindow(apptStartsAt: Date, now: Date = new Date()): { startsAt: Date; endsAt: Date; dayLabel: string } {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ }).format(apptStartsAt); // "2026-10-17"
  const [y, m, d] = ymd.split("-").map(Number);
  // Local wall-clock → UTC via the tz offset in effect on that date (handles EST/EDT).
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(apptStartsAt).reduce<Record<string, string>>((a, p) => { a[p.type] = p.value; return a; }, {});
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  const offsetMs = asUTC - apptStartsAt.getTime();
  let startsAt = new Date(Date.UTC(y, m - 1, d, DOOR_CODE_DAY_START_HOUR, 0, 0) - offsetMs);
  const endsAt = new Date(Date.UTC(y, m - 1, d, 23, 59, 59) - offsetMs);
  if (startsAt.getTime() < now.getTime() + 60_000) startsAt = new Date(now.getTime() + 60_000);
  const dayLabel = apptStartsAt.toLocaleDateString("en-US", { timeZone: BUSINESS_TZ, weekday: "short", month: "short", day: "numeric" });
  return { startsAt, endsAt, dayLabel };
}

// ─── Issue / move / revoke ──────────────────────────────────────────────────

type ApptForCode = {
  id: string;
  startsAt: Date;
  status: string;
  locationId: string;
  clerkUserId: string;
  doorCode: string | null;
  doorCodeIds: string[];
  location: { name: string; address: string | null; doorLocks: { id: string; seamDeviceId: string; name: string; active: boolean }[] };
};

async function loadAppt(appointmentId: string): Promise<ApptForCode | null> {
  return prisma.pickupAppointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true, startsAt: true, status: true, locationId: true, clerkUserId: true, doorCode: true, doorCodeIds: true,
      location: { select: { name: true, address: true, doorLocks: { where: { active: true }, select: { id: true, seamDeviceId: true, name: true, active: true } } } },
    },
  });
}

/** Delete codes on Seam. Returns the ids that did NOT get deleted (so nothing is ever silently left live). */
async function deleteSeamCodes(ids: string[]): Promise<string[]> {
  const failed: string[] = [];
  for (const id of ids) {
    try {
      await seam("/access_codes/delete", { access_code_id: id });
    } catch (e) {
      // 404 = already gone (expired codes are cleaned up by Seam). Anything else is kept for retry.
      if (e instanceof SeamError && e.status === 404) continue;
      console.error("[doorLock] delete failed:", e);
      failed.push(id);
    }
  }
  return failed;
}

function overallStatus(codes: SeamAccessCode[]): "pending" | "set" | "failed" {
  if (codes.some((c) => (c.errors ?? []).length > 0)) return "failed";
  if (codes.every((c) => c.status === "set" && (c.pending_mutations ?? []).length === 0)) return "set";
  return "pending";
}

/**
 * Program a fresh one-day code for this appointment on every active lock at its
 * location. Replaces any code it already had. Returns null when the location has
 * no locks or Seam isn't configured — booking proceeds normally without a code.
 */
export async function issueDoorCode(appointmentId: string): Promise<{ code: string; status: string } | null> {
  if (!seamConfigured()) return null;
  const appt = await loadAppt(appointmentId);
  if (!appt || appt.status !== "SCHEDULED") return null;
  const locks = appt.location.doorLocks;
  if (locks.length === 0) {
    if (appt.doorCodeIds.length) await revokeDoorCode(appointmentId);
    return null;
  }
  const { startsAt, endsAt, dayLabel } = doorCodeWindow(appt.startsAt);
  if (endsAt.getTime() <= Date.now() || startsAt >= endsAt) return null; // pickup date already over

  // Atomic claim so two overlapping reschedules can't both delete-and-create and
  // orphan a set of codes on the locks. Whoever loses the race just returns.
  const claimed = await prisma.pickupAppointment.updateMany({
    // A claim older than two minutes is a crashed run, not a live one — take it over.
    // doorCodeStatus is nullable, and SQL's "NOT (x = 'issuing')" is never true for
    // NULL — so a pickup that has never had a code must be matched explicitly, or a
    // fresh booking / just-staged pickup (updatedAt < 2 min) could never get one.
    where: {
      id: appointmentId,
      OR: [
        { doorCodeStatus: null },
        { doorCodeStatus: { not: "issuing" } },
        { updatedAt: { lt: new Date(Date.now() - 120_000) } },
      ],
    },
    data: { doorCodeStatus: "issuing" },
  });
  if (claimed.count === 0) return appt.doorCode ? { code: appt.doorCode, status: "pending" } : null;

  let created: SeamAccessCode[] = [];
  try {
    const leftover = appt.doorCodeIds.length ? await deleteSeamCodes(appt.doorCodeIds) : [];
    const r = await seam<{ access_codes: SeamAccessCode[] }>(
      "/access_codes/create_multiple",
      {
        device_ids: locks.map((l) => l.seamDeviceId),
        name: `Pickup ${dayLabel} ${appt.id.slice(-4).toUpperCase()}`,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        behavior_when_code_cannot_be_shared: "throw",
        prefer_native_scheduling: true,
      },
      "PUT"
    );
    const codes = r.access_codes ?? [];
    created = codes;
    const pin = codes.find((c) => c.code)?.code ?? null;
    if (!pin) throw new Error("Seam returned no PIN");
    const status = overallStatus(codes);
    if (leftover.length) console.error("[doorLock] old codes not deleted, retry queued:", leftover);
    await prisma.pickupAppointment.update({
      where: { id: appointmentId },
      // Any old ids Seam wouldn't delete are parked in doorCodeStaleIds for the sweep.
      data: { doorCode: pin, doorCodeIds: codes.map((c) => c.access_code_id), doorCodeStatus: status, doorCodeStaleIds: { push: leftover } },
    });
    return { code: pin, status };
  } catch (e) {
    console.error("[doorLock] issue failed:", e);
    // Don't strand codes Seam did create, nor the old ones we may not have deleted.
    const orphans = [...created.map((c) => c.access_code_id), ...appt.doorCodeIds];
    const stillLive = orphans.length ? await deleteSeamCodes(orphans) : [];
    await prisma.pickupAppointment.update({
      where: { id: appointmentId },
      data: { doorCode: null, doorCodeIds: [], doorCodeStatus: "failed", doorCodeStaleIds: { push: stillLive } },
    }).catch(() => {});
    return null;
  }
}

/**
 * After a reschedule. Same location → slide the existing code's window (free,
 * same PIN). Different location, or no code yet → issue a new one.
 * Returns whether the customer's code CHANGED (so the caller knows to re-text).
 */
export async function moveDoorCode(appointmentId: string, previousLocationId: string): Promise<{ code: string | null; changed: boolean }> {
  if (!seamConfigured()) return { code: null, changed: false };
  const appt = await loadAppt(appointmentId);
  if (!appt || appt.status !== "SCHEDULED") return { code: null, changed: false };
  const sameLocation = appt.locationId === previousLocationId;
  if (sameLocation && appt.doorCode && appt.doorCodeIds.length === appt.location.doorLocks.length && appt.doorCodeIds.length > 0) {
    const { startsAt, endsAt } = doorCodeWindow(appt.startsAt);
    if (endsAt.getTime() <= Date.now()) return { code: appt.doorCode, changed: false };
    try {
      for (const id of appt.doorCodeIds) {
        await seam("/access_codes/update", { access_code_id: id, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() });
      }
      await prisma.pickupAppointment.update({ where: { id: appointmentId }, data: { doorCodeStatus: "pending" } });
      return { code: appt.doorCode, changed: false };
    } catch (e) {
      console.error("[doorLock] update window failed, reissuing:", e);
    }
  }
  const r = await issueDoorCode(appointmentId);
  return { code: r?.code ?? null, changed: !!r && r.code !== appt.doorCode };
}

/**
 * A lock was just put on a location (or switched back on). Customers who already
 * have a code for an upcoming pickup there get the SAME PIN added to this lock,
 * so their code works on every door without a new code or a new text.
 * Returns how many pickups were extended. Never throws.
 */
export async function extendCodesToLock(lock: { id: string; seamDeviceId: string; locationId: string | null; active: boolean }): Promise<number> {
  if (!seamConfigured() || !lock.active || !lock.locationId) return 0;
  try {
    const startOfToday = doorCodeWindow(new Date()).startsAt; // midnight today (Michigan) or now
    const appts = await prisma.pickupAppointment.findMany({
      where: {
        locationId: lock.locationId,
        status: "SCHEDULED",
        doorCode: { not: null },
        startsAt: { gte: new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000) },
      },
      select: { id: true, startsAt: true, doorCode: true, doorCodeIds: true },
    });
    let extended = 0;
    for (const a of appts) {
      if (!a.doorCode) continue;
      // Skip pickups that already have a code on this lock.
      let onThisLock = false;
      for (const cid of a.doorCodeIds) {
        try {
          const r = await seam<{ access_code: SeamAccessCode }>("/access_codes/get", { access_code_id: cid });
          if (r.access_code?.device_id === lock.seamDeviceId) { onThisLock = true; break; }
        } catch { /* gone or unreadable — ignore */ }
      }
      if (onThisLock) continue;
      const { startsAt, endsAt, dayLabel } = doorCodeWindow(a.startsAt);
      if (endsAt.getTime() <= Date.now()) continue;
      try {
        const r = await seam<{ access_code: SeamAccessCode }>("/access_codes/create", {
          device_id: lock.seamDeviceId,
          code: a.doorCode,
          name: `Pickup ${dayLabel} ${a.id.slice(-4).toUpperCase()}`,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          prefer_native_scheduling: true,
        });
        const newId = r.access_code?.access_code_id;
        if (newId) {
          await prisma.pickupAppointment.update({
            where: { id: a.id },
            data: { doorCodeIds: { push: newId }, doorCodeStatus: "pending" },
          });
          extended++;
        }
      } catch (e) {
        console.error(`[doorLock] couldn't add pickup ${a.id}'s code to the new lock:`, e);
      }
    }
    if (extended) console.info(`[doorLock] added ${extended} existing pickup code(s) to lock ${lock.id}`);
    return extended;
  } catch (e) {
    console.error("[doorLock] extendCodesToLock failed:", e);
    return 0;
  }
}

/** Pull the code off the locks and clear it. Safe to call when there's nothing to revoke. */
export async function revokeDoorCode(appointmentId: string): Promise<void> {
  const appt = await prisma.pickupAppointment.findUnique({
    where: { id: appointmentId },
    select: { doorCodeIds: true, doorCode: true },
  });
  if (!appt || (!appt.doorCode && appt.doorCodeIds.length === 0)) return;
  const failed = seamConfigured() ? await deleteSeamCodes(appt.doorCodeIds) : appt.doorCodeIds;
  await prisma.pickupAppointment.update({
    where: { id: appointmentId },
    // A delete Seam refused is parked in doorCodeStaleIds so the sweep retries it —
    // a PIN must never be live with no trace of it.
    data: { doorCode: null, doorCodeIds: [], doorCodeStatus: null, doorCodeStaleIds: { push: failed } },
  }).catch(() => {});
}

/**
 * Cron sweep: retry any delete Seam refused earlier. Cheap (usually zero rows);
 * runs every few minutes alongside the other crons.
 */
export async function retryFailedDoorRevokes(): Promise<number> {
  if (!seamConfigured()) return 0;
  const rows = await prisma.pickupAppointment.findMany({
    where: { doorCodeStaleIds: { isEmpty: false } },
    select: { id: true, doorCodeStaleIds: true },
    take: 50,
  });
  let cleared = 0;
  for (const r of rows) {
    const failed = await deleteSeamCodes(r.doorCodeStaleIds);
    await prisma.pickupAppointment.update({ where: { id: r.id }, data: { doorCodeStaleIds: failed } }).catch(() => {});
    if (failed.length === 0) cleared++;
  }
  return cleared;
}

/** Bulk form for the places that cancel several appointments at once. Fire-and-forget. */
export async function revokeDoorCodesFor(appointmentIds: string[]): Promise<void> {
  for (const id of appointmentIds) {
    await revokeDoorCode(id).catch((e) => console.error("[doorLock] revoke failed:", e));
  }
}

/** Ask Seam how the programming went and store the answer. */
export async function refreshDoorCodeStatus(appointmentId: string): Promise<string | null> {
  if (!seamConfigured()) return null;
  const appt = await prisma.pickupAppointment.findUnique({ where: { id: appointmentId }, select: { doorCodeIds: true } });
  if (!appt || appt.doorCodeIds.length === 0) return null;
  const codes: SeamAccessCode[] = [];
  for (const id of appt.doorCodeIds) {
    try {
      const r = await seam<{ access_code: SeamAccessCode }>("/access_codes/get", { access_code_id: id });
      if (r.access_code) codes.push(r.access_code);
    } catch (e) {
      console.error("[doorLock] access_codes/get failed:", e);
    }
  }
  if (codes.length === 0) return null;
  const status = overallStatus(codes);
  await prisma.pickupAppointment.update({ where: { id: appointmentId }, data: { doorCodeStatus: status } });
  return status;
}

// ─── Customer text ──────────────────────────────────────────────────────────

const timeOf = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: BUSINESS_TZ, hour: "numeric", minute: "2-digit" });

/** "the back door" / "the side door or back door" — the doors a code opens. */
function doorList(doorNames: string[]): string {
  return doorNames.length === 0 ? "the door" : `the ${doorNames.map((n) => n.toLowerCase()).join(" or ")}`;
}

/** The keypad how-to for /pickup (the code itself is shown big right above it). The doors lock themselves. */
export function doorHowTo(doorNames: string[]): string {
  return `Tap the keypad on ${doorList(doorNames)}, then enter your code.`;
}

/**
 * Text the customer their code (booked / moved / resend). Goes through the
 * verbatim-SMS webhook the admin "Text" button uses, so there's no new GHL work.
 */
export async function textDoorCode(appointmentId: string, reason: "booked" | "moved" | "resend" = "booked"): Promise<boolean> {
  const hook = process.env.GHL_CUSTOM_SMS_WEBHOOK;
  if (!hook) return false;
  const appt = await loadAppt(appointmentId);
  if (!appt || !appt.doorCode) return false;
  const profile = await prisma.bidderProfile.findUnique({
    where: { clerkUserId: appt.clerkUserId },
    select: { email: true, phone: true, name: true },
  });
  if (!profile?.phone) return false;

  const { dayLabel } = doorCodeWindow(appt.startsAt);
  // Short and to the point: when, where, the code once, which door. The doors auto-lock.
  const where = appt.location.address ? `${appt.location.name}, ${appt.location.address}` : appt.location.name;
  const lead = reason === "booked" ? "Pickup booked" : reason === "moved" ? "Pickup moved" : "Your pickup";
  const sms =
    `Northwood Bids: ${lead}: ${dayLabel}, ${timeOf(appt.startsAt)} at ${where}. ` +
    `Door code ${appt.doorCode}, works all day on ${doorList(appt.location.doorLocks.map((l) => l.name))}. ` +
    `Your spot: ${APP_URL}/pickup`;

  const name = profile.name ?? "Bidder";
  try {
    const res = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: profile.email ?? "",
        phone: profile.phone,
        name,
        firstName: name.split(" ")[0] || name,
        lastName: name.split(" ").slice(1).join(" ") || "",
        event: "door_code",
        smsMessage: sms,
        bidderEmail: profile.email ?? "",
        bidderPhone: profile.phone,
        bidderName: name,
        doorCode: appt.doorCode,
        pickupAt: appt.startsAt.toISOString(),
        location: appt.location.name,
      }),
    });
    if (!res.ok) {
      console.error("[doorLock] door_code SMS rejected:", res.status);
      return false;
    }
    await prisma.pickupAppointment.update({ where: { id: appointmentId }, data: { doorCodeSentAt: new Date() } }).catch(() => {});
    return true;
  } catch (e) {
    console.error("[doorLock] door_code SMS failed:", e);
    return false;
  }
}

/**
 * Settings → Doors "Send test code": a real PIN on ONE lock, good for the next
 * hour, texted to the staff member who asked (no appointment needed). Seam
 * removes it from the lock when the hour is up. Costs one Seam credit.
 */
export async function issueTestDoorCode(
  lock: { seamDeviceId: string; name: string },
  clerkUserId: string
): Promise<{ code: string; endsAt: Date; texted: boolean }> {
  const startsAt = new Date(Date.now() + 60_000);
  const endsAt = new Date(Date.now() + 60 * 60_000);
  const r = await seam<{ access_codes: SeamAccessCode[] }>(
    "/access_codes/create_multiple",
    {
      device_ids: [lock.seamDeviceId],
      name: `Test ${timeOf(startsAt)}`,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      behavior_when_code_cannot_be_shared: "throw",
      prefer_native_scheduling: true,
    },
    "PUT"
  );
  const code = (r.access_codes ?? []).find((c) => c.code)?.code;
  if (!code) throw new Error("Seam returned no PIN");

  let texted = false;
  const hook = process.env.GHL_CUSTOM_SMS_WEBHOOK;
  const profile = await prisma.bidderProfile.findUnique({ where: { clerkUserId }, select: { email: true, phone: true, name: true } });
  if (hook && profile?.phone) {
    const name = profile.name ?? "Team";
    const sms = `Northwood Bids TEST: door code ${code}, works on ${doorList([lock.name])} until ${timeOf(endsAt)}.`;
    try {
      const res = await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: profile.email ?? "", phone: profile.phone, name,
          firstName: name.split(" ")[0] || name, lastName: name.split(" ").slice(1).join(" ") || "",
          event: "door_code", smsMessage: sms,
          bidderEmail: profile.email ?? "", bidderPhone: profile.phone, bidderName: name,
          doorCode: code, pickupAt: startsAt.toISOString(), location: lock.name,
        }),
      });
      texted = res.ok;
    } catch (e) {
      console.error("[doorLock] test code SMS failed:", e);
    }
  }
  return { code, endsAt, texted };
}

/** Booking helper: issue + text, never throws. Used by the customer booking route. */
export async function issueAndTextDoorCode(appointmentId: string, reason: "booked" | "moved" = "booked"): Promise<void> {
  try {
    const r = await issueDoorCode(appointmentId);
    if (r) await textDoorCode(appointmentId, reason);
  } catch (e) {
    console.error("[doorLock] issueAndText failed:", e);
  }
}

// ─── Auto-collect after the code is used ────────────────────────────────────

/** Minutes after a customer's code opens the door before the pickup auto-completes. */
export const AUTO_COLLECT_AFTER_MIN = 10;

/**
 * Pickups whose door code was used at least AUTO_COLLECT_AFTER_MIN minutes ago
 * become COLLECTED exactly like staff's "Order picked up" / the customer's own
 * "I picked up my order": items PICKED_UP, staged spot freed, code pulled off the
 * locks. Atomic per appointment, so a staff tap at the same moment can't double up.
 */
export async function autoCollectUsedPickups(now: Date = new Date()): Promise<number> {
  const due = await prisma.pickupAppointment.findMany({
    where: { status: "SCHEDULED", doorCodeUsedAt: { lte: new Date(now.getTime() - AUTO_COLLECT_AFTER_MIN * 60_000) } },
    select: { id: true },
    take: 50,
  });
  let done = 0;
  for (const { id } of due) {
    try {
      const claimed = await prisma.pickupAppointment.updateMany({
        where: { id, status: "SCHEDULED" },
        data: { status: "COLLECTED", stagedSpot: null, stagedAt: null },
      });
      if (claimed.count === 0) continue;
      await prisma.item.updateMany({
        where: { pickupAppointmentId: id },
        data: { status: "PICKED_UP", pickedUpAt: new Date(), grabbedAt: null },
      });
      await revokeDoorCode(id).catch((e) => console.error("[doorLock] revoke after auto-collect failed:", e));
      done++;
      console.info(`[doorLock] auto-collected pickup ${id} (door code used)`);
    } catch (e) {
      console.error("[doorLock] auto-collect failed:", id, e);
    }
  }
  return done;
}

// ─── Seam webhook (Svix signature) ──────────────────────────────────────────

/**
 * Seam signs webhooks the Svix way: HMAC-SHA256 over "{id}.{timestamp}.{body}"
 * with the base64 secret after "whsec_", compared against any of the
 * space-separated "v1,<sig>" entries in the svix-signature header.
 */
export function verifySeamWebhook(rawBody: string, headers: { id: string | null; timestamp: string | null; signature: string | null }): boolean {
  const secret = process.env.SEAM_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: an unsigned endpoint could be used to spam the team-alert text.
    console.warn("[doorLock] SEAM_WEBHOOK_SECRET not set; ignoring Seam webhook");
    return false;
  }
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${rawBody}`).digest("base64");
  return headers.signature.split(" ").some((part) => {
    const [, sig] = part.split(",");
    if (!sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

/**
 * Handle one Seam event. We only care about access-code programming outcomes
 * (to show "ready" / "failed" on the board) and lock health (offline, low battery)
 * which we pass back so the route can alert the team.
 */
export async function handleSeamEvent(evt: { event_type: string; access_code_id?: string; device_id?: string; battery_level?: number }): Promise<string | null> {
  const t = evt.event_type;
  // A customer's code opened a door: stamp the pickup (first use only). The
  // door-pickups cron marks it collected 10 minutes later.
  if (t === "lock.unlocked" && evt.access_code_id) {
    await prisma.pickupAppointment.updateMany({
      where: { status: "SCHEDULED", doorCodeIds: { has: evt.access_code_id }, doorCodeUsedAt: null },
      data: { doorCodeUsedAt: new Date() },
    });
    return null;
  }
  if (t.startsWith("access_code.") && evt.access_code_id) {
    const appt = await prisma.pickupAppointment.findFirst({
      where: { doorCodeIds: { has: evt.access_code_id } },
      select: { id: true, clerkUserId: true, startsAt: true },
    });
    if (!appt) return null;
    if (t === "access_code.failed_to_set_on_device" || t === "access_code.delay_in_setting_on_device") {
      await prisma.pickupAppointment.update({ where: { id: appt.id }, data: { doorCodeStatus: t.includes("failed") ? "failed" : "pending" } });
      if (t.includes("failed")) {
        const p = await prisma.bidderProfile.findUnique({ where: { clerkUserId: appt.clerkUserId }, select: { name: true } });
        const { dayLabel } = doorCodeWindow(appt.startsAt);
        return `Door code FAILED to program for ${p?.name ?? "a customer"}'s pickup on ${dayLabel}. Check the lock is online, then use "New code" on the board. ${APP_URL}/admin/pickup`;
      }
      return null;
    }
    if (t === "access_code.set_on_device") {
      await refreshDoorCodeStatus(appt.id);
      return null;
    }
    return null;
  }
  if (t === "device.disconnected" && evt.device_id) {
    const lock = await prisma.doorLock.findUnique({ where: { seamDeviceId: evt.device_id }, select: { name: true, location: { select: { name: true } } } });
    if (lock) return `Heads up: the ${lock.name} lock${lock.location ? ` at ${lock.location.name}` : ""} went offline. Codes can't be programmed until it's back on Wi-Fi. ${APP_URL}/admin/settings/doors`;
  }
  if (t === "device.low_battery" && evt.device_id) {
    const lock = await prisma.doorLock.findUnique({ where: { seamDeviceId: evt.device_id }, select: { name: true, location: { select: { name: true } } } });
    if (lock) return `Battery low on the ${lock.name} lock${lock.location ? ` at ${lock.location.name}` : ""}. Swap the 4 AA batteries soon.`;
  }
  return null;
}
