import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface Props { params: Promise<{ orgId: string }> }

// DELETE — remove a member: ?memberId=xxx
export async function DELETE(request: NextRequest, { params }: Props) {
  await requireSuperAdmin();
  const { orgId } = await params;
  const memberId = new URL(request.url).searchParams.get("memberId");
  if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });

  await prisma.orgMember.delete({ where: { id: memberId, organizationId: orgId } });
  return NextResponse.json({ success: true });
}

// PATCH — change a member's role: body { memberId, role }
export async function PATCH(request: NextRequest, { params }: Props) {
  await requireSuperAdmin();
  const { orgId } = await params;
  const { memberId, role } = await request.json();
  if (!memberId || !role) return NextResponse.json({ error: "memberId and role required" }, { status: 400 });

  const validRoles = ["OWNER", "ADMIN", "STAFF"];
  if (!validRoles.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const member = await prisma.orgMember.update({
    where: { id: memberId, organizationId: orgId },
    data: { role },
  });
  return NextResponse.json({ success: true, member });
}
