export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import LocalDate from "@/app/components/LocalDate";
import OrgLogo from "@/app/components/OrgLogo";
import AuctionPreviewThumbs from "@/app/components/AuctionPreviewThumbs";
import PusherRefresh from "@/app/components/PusherRefresh";
import { PineRidge, MountainRange, GavelEmblem, WoodenCrate } from "@/app/components/Illustrations";

/**
 * Rustic "closing soon / ends in Xh" urgency pill computed from endAt.
 * Returns null when the auction is more than 48h out or already closed.
 */
function endsSoon(endAt: Date, now: Date): { label: string; tone: "urgent" | "soon" } | null {
  const ms = endAt.getTime() - now.getTime();
  if (ms <= 0) return null;
  const mins = Math.round(ms / 60000);
  const hours = Math.floor(mins / 60);
  if (mins <= 60) return { label: mins <= 1 ? "Closing now" : `Ends in ${mins}m`, tone: "urgent" };
  if (hours < 12) return { label: `Ends in ${hours}h`, tone: "urgent" };
  if (hours < 48) return { label: `Ends in ${hours}h`, tone: "soon" };
  return null;
}

function UrgencyPill({ endAt, now }: { endAt: Date; now: Date }) {
  const u = endsSoon(endAt, now);
  if (!u) return null;
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full shrink-0 font-semibold whitespace-nowrap inline-flex items-center gap-1 ${
        u.tone === "urgent"
          ? "bg-[#efe0c9] text-[#8a5a2b] border border-[#d8b483]"
          : "bg-[#6c4d39]/10 text-[#6c4d39] border border-[#6c4d39]/20"
      }`}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
      </svg>
      {u.label}
    </span>
  );
}

export default async function AuctionsPage() {
  const now = new Date();
  const auctions = await prisma.auction.findMany({
    where: { status: "OPEN" },
    include: {
      organization: { select: { id: true, name: true, slug: true, logoUrl: true } },
      // Preview the most-popular items (most bids first; any items if none have bids).
      items: {
        where: { status: "ACTIVE" },
        orderBy: [{ bids: { _count: "desc" } }, { currentBid: "desc" }],
        take: 6,
        select: {
          id: true,
          photos: { take: 1, orderBy: [{ isPrimary: "desc" }, { order: "asc" }], select: { url: true } },
          _count: { select: { bids: true } },
        },
      },
    },
    orderBy: { endAt: "asc" },
  });

  // Per-auction "raised" (sum of every item's current bid) and "active items" count,
  // computed in the DB via groupBy instead of loading every item row into JS.
  const auctionIds = auctions.map((a) => a.id);
  const [raisedByAuction, activeItemsByAuction] = auctionIds.length
    ? await Promise.all([
        prisma.item.groupBy({
          by: ["auctionId"],
          where: { auctionId: { in: auctionIds } },
          _sum: { currentBid: true },
        }),
        prisma.item.groupBy({
          by: ["auctionId"],
          where: { auctionId: { in: auctionIds }, status: "ACTIVE" },
          _count: { _all: true },
        }),
      ])
    : [[], []];
  const raisedMap = new Map(
    raisedByAuction.map((r) => [r.auctionId, Number(r._sum.currentBid ?? 0)])
  );
  const activeItemsMap = new Map(
    activeItemsByAuction.map((r) => [r.auctionId, r._count._all])
  );

  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      <PusherRefresh channel="auctions" event="auction-updated" />

      {/* Rustic header band */}
      <section className="relative overflow-hidden border-b border-[#e3d6bf]/60 bg-[#efe5d3]/70">
        <MountainRange className="absolute right-0 top-0 h-full w-[420px] opacity-40 pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-28 sm:pb-32">
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

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        {auctions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {auctions.map((auction) => {
              const raised = raisedMap.get(auction.id) ?? 0;
              const activeItems = activeItemsMap.get(auction.id) ?? 0;
              return (
                <Link
                  key={auction.id}
                  href={`/${auction.organization.slug}/${auction.slug}`}
                  className="bg-white border border-[#e3d6bf] hover:border-[#6c4d39]/40 rounded-2xl p-5 transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] group flex flex-col gap-3"
                >
                  {/* Org + live badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <OrgLogo name={auction.organization.name} logoUrl={auction.organization.logoUrl} size="sm" />
                      <span className="text-xs text-[#6c4d39] font-semibold truncate">
                        {auction.organization.name}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-xs bg-[#6c4d39]/15 text-[#6c4d39] border border-[#6c4d39]/20 px-2 py-0.5 rounded-full font-semibold">
                        Live
                      </span>
                      <UrgencyPill endAt={auction.endAt} now={now} />
                    </div>
                  </div>

                  {/* Auction title */}
                  <h2 className="font-bold text-base group-hover:text-[#6c4d39] transition-colors leading-snug">
                    {auction.title}
                  </h2>

                  {/* Stats */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="text-[#8a7559]">{activeItems} item{activeItems !== 1 ? "s" : ""}</span>
                    {raised > 0 && (
                      <span className="text-[#6c4d39] font-semibold">${raised.toLocaleString()} raised</span>
                    )}
                  </div>

                  {/* Most-popular item previews */}
                  <AuctionPreviewThumbs items={auction.items} />

                  {/* End time */}
                  <div className="text-xs text-[#8a7559] border-t border-[#e3d6bf] pt-2 mt-auto">
                    Closes <LocalDate iso={auction.endAt.toISOString()} />
                  </div>
                </Link>
              );
            })}
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
