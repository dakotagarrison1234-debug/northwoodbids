export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AuctionCard from "@/app/components/AuctionCard";
import PusherRefresh from "@/app/components/PusherRefresh";
import SectionHeader from "@/app/components/SectionHeader";
import ScrollReveal from "@/app/components/ScrollReveal";
import { PineRidge, MountainRange, GavelEmblem, WoodenCrate, BranchDivider } from "@/app/components/Illustrations";

export default async function AuctionsPage() {
  const auctions = await prisma.auction.findMany({
    where: { status: "OPEN", archived: false },
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
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div
            className="absolute -top-16 left-1/2 -translate-x-1/2 w-[560px] h-[300px] rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(212,160,90,0.30) 0%, rgba(212,160,90,0) 70%)" }}
          />
          <MountainRange className="nb-feather-x absolute right-0 bottom-16 h-[160px] w-[520px] opacity-25" />
          <PineRidge className="nb-feather-x absolute bottom-0 left-0 w-full h-24 sm:h-28" />
        </div>
        <div className="relative max-w-6xl mx-auto px-6 sm:px-8 pt-10 sm:pt-14 pb-28 sm:pb-32">
          <div className="flex items-center gap-4">
            <GavelEmblem className="w-14 h-14 sm:w-16 sm:h-16 shrink-0" />
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#2f5d3a]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#4a7c59] opacity-70 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4a7c59]" />
                </span>
                The auction floor
              </p>
              <h1 className="font-display text-3xl sm:text-5xl font-black tracking-tight leading-[0.95] text-[#241a12] mt-1">
                Live Auctions
              </h1>
              <p className="text-[#6f5b46] text-sm sm:text-base mt-2 max-w-md">
                Every open auction, soonest to close first. $2 starts, pickup in Owosso or Gladwin.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-10 sm:py-14">
        {auctions.length > 0 ? (
          <>
            <SectionHeader
              variant="live"
              eyebrow="Bidding is open"
              title="Closing Soonest"
              tagline="The clock on each card is live. When it hits zero, the high bid takes it."
              count={auctions.length}
              countLabel={auctions.length === 1 ? "auction" : "auctions"}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
              {auctions.map((auction, idx) => (
                <ScrollReveal key={auction.id} delay={Math.min(idx, 5) * 80} className="h-full [&>*]:h-full">
                  <AuctionCard
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
                </ScrollReveal>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-16 px-6 rounded-2xl border border-dashed border-[#cdbda3] bg-[#fbf4e6]/80">
            <WoodenCrate className="nb-float w-32 h-28 mx-auto mb-4" />
            <p className="font-display text-2xl font-black tracking-tight text-[#241a12] mb-1.5">The floor is quiet</p>
            <p className="text-sm text-[#6f5b46] max-w-sm mx-auto leading-relaxed">
              Nothing open right now. New lots hit the floor every week; the home page shows what&apos;s on deck.
            </p>
            <Link
              href="/#upcoming"
              className="inline-flex items-center gap-2 mt-6 rounded-xl bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold text-sm px-6 py-3 transition-colors"
            >
              See what&apos;s on deck
            </Link>
          </div>
        )}
        <BranchDivider className="w-56 h-6 mx-auto mt-14 opacity-80" />
      </div>
    </main>
  );
}
