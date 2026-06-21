export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

// GET /api/admin/pickup/transfers — pending (REQUESTED) + recently COMPLETED transfers for the org
export async function GET() {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const transfers = await prisma.transferRequest.findMany({
      where: {
        organizationId: membership.organizationId,
        status: { in: ["REQUESTED", "COMPLETED"] },
      },
      include: {
        toLocation: { select: { id: true, name: true } },
        items: {
          select: {
            id: true,
            title: true,
            storageLocation: true,
            location: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Attach bidder profile (by clerkUserId)
    const userIds = [...new Set(transfers.map((t) => t.clerkUserId))];
    const profiles = userIds.length
      ? await prisma.bidderProfile.findMany({
          where: { clerkUserId: { in: userIds } },
          select: { clerkUserId: true, name: true, email: true, phone: true },
        })
      : [];
    const profileMap = new Map(profiles.map((p) => [p.clerkUserId, p]));

    const result = transfers.map((t) => ({
      id: t.id,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      clerkUserId: t.clerkUserId,
      toLocation: t.toLocation,
      bidder: profileMap.get(t.clerkUserId) ?? { name: null, email: null, phone: null },
      items: t.items.map((it) => ({
        id: it.id,
        title: it.title,
        fromLocationName: it.location?.name ?? null,
        storageLocation: it.storageLocation,
      })),
    }));

    return NextResponse.json({ transfers: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/pickup/transfers GET]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
