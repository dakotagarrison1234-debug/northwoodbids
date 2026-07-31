// One-time backfill so existing customers stop showing as "Bidder".
//
// Any BidderProfile whose `name` is blank gets filled from their Clerk account,
// preferring (in order): full name → username → the part of their email before
// the "@". Profiles that already have a name are left alone, so anyone who set
// their own name in Settings keeps it.
//
// Needs CLERK_SECRET_KEY in the environment (same key the app uses). Run:
//   node scripts/backfill-bidder-names.mjs
// Safe to run more than once.

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

// Node doesn't auto-read .env files the way the Next app does, so pull any
// missing vars (CLERK_SECRET_KEY, DATABASE_URL) from the local env files.
for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch { /* file may not exist — that's fine */ }
}

const prisma = new PrismaClient();
const CLERK_SECRET = process.env.CLERK_SECRET_KEY;

if (!CLERK_SECRET) {
  console.error(
    "Missing CLERK_SECRET_KEY — not found in the environment or in .env.local / .env.\n" +
    "Add it to .env.local (same value as in Vercel) and re-run."
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pull one Clerk user's display-worthy name, or null if nothing usable.
async function clerkName(userId) {
  const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
    headers: { Authorization: `Bearer ${CLERK_SECRET}` },
  });
  if (res.status === 404) return null; // deleted Clerk account
  if (!res.ok) throw new Error(`Clerk ${res.status} for ${userId}`);
  const u = await res.json();

  const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (u.username) return String(u.username).trim();

  const email =
    u.email_addresses?.find((e) => e.id === u.primary_email_address_id)?.email_address ||
    u.email_addresses?.[0]?.email_address ||
    "";
  const prefix = email.split("@")[0]?.trim();
  return prefix || null;
}

async function main() {
  const profiles = await prisma.bidderProfile.findMany({
    where: { OR: [{ name: null }, { name: "" }] },
    select: { clerkUserId: true },
  });

  console.log(`${profiles.length} profile(s) with no name — checking Clerk...`);

  let updated = 0;
  let skipped = 0;
  for (const p of profiles) {
    let name = null;
    try {
      name = await clerkName(p.clerkUserId);
    } catch (e) {
      console.warn(`  ! ${p.clerkUserId}: ${e.message}`);
    }
    if (!name) { skipped++; continue; }
    await prisma.bidderProfile.update({
      where: { clerkUserId: p.clerkUserId },
      data: { name },
    });
    updated++;
    await sleep(120); // stay well under Clerk's rate limit
  }

  console.log(
    `Backfill complete: named ${updated} profile(s) from Clerk; ` +
    `${skipped} had nothing usable (kept as-is).`
  );
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
