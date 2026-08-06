export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { requireUserOrg } from "@/lib/auth";
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
      <header className="border-b border-slate-200 bg-white px-4 sm:px-8 py-3.5">
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">Unsold items</h1>
        <p className="text-sm text-slate-500 mt-1">
          Everything that didn&apos;t sell. Relist an item straight into another auction, or save it to drafts for later.
        </p>
      </header>

      <div className="px-4 sm:px-8 py-5 max-w-3xl w-full">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            Nothing unsold right now — every item found a buyer. 🎉
          </div>
        ) : (
          <UnsoldList groups={grouped} relistTargets={relistTargets} locations={locations} total={items.length} />
        )}
      </div>
    </>
  );
}
