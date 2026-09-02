export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { type OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";

async function ownGiveaway(id: string, orgId: string) {
  const g = await prisma.giveaway.findUnique({ where: { id }, select: { id: true, organizationId: true } });
  return g && g.organizationId === orgId ? g : null;
}

// GET /api/admin/giveaways/[id]/entries?q=... — search registered bidders to hand-add.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;
  const { id } = await params;
  if (!(await ownGiveaway(id, orgId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ bidders: [] });

  const matches = await prisma.bidderProfile.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
      ],
    },
    select: { clerkUserId: true, name: true, email: true },
    take: 12,
  });

  return NextResponse.json({
    bidders: matches.map((m) => ({ clerkUserId: m.clerkUserId, name: m.name || "Bidder", email: m.email || "" })),
  });
}

// POST /api/admin/giveaways/[id]/entries — hand-add a bidder to the wheel.
// Body: { clerkUserId }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;
  if (!(await requireRole(orgId, ["OWNER", "ADMIN"] as OrgRole[]))) {
    return NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 });
  }
  const { id } = await params;
  if (!(await ownGiveaway(id, orgId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const clerkUserId = String(body.clerkUserId ?? "").trim();
  if (!clerkUserId) return NextResponse.json({ error: "clerkUserId required" }, { status: 400 });

  const profile = await prisma.bidderProfile.findUnique({ where: { clerkUserId }, select: { clerkUserId: true } });
  if (!profile) return NextResponse.json({ error: "That bidder doesn't have an account." }, { status: 404 });

  await prisma.giveawayEntry.upsert({
    where: { giveawayId_clerkUserId: { giveawayId: id, clerkUserId } },
    update: { manual: true, removed: false },
    create: { giveawayId: id, clerkUserId, manual: true },
  });
  return NextResponse.json({ success: true });
}

// PATCH /api/admin/giveaways/[id]/entries — remove or restore a name on the wheel.
// Body: { clerkUserId, removed: boolean }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;
  if (!(await requireRole(orgId, ["OWNER", "ADMIN"] as OrgRole[]))) {
    return NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 });
  }
  const { id } = await params;
  if (!(await ownGiveaway(id, orgId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const clerkUserId = String(body.clerkUserId ?? "").trim();
  const removed = body.removed === true;
  if (!clerkUserId) return NextResponse.json({ error: "clerkUserId required" }, { status: 400 });

  // Can't pull a name that already won.
  const existing = await prisma.giveawayEntry.findUnique({
    where: { giveawayId_clerkUserId: { giveawayId: id, clerkUserId } },
    select: { won: true },
  });
  if (existing?.won) return NextResponse.json({ error: "That entrant already won a prize." }, { status: 409 });

  await prisma.giveawayEntry.upsert({
    where: { giveawayId_clerkUserId: { giveawayId: id, clerkUserId } },
    update: { removed },
    create: { giveawayId: id, clerkUserId, removed },
  });
  return NextResponse.json({ success: true });
}
