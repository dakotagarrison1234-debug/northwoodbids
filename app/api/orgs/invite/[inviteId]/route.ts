import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg, isSuperAdmin } from "@/lib/auth";

interface Props {
  params: Promise<{ inviteId: string }>;
}

// DELETE — revoke a pending invite
export async function DELETE(_request: NextRequest, { params }: Props) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const isAdmin =
      (await isSuperAdmin()) ||
      membership.role === "OWNER" ||
      membership.role === "ADMIN";
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { inviteId } = await params;

    const invite = await prisma.orgInvite.findUnique({ where: { id: inviteId } });
    if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

    // Only allow revoking invites belonging to this org
    if (invite.organizationId !== membership.organizationId && !(await isSuperAdmin())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.orgInvite.delete({ where: { id: inviteId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[orgs/invite DELETE]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
