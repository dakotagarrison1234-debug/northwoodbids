export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { type OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserOrg, requireRole } from "@/lib/auth";
import { normalizeCode } from "@/lib/promo";
import { APP_URL } from "@/lib/paymentNotify";

async function gate() {
  const membership = await getUserOrg();
  if (!membership) return { err: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await requireRole(membership.organizationId, ["OWNER", "ADMIN"] as OrgRole[]))) {
    return { err: NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 }) };
  }
  return { orgId: membership.organizationId };
}

// GET /api/admin/promos — every welcome code with claim counts + recent claimers.
export async function GET() {
  const g = await gate();
  if ("err" in g) return g.err;
  const codes = await prisma.promoCode.findMany({
    where: { organizationId: g.orgId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { claims: true } }, claims: { orderBy: { createdAt: "desc" }, select: { clerkUserId: true, createdAt: true } } },
  });
  const ids: string[] = [...new Set(codes.flatMap((c) => c.claims.map((x: { clerkUserId: string }) => x.clerkUserId)))];
  const profiles = ids.length ? await prisma.bidderProfile.findMany({ where: { clerkUserId: { in: ids } }, select: { clerkUserId: true, name: true } }) : [];
  const nameById = new Map(profiles.map((p) => [p.clerkUserId, p.name || "Bidder"]));
  // Did the claimer go on to pay for something? (the number that matters)
  const paidIds = ids.length
    ? new Set((await prisma.payment.findMany({ where: { clerkUserId: { in: ids }, status: "PAID", comped: false }, select: { clerkUserId: true }, distinct: ["clerkUserId"] })).map((p) => p.clerkUserId))
    : new Set<string>();
  return NextResponse.json({
    codes: codes.map((c) => ({
      id: c.id,
      code: c.code,
      label: c.label,
      amount: Number(c.amount),
      active: c.active,
      maxClaims: c.maxClaims,
      expiresAt: c.expiresAt,
      createdAt: c.createdAt,
      claims: c._count.claims,
      // Claimers who went on to actually pay for something — the number that says
      // whether the cards are working.
      converted: c.claims.filter((x: { clerkUserId: string }) => paidIds.has(x.clerkUserId)).length,
      link: `${APP_URL}/go/${c.code}`,
      recent: c.claims.slice(0, 25).map((x: { clerkUserId: string; createdAt: Date }) => ({ name: nameById.get(x.clerkUserId) ?? "Bidder", at: x.createdAt, paid: paidIds.has(x.clerkUserId) })),
    })),
  });
}

// POST /api/admin/promos — create a code. Body: { code, label, amount?, maxClaims?, expiresAt? }
export async function POST(request: NextRequest) {
  const g = await gate();
  if ("err" in g) return g.err;
  const body = await request.json().catch(() => ({}));
  const code = normalizeCode(String(body.code ?? ""));
  const label = String(body.label ?? "").trim().slice(0, 80);
  const amount = body.amount === undefined || body.amount === "" ? 5 : Number(body.amount);
  const maxClaims = body.maxClaims === undefined || body.maxClaims === "" || body.maxClaims == null ? null : Math.floor(Number(body.maxClaims));
  const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : null;
  if (code.length < 3) return NextResponse.json({ error: "Code needs at least 3 letters or numbers." }, { status: 400 });
  if (!label) return NextResponse.json({ error: "Give it a label so you remember where it's printed." }, { status: 400 });
  // Bid Bucks are spent $5 per bill, so a welcome credit must be a whole number of $5s.
  if (isNaN(amount) || amount < 5 || amount > 50 || amount % 5 !== 0) return NextResponse.json({ error: "Amount must be $5, $10, $15 … up to $50 (Bid Bucks spend $5 per bill)." }, { status: 400 });
  if (maxClaims != null && (isNaN(maxClaims) || maxClaims < 1)) return NextResponse.json({ error: "Cap must be at least 1." }, { status: 400 });
  if (expiresAt && isNaN(expiresAt.getTime())) return NextResponse.json({ error: "Expiry isn't a valid date." }, { status: 400 });
  const exists = await prisma.promoCode.findUnique({ where: { code } });
  if (exists) return NextResponse.json({ error: "That code is taken." }, { status: 409 });
  const created = await prisma.promoCode.create({ data: { organizationId: g.orgId, code, label, amount, maxClaims, expiresAt } });
  return NextResponse.json({ success: true, id: created.id, link: `${APP_URL}/go/${code}` });
}

// PATCH /api/admin/promos  Body: { id, active?, label?, maxClaims?, expiresAt? }
export async function PATCH(request: NextRequest) {
  const g = await gate();
  if ("err" in g) return g.err;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const promo = await prisma.promoCode.findUnique({ where: { id } });
  if (!promo || promo.organizationId !== g.orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data: Record<string, unknown> = {};
  if (body.active !== undefined) data.active = !!body.active;
  if (typeof body.label === "string" && body.label.trim()) data.label = body.label.trim().slice(0, 80);
  if (body.maxClaims !== undefined) data.maxClaims = body.maxClaims === "" || body.maxClaims == null ? null : Math.max(1, Math.floor(Number(body.maxClaims)));
  if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : null;
  await prisma.promoCode.update({ where: { id }, data });
  return NextResponse.json({ success: true });
}
