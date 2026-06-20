import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "sa_org_id";
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 8, // 8 hours
};

// POST — enter an org as super admin
export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin();
    const { orgId } = await request.json();

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

    const response = NextResponse.json({ success: true, orgName: org.name });
    response.cookies.set(COOKIE_NAME, orgId, COOKIE_OPTS);
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[superadmin/act-as POST]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE — exit act-as mode
export async function DELETE() {
  try {
    await requireSuperAdmin();
    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, "", { ...COOKIE_OPTS, maxAge: 0 });
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[superadmin/act-as DELETE]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
