// One-off: grant a user the same OWNER access as an existing owner.
//
// Usage (from the project root, where your .env has DATABASE_URL / DIRECT_URL):
//   node scripts/grant-owner.mjs
//
// Optional overrides:
//   TARGET_EMAIL=goldenpawskennel@mail.com   (who to upgrade — looked up by profile email)
//   TARGET_CLERK_ID=user_xxx                 (use if the email isn't on file yet)
//   REFERENCE_OWNER_ID=user_3FXuFWD96qgL4BXm5VJuzk00Gai  (whose org/access to match)
//
// It finds the org from the reference owner, finds the target's Clerk id from
// their bidder profile (or uses TARGET_CLERK_ID), then upserts an OWNER membership.
// Safe to run more than once.

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const REFERENCE_OWNER_ID = process.env.REFERENCE_OWNER_ID || "user_3FXuFWD96qgL4BXm5VJuzk00Gai";
const TARGET_EMAIL = process.env.TARGET_EMAIL || "goldenpawskennel@mail.com";
const TARGET_CLERK_ID = process.env.TARGET_CLERK_ID || "";

async function main() {
  // 1) Find the org. Prefer the reference owner's org; otherwise fall back to the
  //    single business org (this is a single-business deployment, so there's one).
  let organizationId;
  const ref = await prisma.orgMember.findFirst({ where: { clerkUserId: REFERENCE_OWNER_ID } });
  if (ref) {
    organizationId = ref.organizationId;
    console.log(`Reference owner is ${ref.role} of org ${organizationId}.`);
  } else {
    const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
    if (!org) throw new Error("No organization exists yet — open the admin once to create the business.");
    organizationId = org.id;
    console.log(`Reference owner has no membership row; using the business org "${org.name}" (${org.id}).`);
  }

  // 2) Resolve the target's Clerk id.
  let clerkUserId = TARGET_CLERK_ID;
  if (!clerkUserId) {
    let prof = await prisma.bidderProfile.findFirst({
      where: { email: { equals: TARGET_EMAIL, mode: "insensitive" } },
      select: { clerkUserId: true, email: true },
    });
    if (!prof) {
      // Forgiving fallback (e.g. mail.com vs gmail.com typo).
      prof = await prisma.bidderProfile.findFirst({
        where: { email: { contains: "goldenpawskennel", mode: "insensitive" } },
        select: { clerkUserId: true, email: true },
      });
      if (prof) console.log(`Matched by partial email: ${prof.email}`);
    }
    if (!prof) {
      throw new Error(
        `No bidder profile found for "${TARGET_EMAIL}". ` +
        `Grab her Clerk id from the Clerk dashboard and re-run with TARGET_CLERK_ID=user_xxx`
      );
    }
    clerkUserId = prof.clerkUserId;
  }

  // 3) Upsert an OWNER membership in that org.
  const member = await prisma.orgMember.upsert({
    where: { clerkUserId_organizationId: { clerkUserId, organizationId } },
    update: { role: "OWNER" },
    create: { clerkUserId, organizationId, role: "OWNER" },
  });

  console.log(`✅ ${clerkUserId} is now OWNER of org ${organizationId} (member ${member.id}).`);
}

main()
  .catch((e) => { console.error("❌", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
