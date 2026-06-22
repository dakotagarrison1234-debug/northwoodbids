import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  // Gate BEFORE the try block so the check is not swallowed by the catch (which
  // would leak internals via a 500 to non-admins).
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [applications, orgs] = await Promise.all([
      prisma.orgApplication.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.organization.findMany({
        include: { members: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({ applications, orgs });
  } catch (err) {
    console.error("[superadmin/applications GET]:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
