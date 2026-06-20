import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireSuperAdmin();

    const [applications, orgs] = await Promise.all([
      prisma.orgApplication.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.organization.findMany({
        include: { members: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({ applications, orgs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[superadmin/applications GET]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
