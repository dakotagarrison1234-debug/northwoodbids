import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg, isSuperAdmin } from "@/lib/auth";

interface Props {
  params: Promise<{ memberId: string }>;
}

// DELETE — remove a member from the org
export async function DELETE(_request: NextRequest, { params }: Props) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Only OWNER (or super admin) can remove members
    const superAdmin = await isSuperAdmin();
    if (!superAdmin && membership.role !== "OWNER") {
      return NextResponse.json({ error: "Only the org owner can remove members" }, { status: 403 });
    }

    const { memberId } = await params;

    const target = await prisma.orgMember.findUnique({ where: { id: memberId } });
    if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    // Ensure target belongs to same org
    if (target.organizationId !== membership.organizationId && !superAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Cannot remove the OWNER
    if (target.role === "OWNER") {
      return NextResponse.json({ error: "Cannot remove the org owner" }, { status: 422 });
    }

    // Cannot remove yourself
    if (target.clerkUserId === userId) {
      return NextResponse.json({ error: "Cannot remove yourself" }, { status: 422 });
    }

    await prisma.orgMember.delete({ where: { id: memberId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[orgs/members DELETE]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
