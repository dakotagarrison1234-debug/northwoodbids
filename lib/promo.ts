import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Welcome codes ("scan me, sign up, get $5 to bid").
 *
 * The code itself is reusable forever; the CLAIM is what's limited:
 *   - one claim per account (unique on promoCodeId + clerkUserId)
 *   - one claim per phone number (unique on promoCodeId + phoneKey)
 *   - only for new bidders (nobody who has already paid for something)
 *   - the code must be active, not expired, and under its cap
 * The claim writes a CreditLedger row — the same Bid Bucks referral credit uses —
 * so it's spent automatically on the first bill of $5+ with no new checkout code.
 */

export const PROMO_COOKIE = "nb_promo";

export function normalizeCode(raw: string): string {
  return (raw || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

/** Last 10 digits of a phone — the "same person" key. */
export function phoneKeyOf(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D+/g, "");
  if (d.length < 7) return null;
  return d.slice(-10);
}

export type ClaimResult =
  | { ok: true; amount: number; code: string; label: string }
  | { ok: false; reason: "invalid" | "inactive" | "expired" | "capped" | "no_phone" | "already" | "phone_used" | "not_new"; terminal: boolean };

export async function claimPromo(clerkUserId: string, rawCode: string): Promise<ClaimResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, reason: "invalid", terminal: true };

  const promo = await prisma.promoCode.findUnique({ where: { code } });
  if (!promo) return { ok: false, reason: "invalid", terminal: true };
  if (!promo.active) return { ok: false, reason: "inactive", terminal: true };
  if (promo.expiresAt && promo.expiresAt < new Date()) return { ok: false, reason: "expired", terminal: true };

  // Needs a phone on the profile — that's the real one-per-person key. Not
  // terminal: registration finishes a moment later and the claimer retries.
  const profile = await prisma.bidderProfile.findUnique({ where: { clerkUserId }, select: { phone: true, blocked: true } });
  const phoneKey = phoneKeyOf(profile?.phone);
  if (!profile || !phoneKey) return { ok: false, reason: "no_phone", terminal: false };
  if (profile.blocked) return { ok: false, reason: "invalid", terminal: true };

  // Established buyers can't claim a welcome credit.
  const priorPaid = await prisma.payment.count({ where: { clerkUserId, status: "PAID", comped: false } });
  if (priorPaid > 0) return { ok: false, reason: "not_new", terminal: true };

  // Already claimed on this account or this phone?
  const dupe = await prisma.promoClaim.findFirst({
    where: { promoCodeId: promo.id, OR: [{ clerkUserId }, { phoneKey }] },
    select: { clerkUserId: true },
  });
  if (dupe) return { ok: false, reason: dupe.clerkUserId === clerkUserId ? "already" : "phone_used", terminal: true };

  // Cap check + grant, atomically per code (advisory lock so two scans can't both
  // squeeze through the cap or double-grant).
  try {
    const amount = Number(promo.amount);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`promo:${promo.id}`}))`;
      if (promo.maxClaims != null) {
        const used = await tx.promoClaim.count({ where: { promoCodeId: promo.id } });
        if (used >= promo.maxClaims) throw new Error("CAPPED");
      }
      const ledger = await tx.creditLedger.create({
        data: { clerkUserId, amount, reason: `promo:${promo.code}` },
      });
      await tx.promoClaim.create({
        data: { promoCodeId: promo.id, clerkUserId, phoneKey, ledgerId: ledger.id },
      });
    });
    console.info(`[promo] ${promo.code} claimed by ${clerkUserId} (+$${amount})`);
    return { ok: true, amount, code: promo.code, label: promo.label };
  } catch (e) {
    if (e instanceof Error && e.message === "CAPPED") return { ok: false, reason: "capped", terminal: true };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, reason: "already", terminal: true };
    }
    throw e;
  }
}

/** Total welcome credit ever granted to a user (for the /refer page). */
export async function promoCreditFor(clerkUserId: string): Promise<{ total: number; labels: string[] }> {
  const rows = await prisma.creditLedger.findMany({
    where: { clerkUserId, reason: { startsWith: "promo:" } },
    select: { amount: true, reason: true },
  });
  return {
    total: rows.reduce((s, r) => s + Number(r.amount), 0),
    labels: [...new Set(rows.map((r) => r.reason.replace(/^promo:/, "")))],
  };
}
