export const dynamic = "force-dynamic";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import OrgCommandCenter from "./OrgCommandCenter";

interface Props { params: Promise<{ orgId: string }> }

export default async function OrgDetailPage({ params }: Props) {
  await requireSuperAdmin();
  const { orgId } = await params;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      members: true,
      auctions: {
        include: {
          items: { select: { id: true, status: true, currentBid: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      items: {
        include: {
          photos: { where: { isPrimary: true }, take: 1 },
          auction: { select: { title: true, id: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!org) notFound();

  // Serialize Decimal fields before passing to client component
  const serializedOrg = {
    ...org,
    auctions: org.auctions.map((a) => ({
      ...a,
      items: a.items.map((i) => ({ ...i, currentBid: Number(i.currentBid) })),
    })),
    items: org.items.map((i) => ({
      ...i,
      currentBid: Number(i.currentBid),
      startingBid: Number(i.startingBid),
    })),
  };

  return <OrgCommandCenter org={serializedOrg} />;
}
