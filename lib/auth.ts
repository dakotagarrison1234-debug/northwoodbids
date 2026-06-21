import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { OrgRole } from "@prisma/client";

// ─── Org Helpers ─────────────────────────────────────────────────────────────

export async function getUserOrg() {
  const { userId } = await auth();
  if (!userId) return null;

  // Super admin: check for act-as cookie
  if (await isSuperAdmin()) {
    const cookieStore = await cookies();
    const actAsOrgId = cookieStore.get("sa_org_id")?.value;
    if (actAsOrgId) {
      const org = await prisma.organization.findUnique({ where: { id: actAsOrgId } });
      if (org) {
        return {
          id: "superadmin_synthetic",
          clerkUserId: userId,
          organizationId: org.id,
          role: "OWNER" as const,
          createdAt: new Date(),
          organization: org,
        };
      }
    }
  }

  const membership = await prisma.orgMember.findFirst({
    where: { clerkUserId: userId },
    include: { organization: true },
  });

  return membership;
}

export async function requireUserOrg() {
  const membership = await getUserOrg();
  if (!membership) redirect("/apply");
  return membership;
}

export async function requireAuth() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return userId;
}

// Returns true if userId has access to this org (member OR super admin)
export async function canAccessOrg(orgId: string): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;
  if (await isSuperAdmin()) return true;
  const membership = await prisma.orgMember.findFirst({
    where: { clerkUserId: userId, organizationId: orgId },
  });
  return !!membership;
}

// Returns true if caller is super admin OR an OrgMember of orgId whose role is
// in the allowed list. Use this to gate financial/destructive actions where
// plain membership (canAccessOrg) isn't enough.
export async function requireRole(orgId: string, roles: OrgRole[]): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;
  if (await isSuperAdmin()) return true;
  const membership = await prisma.orgMember.findFirst({
    where: { clerkUserId: userId, organizationId: orgId },
    select: { role: true },
  });
  return !!membership && roles.includes(membership.role);
}

// ─── Super Admin ─────────────────────────────────────────────────────────────

function getSuperAdminIds(): string[] {
  return (process.env.SUPER_ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function isSuperAdmin(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;
  return getSuperAdminIds().includes(userId);
}

export async function requireSuperAdmin() {
  const ok = await isSuperAdmin();
  if (!ok) redirect("/");
}

export async function getCurrentUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}
