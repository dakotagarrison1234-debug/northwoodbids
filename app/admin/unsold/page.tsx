export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { requireUserOrg } from "@/lib/auth";
import { IcoTrophy } from "@/app/components/BidIcons";
import { PageHeader, PageBody, Empty, BtnLink } from "../ui";
import UnsoldList, { type UnsoldGroup } from "./UnsoldList";

export default async function UnsoldPage() {
  const membership = await requireUserOrg();
  const orgId = membership.organization.id;

  const [items, relistTargets, locations] = await Promise.all([
    prisma.item.findMany({
      where: { organizationId: orgId, status: "UNSOLD" },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        currentBid: true,
        storageLocation: true,
        photos: { orderBy: [{ isPrimary: "desc" }, { order: "asc" }], take: 1, select: { url: true } },
        location: { select: { name: true } },
        auction: { select: { id: true, title: true } },
      },
    }),
    prisma.auction.findMany({
      where: { organizationId: orgId, status: { in: ["DRAFT", "OPEN", "CLOSING"] } },
      orderBy: [{ startAt: "asc" }],
      select: { id: true, title: true, status: true },
    }),
    prisma.pickupLocation.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  // Group by the auction the item didn't sell in, serializing to plain objects the
  // client search component can filter (Decimal currentBid → number here).
  const groupMap = new Map<string, UnsoldGroup>();
  for (const it of items) {
    const key = it.auction?.id ?? "none";
    const g = groupMap.get(key) ?? { title: it.auction?.title ?? "No auction", auctionId: it.auction?.id ?? null, items: [] };
    g.items.push({
      id: it.id,
      title: it.title,
      high: Number(it.currentBid),
      storageLocation: it.storageLocation ?? null,
      photo: it.photos[0]?.url ?? null,
      warehouse: it.location?.name ?? null,
    });
    groupMap.set(key, g);
  }
  const grouped = [...groupMap.values()];

  return (
    <>
      <PageHeader
        title="Unsold & relist"
        sub="Everything that didn't sell. Relist an item straight into another auction, or save it to drafts for later."
      />

      <PageBody>
        {items.length === 0 ? (
          <div className="bg-white border border-[#e6dac6] rounded-2xl">
            <Empty
              icon={<IcoTrophy className="w-10 h-10" />}
              text="Nothing unsold right now."
              sub="Every lot found a buyer."
              action={<BtnLink href="/admin/auctions" size="sm" variant="outline">All auctions</BtnLink>}
            />
          </div>
        ) : (
          <UnsoldList groups={grouped} relistTargets={relistTargets} locations={locations} total={items.length} />
        )}
      </PageBody>
    </>
  );
}
