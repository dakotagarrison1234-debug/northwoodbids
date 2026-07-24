export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AuctionCard from "@/app/components/AuctionCard";
import PusherRefresh from "@/app/components/PusherRefresh";
import { PineRidge, MountainRange, GavelEmblem, WoodenCrate } from "@/app/components/Illustrations";

export default async function AuctionsPage() {
  const auctions = await prisma.auction.findMany({
    where: { status: "OPEN" },
    include: {
      organization: { select: { id: true, name: true, slug: true, logoUrl: true } },
      // Preview the most-active lots (most bids first).
      items: {
        where: { status: "ACTIVE" },
        orderBy: [{ bids: { _count: "desc" } }, { currentBid: "desc" }],
        take: 8,
        select: {
          id: true,
          photos: { take: 1, orderBy: [{ isPrimary: "desc" }, { order: "asc" }], select: { url: true } },
        },
      },
    },
    orderBy: { endAt: "asc" },
  });

  // Active-item count per auction (dollar totals are admin-only) — one grouped query.
  const auctionIds = auctions.map((a) => a.id);
  const activeItemsByAuction = auctionIds.length
    ? await prisma.item.groupBy({
        by: ["auctionId"],
        where: { auctionId: { in: auctionIds }, status: "ACTIVE" },
        _count: { _all: true },
      })
    : [];
  const activeItemsMap = new Map(
    activeItemsByAuction.map((r) => [r.auctionId, r._count._all])
  );

  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      <PusherRefresh channel="auctions" event="auction-updated" />

      {/* Rustic header band */}
      <section className="relative overflow-hidden border-b border-[#e3d6bf]/60 bg-[#efe5d3]/70">
        <MountainRange className="absolute right-0 top-0 h-full w-[420px] opacity-40 pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-6 sm:px-8 pt-10 sm:pt-14 pb-28 sm:pb-32">
          <div className="flex items-center gap-3">
            <GavelEmblem className="w-12 h-12 shrink-0" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#6c4d39] animate-pulse inline-block shrink-0" />
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Live Auctions</h1>
            {auctions.length > 0 && (
              <span className="text-[#8a7559] text-base ml-1">({auctions.length})</span>
            )}
          </div>
          <p className="text-[#6f5b46] text-sm mt-2 ml-[60px]">
            Browse open auctions and place your bids before they close.
          </p>
        </div>
        <PineRidge className="absolute bottom-0 left-0 w-full h-24 sm:h-28 pointer-events-none" />
      </section>

      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-10 sm:py-14">
        {auctions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
            {auctions.map((auction) => (
              <AuctionCard
                key={auction.id}
                mode="live"
                showOrg
                auction={{
                  id: auction.id,
                  title: auction.title,
                  slug: auction.slug,
                  status: auction.status,
                  startAtIso: auction.startAt.toISOString(),
                  endAtIso: auction.endAt.toISOString(),
                  itemCount: activeItemsMap.get(auction.id) ?? 0,
                  org: {
                    name: auction.organization.name,
                    slug: auction.organization.slug,
                    logoUrl: auction.organization.logoUrl,
                  },
                  items: auction.items,
                }}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-[#f1e7d5]/60 rounded-2xl border border-[#e3d6bf]">
            <div className="flex justify-center mb-4">
              <WoodenCrate className="w-28 h-24" />
            </div>
            <p className="font-display text-lg font-semibold mb-1 text-[#6f5b46]">No live auctions right now</p>
            <p className="text-sm text-[#8a7559] mb-6">Check back soon — new auctions are added regularly.</p>
            <Link href="/" className="text-[#6c4d39] hover:text-[#c47b3e] text-sm font-medium transition-colors">
              Go to home page
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
