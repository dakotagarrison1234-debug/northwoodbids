export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import LocalDate from "@/app/components/LocalDate";
import ItemCardTimer from "@/app/components/ItemCardTimer";
import PusherRefresh from "@/app/components/PusherRefresh";
import NotFoundCard from "@/app/components/NotFoundCard";
import { PineMark, BranchDivider, WoodenCrate } from "@/app/components/Illustrations";

interface Props {
  params: Promise<{ orgSlug: string; auctionSlug: string }>;
}

function IcoLock() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="10" height="7" rx="2" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" />
    </svg>
  );
}
function IcoClock() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3l2 1.5" />
    </svg>
  );
}

export default async function AuctionPage({ params }: Props) {
  const { orgSlug, auctionSlug } = await params;
  const { userId } = await auth();

  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
  });

  const auction = org ? await prisma.auction.findFirst({
    where: { organizationId: org.id, slug: auctionSlug },
    include: {
      items: {
        include: { photos: true, bids: true },
      },
    },
  }) : null;

  if (!auction) {
    return (
      <NotFoundCard
        title="Auction not found"
        message="This auction may have ended or the link is incorrect."
        actions={[
          { href: `/${orgSlug}`, label: "View business", primary: true },
          { href: "/auctions", label: "Browse all auctions" },
        ]}
      />
    );
  }

  const isClosed = auction.status === "CLOSED" || auction.status === "SETTLED";
  const isClosing = auction.status === "CLOSING";
  const isLive = !isClosed;

  // Helper: is the current user the top bidder on this item?
  const isUserWinning = (bids: { clerkUserId: string | null; amount: unknown }[]) => {
    if (!userId || bids.length === 0) return false;
    const topBid = [...bids].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
    return topBid.clerkUserId === userId;
  };

  const SOLD_STATUSES = ["SOLD", "PENDING_PICKUP", "PICKED_UP"];

  // Only show items that are visible to bidders (not DRAFT).
  // While the auction is LIVE, ended items (sold/unsold) drop off the grid so
  // bidders only see what's still biddable (popcorn stragglers included).
  // Once the whole auction has closed, show everything as the historical view.
  const allVisible = auction.items.filter(i => i.status !== "DRAFT");
  const visibleItems = isLive
    ? allVisible.filter(i => i.status === "ACTIVE")
    : allVisible;
  const endedCount = allVisible.length - (isLive ? visibleItems.length : 0);

  const totalRaised = allVisible
    .filter(i => SOLD_STATUSES.includes(i.status))
    .reduce((sum, item) => sum + Number(item.currentBid), 0);

  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      {/* Live refresh: re-renders this page when bids land or items/auctions close */}
      <PusherRefresh channel="auctions" event="auction-updated" />

      {/* Status banners */}
      {isClosed && (
        <div className="bg-[#efe3d0]/40 border-b border-[#cdbda3]/50 px-4 sm:px-6 py-3 flex items-center gap-2.5">
          <IcoLock />
          <span className="text-[#6f5b46] text-sm font-medium">This auction has closed — bidding is no longer available.</span>
        </div>
      )}
      {isClosing && !isClosed && (
        <div className="bg-amber-500/8 border-b border-amber-500/20 px-4 sm:px-6 py-3 flex items-center gap-2.5">
          <span className="text-amber-400"><IcoClock /></span>
          <span className="text-amber-300 text-sm font-semibold">This auction is closing soon — place your final bids now.</span>
        </div>
      )}

      {/* Auction hero */}
      <div className="relative overflow-hidden bg-[#efe5d3]/80 border-b border-[#e3d6bf]/60 px-4 sm:px-6 py-6 sm:py-8">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-[#a4592a]/4 rounded-full blur-[60px]" />
        </div>
        <div className="relative max-w-6xl mx-auto flex items-start sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Link href={`/${orgSlug}`} className="text-xs text-[#8a7559] hover:text-[#a4592a] transition-colors font-medium">
                {orgSlug.replace(/-/g, " ")}
              </Link>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2 flex items-center gap-2">
              <PineMark className="w-5 h-5 shrink-0" />
              {auction.title}
            </h1>
            <p className="text-[#6f5b46] text-sm">
              {isLive
                ? `${visibleItems.length} live item${visibleItems.length !== 1 ? "s" : ""}${endedCount > 0 ? ` · ${endedCount} ended` : ""}`
                : `${visibleItems.length} item${visibleItems.length !== 1 ? "s" : ""}`} ·{" "}
              {isClosed ? "Closed" : isClosing ? "Closing" : "Closes"}{" "}
              <LocalDate iso={auction.endAt.toISOString()} />
            </p>
          </div>
          {totalRaised > 0 && (
            <div className="text-right shrink-0">
              <div className="text-2xl sm:text-3xl font-extrabold text-[#a4592a]">${totalRaised.toLocaleString()}</div>
              <div className="text-[#8a7559] text-xs mt-0.5">total raised</div>
            </div>
          )}
        </div>
      </div>

      {/* Item grid */}
      <section className="px-4 sm:px-6 py-8 sm:py-10 max-w-6xl mx-auto">
        <div className="flex justify-center mb-6 sm:mb-8">
          <BranchDivider className="w-40 h-5 opacity-80" />
        </div>
        {visibleItems.length === 0 ? (
          <div className="text-center py-20 text-[#8a7559] px-5">
            <div className="flex justify-center mb-4">
              <WoodenCrate className="w-28 h-24" />
            </div>
            <p className="font-display text-lg font-medium mb-5">
              {isLive && endedCount > 0
                ? "All items have ended — final results are being processed."
                : "No items in this auction yet"}
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5 justify-center max-w-sm mx-auto">
              <Link href={`/${orgSlug}`} className="bg-[#a4592a] hover:bg-[#843f1c] text-white font-semibold py-2.5 px-5 rounded-xl transition-colors">
                More from {orgSlug.replace(/-/g, " ")}
              </Link>
              <Link href="/auctions" className="border border-[#cdbda3] hover:border-[#b3a085] text-[#4a3a2b] hover:text-[#241a12] font-medium py-2.5 px-5 rounded-xl transition-colors">
                Browse all auctions
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {visibleItems.map((item) => {
              const isItemSold = SOLD_STATUSES.includes(item.status);
              const isItemUnsold = item.status === "UNSOLD";
              const isItemClosed = isItemSold || isItemUnsold;
              const winning = isLive && !isItemClosed && isUserWinning(item.bids);
              const bidLabel = isItemUnsold ? "Ended" : isItemSold ? "Sold" : isClosed ? "Closed" : winning ? "Raise Bid" : "Bid Now";
              const bidClass = isClosed || isItemClosed
                ? "bg-[#efe3d0] text-[#8a7559] text-xs px-3 py-1.5 rounded-xl font-medium"
                : winning
                ? "bg-[#efe0c9] text-[#843f1c] text-xs px-3 py-1.5 rounded-xl font-bold border border-[#a4592a]/30"
                : "bg-[#a4592a] hover:bg-[#843f1c] text-white text-xs px-3 py-1.5 rounded-xl font-bold transition-colors";

              const primaryPhoto = item.photos.find(p => p.isPrimary)?.url || item.photos[0]?.url;

              // Live countdown badge — only for items still accepting bids
              const isItemLive =
                item.status === "ACTIVE" &&
                (auction.status === "OPEN" || auction.status === "CLOSING");
              const itemEndAtIso = (item.itemEndAt ?? auction.endAt).toISOString();

              return (
                <Link
                  key={item.id}
                  href={`/${orgSlug}/${auctionSlug}/item/${item.id}`}
                  className={`bg-white border rounded-2xl overflow-hidden transition-all group ${
                    winning
                      ? "border-[#a4592a]/50 shadow-[0_0_0_1px_rgba(164,89,42,0.15),0_0_20px_rgba(164,89,42,0.08)]"
                      : isClosed || isItemClosed
                      ? "border-[#e3d6bf]/60 opacity-80 hover:border-[#cdbda3]"
                      : "border-[#e3d6bf] hover:border-[#a4592a]/40 hover:shadow-[0_0_25px_rgba(164,89,42,0.06)]"
                  }`}
                >
                  {/* Photo */}
                  <div className="w-full aspect-square bg-[#efe3d0] flex items-center justify-center text-[#8a7559] overflow-hidden relative">
                    {primaryPhoto ? (
                      <img
                        src={primaryPhoto}
                        alt={item.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-[#b3a085]">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <rect x="3" y="3" width="18" height="18" rx="3" />
                          <circle cx="8.5" cy="8.5" r="2" />
                          <path d="m21 15-5-5L5 21" />
                        </svg>
                        <span className="text-xs">No photo</span>
                      </div>
                    )}
                    {isItemLive && <ItemCardTimer itemId={item.id} endAt={itemEndAtIso} />}
                    {winning && (
                      <div className="absolute top-2.5 left-2.5 bg-[#a4592a] text-white text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1 shadow-sm">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 4.5H1V2.5h1M10 4.5h1V2.5h-1M2 4.5h8v2.5a4 4 0 0 1-8 0V4.5zM3.5 10h5M6 7.5V10"/>
                        </svg>
                        Winning
                      </div>
                    )}
                    {isItemSold && (
                      <div className="absolute top-2.5 right-2.5 bg-[#f1e7d5]/80 backdrop-blur-sm text-[#4a3a2b] text-xs px-2.5 py-1 rounded-full font-semibold">
                        Sold
                      </div>
                    )}
                    {isItemUnsold && (
                      <div className="absolute top-2.5 right-2.5 bg-[#f1e7d5]/80 backdrop-blur-sm text-[#8a7559] text-xs px-2.5 py-1 rounded-full font-medium">
                        Ended
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <h3 className="font-bold text-sm leading-tight group-hover:text-[#a4592a] transition-colors line-clamp-2 mb-2">
                      {item.title}
                    </h3>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-[#8a7559] uppercase tracking-wide">
                          {isItemSold ? "Sold" : isItemUnsold ? "Final" : "Bid"}
                        </div>
                        <div className={`font-extrabold text-base ${isItemUnsold ? "text-[#8a7559]" : "text-[#a4592a]"}`}>
                          ${(Number(item.currentBid) || Number(item.startingBid)).toLocaleString()}
                        </div>
                      </div>
                      <span className={bidClass}>{bidLabel}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
