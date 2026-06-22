import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import type { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";

// Block / unblock a bidder. Blocking stops bidding (enforced in the bid routes)
// and bans their Clerk account so they can no longer sign in. Owner/Admin only.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clerkUserId: string }> }
) {
  const { clerkUserId } = await params;
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireRole(membership.organizationId, ["OWNER", "ADMIN"] as OrgRole[]))) {
    return NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const blocked = !!body.blocked;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  // Record the block state on the profile (drives the bid-time block check).
  await prisma.bidderProfile.upsert({
    where: { clerkUserId },
    update: {
      blocked,
      blockedAt: blocked ? new Date() : null,
      blockedReason: blocked ? reason || null : null,
    },
    create: {
      clerkUserId,
      blocked,
      blockedAt: blocked ? new Date() : null,
      blockedReason: blocked ? reason || null : null,
    },
  });

  // Ban/unban in Clerk so they can't log in. Best-effort — never fail the request
  // just because Clerk didn't recognize the id.
  try {
    const client = await clerkClient();
    if (blocked) await client.users.banUser(clerkUserId);
    else await client.users.unbanUser(clerkUserId);
  } catch (err) {
    console.error("[bidder block] Clerk ban toggle failed:", err);
  }

  return NextResponse.json({ success: true, blocked });
}
