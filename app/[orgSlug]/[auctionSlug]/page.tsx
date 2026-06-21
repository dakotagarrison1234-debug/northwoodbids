export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import LocalDate from "@/app/components/LocalDate";
import UserMenu from "@/app/components/UserMenu";
import ItemCardTimer from "@/app/components/ItemCardTimer";
import PusherRefresh from "@/app/components/PusherRefresh";
import NotFoundCard from "@/app/components/NotFoundCard";

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
    <main className="min-h-screen bg-[#faf8f4] text-[#1a1916]">
      {/* Live refresh: re-renders this page when bids land or items/auctions close */}
      <PusherRefresh channel="auctions" event="auction-updated" />
      {/* Header */}
      <header className="border-b border-[#e5e0d5]/60 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 bg-[#faf8f4]/95 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 overflow-hidden text-sm">
          <Link href="/" className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-[#09a7ad] to-[#0bbcc2] bg-clip-text text-transparent shrink-0">
            Northwood Bids
          </Link>
          <span className="text-[#b0a99a] hidden sm:inline">/</span>
          <Link href={`/${orgSlug}`} className="text-[#8c8778] hover:text-[#1a1916] capitalize hidden sm:inline truncate max-w-[120px] transition-colors">
            {orgSlug.replace(/-/g, " ")}
          </Link>
          <span className="text-[#b0a99a] hidden sm:inline">/</span>
          <span className="text-[#4a4640] capitalize truncate text-sm">{auctionSlug.replace(/-/g, " ")}</span>
        </div>
        <UserMenu />
      </header>

      {/* Status banners */}
      {isClosed && (
        <div className="bg-[#f2efe8]/40 border-b border-[#d4cfc4]/50 px-4 sm:px-6 py-3 flex items-center gap-2.5">
          <IcoLock />
          <span className="text-[#6b6659] text-sm font-medium">This auction has closed — bidding is no longer available.</span>
        </div>
      )}
      {isClosing && !isClosed && (
        <div className="bg-amber-500/8 border-b border-amber-500/20 px-4 sm:px-6 py-3 flex items-center gap-2.5">
          <span className="text-amber-400"><IcoClock /></span>
          <span className="text-amber-300 text-sm font-semibold">This auction is closing soon — place your final bids now.</span>
        </div>
      )}

      {/* Auction hero */}
      <div className="relative overflow-hidden bg-[#f5f1ea]/80 border-b border-[#e5e0d5]/60 px-4 sm:px-6 py-6 sm:py-8">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-[#09a7ad]/4 rounded-full blur-[60px]" />
        </div>
        <div className="relative max-w-6xl mx-auto flex items-start sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Link href={`/${orgSlug}`} className="text-xs text-[#8c8778] hover:text-[#09a7ad] transition-colors font-medium">
                {orgSlug.replace(/-/g, " ")}
              </Link>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">{auction.title}</h1>
            <p className="text-[#6b6659] text-sm">
              {isLive
                ? `${visibleItems.length} live item${visibleItems.length !== 1 ? "s" : ""}${endedCount > 0 ? ` · ${endedCount} ended` : ""}`
                : `${visibleItems.length} item${visibleItems.length !== 1 ? "s" : ""}`} ·{" "}
              {isClosed ? "Closed" : isClosing ? "Closing" : "Closes"}{" "}
              <LocalDate iso={auction.endAt.toISOString()} />
            </p>
          </div>
          {totalRaised > 0 && (
            <div className="text-right shrink-0">
              <div className="text-2xl sm:text-3xl font-extrabold text-[#09a7ad]">${totalRaised.toLocaleString()}</div>
              <div className="text-[#8c8778] text-xs mt-0.5">total raised</div>
            </div>
          )}
        </div>
      </div>

      {/* Item grid */}
      <section className="px-4 sm:px-6 py-8 sm:py-10 max-w-6xl mx-auto">
        {visibleItems.length === 0 ? (
          <div className="text-center py-20 text-[#8c8778] px-5">
            <p className="text-lg font-medium mb-5">
              {isLive && endedCount > 0
                ? "All items have ended — final results are being processed."
                : "No items in this auction yet"}
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5 justify-center max-w-sm mx-auto">
              <Link href={`/${orgSlug}`} className="bg-[#09a7ad] hover:bg-[#0898a0] text-white font-semibold py-2.5 px-5 rounded-xl transition-colors">
                More from {orgSlug.replace(/-/g, " ")}
              </Link>
              <Link href="/auctions" className="border border-[#d4cfc4] hover:border-[#b0a99a] text-[#4a4640] hover:text-[#1a1916] font-medium py-2.5 px-5 rounded-xl transition-colors">
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
                ? "bg-[#f2efe8] text-[#8c8778] text-xs px-3 py-1.5 rounded-xl font-medium"
                : winning
                ? "bg-[#e0f5f5] text-[#0a8a8f] text-xs px-3 py-1.5 rounded-xl font-bold border border-[#09a7ad]/30"
                : "bg-[#09a7ad] hover:bg-[#0898a0] text-white text-xs px-3 py-1.5 rounded-xl font-bold transition-colors";

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
                      ? "border-[#09a7ad]/50 shadow-[0_0_0_1px_rgba(9,167,173,0.15),0_0_20px_rgba(9,167,173,0.08)]"
                      : isClosed || isItemClosed
                      ? "border-[#e5e0d5]/60 opacity-80 hover:border-[#d4cfc4]"
                      : "border-[#e5e0d5] hover:border-[#09a7ad]/40 hover:shadow-[0_0_25px_rgba(9,167,173,0.06)]"
                  }`}
                >
                  {/* Photo */}
                  <div className="w-full aspect-square bg-[#f2efe8] flex items-center justify-center text-[#8c8778] overflow-hidden relative">
                    {primaryPhoto ? (
                      <img
                        src={primaryPhoto}
                        alt={item.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-[#b0a99a]">
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
                      <div className="absolute top-2.5 left-2.5 bg-[#09a7ad] text-white text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1 shadow-sm">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 4.5H1V2.5h1M10 4.5h1V2.5h-1M2 4.5h8v2.5a4 4 0 0 1-8 0V4.5zM3.5 10h5M6 7.5V10"/>
                        </svg>
                        Winning
                      </div>
                    )}
                    {isItemSold && (
                      <div className="absolute top-2.5 right-2.5 bg-[#faf8f4]/80 backdrop-blur-sm text-[#4a4640] text-xs px-2.5 py-1 rounded-full font-semibold">
                        Sold
                      </div>
                    )}
                    {isItemUnsold && (
                      <div className="absolute top-2.5 right-2.5 bg-[#faf8f4]/80 backdrop-blur-sm text-[#8c8778] text-xs px-2.5 py-1 rounded-full font-medium">
                        Ended
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <h3 className="font-bold text-sm leading-tight group-hover:text-[#09a7ad] transition-colors line-clamp-2 mb-2">
                      {item.title}
                    </h3>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-[#8c8778] uppercase tracking-wide">
                          {isItemSold ? "Sold" : isItemUnsold ? "Final" : "Bid"}
                        </div>
                        <div className={`font-extrabold text-base ${isItemUnsold ? "text-[#8c8778]" : "text-[#09a7ad]"}`}>
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
