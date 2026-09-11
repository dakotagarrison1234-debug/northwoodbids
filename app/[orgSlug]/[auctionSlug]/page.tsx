export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { canAccessOrg } from "@/lib/auth";
import LocalDate from "@/app/components/LocalDate";
import PusherRefresh from "@/app/components/PusherRefresh";
import NotFoundCard from "@/app/components/NotFoundCard";
import AuctionItemsView, { type ViewItem } from "@/app/components/AuctionItemsView";
import { PineMark, WoodenCrate, PineRidge, BranchDivider } from "@/app/components/Illustrations";
import { IcoLock, IcoBolt, IcoMagnifier, BidCritter } from "@/app/components/BidIcons";

interface Props {
  params: Promise<{ orgSlug: string; auctionSlug: string }>;
}

// Per-page share card: auction title + org name + first item's primary photo as
// the OG image. Wrapped in try/catch so a DB hiccup falls back to a basic title
// instead of 500-ing the route. Root layout supplies metadataBase + defaults.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { orgSlug, auctionSlug } = await params;
    const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
    const auction = org
      ? await prisma.auction.findFirst({
          where: { organizationId: org.id, slug: auctionSlug },
          include: {
            items: {
              where: { status: { not: "DRAFT" } },
              include: { photos: true },
              take: 12,
            },
          },
        })
      : null;

    if (!auction) {
      return { title: "Auction" };
    }

    // First available item primary photo, else any photo, else the app icon.
    let ogImage = "/icon-512.png";
    for (const item of auction.items) {
      const primary = item.photos.find((p) => p.isPrimary)?.url ?? item.photos[0]?.url;
      if (primary) {
        ogImage = primary;
        break;
      }
    }

    const title = auction.title;
    const description = `${org!.name} · live auction — bid now`;

    return {
      title,
      description,
      alternates: { canonical: `/${orgSlug}/${auctionSlug}` },
      openGraph: { title, description, images: [ogImage], url: `/${orgSlug}/${auctionSlug}`, type: "website" },
      twitter: { card: "summary_large_image", title, description, images: [ogImage] },
    };
  } catch {
    return { title: "Auction" };
  }
}

function IcoClock({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={`${className} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v4.5l3 2" />
    </svg>
  );
}

// Slim, full-width notice under the header — one line, one icon, one colour per state.
function StatusBanner({
  tone,
  icon,
  children,
}: {
  tone: "closed" | "closing" | "upcoming";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const t =
    tone === "closing"
      ? "bg-[#f7e4c9] border-[#e3c9a3] text-[#8a5a2b]"
      : tone === "upcoming"
      ? "bg-[#e9dcc6] border-[#d9c7a8] text-[#6c4d39]"
      : "bg-[#f4efe4] border-[#e3d6bf] text-[#8a7559]";
  return (
    <div className={`border-b px-4 sm:px-8 py-2.5 ${t}`}>
      <div className="max-w-6xl mx-auto flex items-center gap-2.5 text-sm font-semibold">
        {icon}
        <span className="min-w-0">{children}</span>
      </div>
    </div>
  );
}

// "Next auction" pill — cycles the bidder to the next live auction so they can keep
// browsing/bidding without going back to the list.
function NextAuctionLink({ href, title, position }: { href: string; title: string; position: "top" | "bottom" }) {
  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-3 rounded-xl bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold transition-colors shrink-0 shadow-[0_8px_20px_-10px_rgba(108,77,57,0.9)] ${
        position === "top" ? "px-4 py-2.5" : "px-6 py-3.5"
      }`}
    >
      <span className="flex flex-col items-start leading-tight min-w-0">
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#f0a35a]">Next auction</span>
        <span className={`truncate max-w-[8rem] sm:max-w-[14rem] ${position === "top" ? "text-sm" : "text-base"}`}>{title}</span>
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 group-hover:translate-x-0.5 transition-transform" aria-hidden>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </Link>
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
        include: {
          photos: true,
          // Only the single top ACTIVE bid per item (uses [itemId, status, amount] index)
          // — enough to decide current price + "is this user winning" without pulling history.
          bids: { where: { status: "ACTIVE" }, orderBy: { amount: "desc" }, take: 1 },
        },
      },
    },
  }) : null;

  if (!auction) {
    return (
      <NotFoundCard
        title="Auction not found"
        message="This auction may have ended or the link is incorrect."
        actions={[
          { href: "/auctions", label: "Browse Auctions", primary: true },
          { href: "/", label: "Go home" },
        ]}
      />
    );
  }

  // Staff/admin viewing the public page get inline "edit listing" pencils.
  const isStaff = await canAccessOrg(auction.organizationId);

  // "Next auction" cycle — the org's live auctions in end-time order, wrapping around,
  // so a bidder can jump straight to the next one. Null when there's nowhere to go.
  const cycleAuctions = await prisma.auction.findMany({
    where: { organizationId: auction.organizationId, status: { in: ["OPEN", "CLOSING"] }, archived: false },
    select: { slug: true, title: true },
    orderBy: { endAt: "asc" },
  });
  let nextAuction: { slug: string; title: string } | null = null;
  if (cycleAuctions.length > 0) {
    const idx = cycleAuctions.findIndex((a) => a.slug === auction.slug);
    const cand = cycleAuctions[idx === -1 ? 0 : (idx + 1) % cycleAuctions.length];
    if (cand.slug !== auction.slug) nextAuction = cand;
  }

  // Which lots has THIS user bid on? Lets each card flag "Outbid" at a glance so a
  // bidder scanning the grid can see what they're losing — not just what they're winning.
  const userBidItemIds = new Set<string>();
  if (userId) {
    const myBids = await prisma.bid.findMany({
      where: { clerkUserId: userId, item: { auctionId: auction.id } },
      select: { itemId: true },
      distinct: ["itemId"],
    });
    for (const b of myBids) userBidItemIds.add(b.itemId);
  }

  const isClosed = auction.status === "CLOSED" || auction.status === "SETTLED";
  const isClosing = auction.status === "CLOSING";
  // Upcoming = scheduled but not yet opened. Bidders can preview the lots, but
  // nothing is biddable until it opens.
  const isUpcoming = auction.status === "DRAFT";
  const isLive = auction.status === "OPEN" || auction.status === "CLOSING";

  // Helper: is the current user the top bidder on this item?
  // `bids` now holds at most the single highest ACTIVE bid (fetched with take: 1),
  // so the top bidder is simply that row's owner — no client-side sort needed.
  const isUserWinning = (bids: { clerkUserId: string | null; amount: unknown }[]) => {
    if (!userId || bids.length === 0) return false;
    return bids[0].clerkUserId === userId;
  };

  const SOLD_STATUSES = ["SOLD", "PENDING_PICKUP", "PICKED_UP"];

  // Only show items that are visible to bidders (not DRAFT).
  // While the auction is LIVE, only items STILL BIDDABLE stay on the grid: status
  // ACTIVE *and* their (popcorn-extended) end time hasn't passed yet. This is what
  // matters after the main end time — once the auction is closing, the dozens of
  // items whose time is up drop off immediately (even before the cron marks them
  // sold/unsold), so the handful that got extended by late bids are easy to find
  // and keep bidding, instead of being buried among items that still say "ending".
  // Once the whole auction has closed, show everything as the historical view.
  const nowMs = Date.now();
  const stillBiddable = (i: (typeof auction.items)[number]) =>
    i.status === "ACTIVE" && (i.itemEndAt ?? auction.endAt).getTime() > nowMs;
  const allVisible = auction.items.filter(i => i.status !== "DRAFT");
  const visibleItems = isUpcoming
    ? auction.items // preview every lot before it opens
    : isLive
    ? allVisible.filter(stillBiddable)
    : allVisible;
  const endedCount = allVisible.length - (isLive ? visibleItems.length : 0);

  // Premium items float to the top of the grid (order among them doesn't matter).
  const premiumFirst = [...visibleItems].sort((a, b) => (b.isPremium ? 1 : 0) - (a.isPremium ? 1 : 0));

  // Pre-compute every display value here (server-side, where auth + status live)
  // so the client view component only lays them out — grid card or list row.
  const viewItems: ViewItem[] = premiumFirst.map((item) => {
    const isItemSold = SOLD_STATUSES.includes(item.status);
    const isItemUnsold = item.status === "UNSOLD";
    const isItemClosed = isItemSold || isItemUnsold;
    const winning = isLive && !isItemClosed && isUserWinning(item.bids);
    // Bid on this lot, live, but not the top bid → they're being outbid.
    const outbid = isLive && !isItemClosed && !winning && userBidItemIds.has(item.id);
    const bidLabel = isUpcoming ? "Preview" : isItemUnsold ? "Ended" : isItemSold ? "Sold" : isClosed ? "Closed" : winning ? "You're winning" : outbid ? "You're outbid" : "Bid now";
    const bidClass = `block w-full text-center rounded-xl py-2 text-xs font-bold transition-colors ${
      isUpcoming
        ? "bg-[#efe3d0] text-[#6c4d39] border border-[#6c4d39]/20"
        : isClosed || isItemClosed
        ? "bg-[#f4efe4] text-[#a3927b]"
        : winning
        ? "bg-[#e4f2e4] text-[#2f5d3a] border border-[#5f7a45]/45"
        : outbid
        ? "bg-red-600 group-hover:bg-red-700 text-white"
        : "bg-[#6c4d39] group-hover:bg-[#563e2c] text-white"
    }`;
    const cardClass = `cv-card flex flex-col h-full bg-white border rounded-2xl overflow-hidden transition-all group ${
      item.isPremium
        ? "nb-premium border-2"
        : winning
        ? "border-[#5f7a45]/55 shadow-[0_0_0_1px_rgba(95,122,69,0.18),0_0_20px_rgba(95,122,69,0.10)]"
        : outbid
        ? "border-red-400 shadow-[0_0_0_1px_rgba(220,38,38,0.18),0_0_18px_rgba(220,38,38,0.10)]"
        : isClosed || isItemClosed
        ? "border-[#e3d6bf]/60 opacity-80 hover:border-[#cdbda3]"
        : "border-[#e3d6bf] hover:border-[#6c4d39]/40 hover:shadow-[0_0_25px_rgba(108,77,57,0.06)]"
    }`;

    const priceLabel = isUpcoming
      ? "Starts at"
      : isItemSold
      ? "Sold for"
      : isItemUnsold
      ? "Ended at"
      : Number(item.currentBid) > 0
      ? "Current bid"
      : "No bids yet";
    const priceValue = isUpcoming ? Number(item.startingBid) : Number(item.currentBid);
    const condition = item.condition.replace("_", " ").toLowerCase();
    const primaryPhoto = item.photos.find((p) => p.isPrimary)?.url || item.photos[0]?.url || null;

    const packSize = item.packSize ?? 0;
    const isCombo = packSize > 1;
    const collage = [...item.photos]
      .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
      .slice(0, 4)
      .map((p) => p.url);

    const isItemLive =
      item.status === "ACTIVE" && (auction.status === "OPEN" || auction.status === "CLOSING");
    const itemEndAtIso = (item.itemEndAt ?? auction.endAt).toISOString();

    const badge = isItemSold
      ? { text: "Sold", cls: "bg-[#241a12]/80 text-white" }
      : isItemUnsold
      ? { text: "Ended", cls: "bg-[#f1e7d5]/85 text-[#8a7559]" }
      : winning
      ? { text: "Winning", cls: "bg-[#5f7a45] text-white" }
      : outbid
      ? { text: "Outbid", cls: "bg-red-600 text-white" }
      : item.isPremium
      ? { text: "Featured", cls: "bg-[#c47b3e] text-white" }
      : null;

    return {
      id: item.id,
      title: item.title,
      href: `/${orgSlug}/${auctionSlug}/item/${item.id}`,
      editHref: `/admin/items/${item.id}`,
      primaryPhoto,
      collage,
      isCombo,
      packSize,
      condition,
      size: item.size ?? null,
      priceLabel,
      priceValue,
      bidAmount: Number(item.currentBid), // 0 = no bids yet — drives the bid filter/sort
      retailValue: Number(item.retailValue),
      bidLabel,
      bidClass,
      cardClass,
      badge,
      isPremium: item.isPremium,
      winning,
      isItemUnsold,
      isItemLive,
      itemEndAtIso,
    };
  });

  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      {/* Live refresh: re-renders this page when bids land or items/auctions close */}
      <PusherRefresh channel="auctions" event="auction-updated" />

      {/* Status banners */}
      {isClosed && (
        <StatusBanner tone="closed" icon={<IcoLock className="w-4 h-4 shrink-0" />}>
          This auction has closed. Bidding is over; results are final.
        </StatusBanner>
      )}
      {isClosing && !isClosed && (
        <StatusBanner tone="closing" icon={<IcoBolt className="w-4 h-4 shrink-0" />}>
          Closing now. Lots with late bids stay open a little longer, so get your final bids in.
        </StatusBanner>
      )}
      {isUpcoming && (
        <StatusBanner tone="upcoming" icon={<IcoMagnifier className="w-4 h-4 shrink-0" />}>
          Preview only for now. Bidding opens <LocalDate iso={auction.startAt.toISOString()} />.
        </StatusBanner>
      )}

      {/* Auction header */}
      <div className="relative overflow-hidden bg-[#efe5d3]/80 border-b border-[#e3d6bf]/60 px-4 sm:px-8 pt-6 sm:pt-8 pb-14 sm:pb-16">
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-[640px] h-[220px] bg-[#f0a35a]/10 rounded-full blur-[70px]" />
          <PineRidge className="nb-feather-x absolute bottom-0 left-0 w-full h-16 sm:h-20 opacity-25" />
        </div>
        <div className="relative max-w-6xl mx-auto flex items-start sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] px-2.5 py-1 rounded-full border ${
                  isClosed
                    ? "bg-[#f4efe4] text-[#8a7559] border-[#e3d6bf]"
                    : isClosing
                    ? "bg-[#f7e4c9] text-[#a85f28] border-[#c47b3e]/30"
                    : isUpcoming
                    ? "bg-[#efe3d0] text-[#6c4d39] border-[#6c4d39]/20"
                    : "bg-[#e4f2e4] text-[#2f5d3a] border-[#4a7c59]/30"
                }`}
              >
                {isLive ? (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className={`absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping ${isClosing ? "bg-[#c47b3e]" : "bg-[#4a7c59]"}`} />
                    <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${isClosing ? "bg-[#c47b3e]" : "bg-[#4a7c59]"}`} />
                  </span>
                ) : (
                  <PineMark className="w-3 h-3" />
                )}
                {isClosed ? "Closed" : isClosing ? "Closing" : isUpcoming ? "On deck" : "Live"}
              </span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight leading-[0.95] text-[#241a12] break-words">
              {auction.title}
            </h1>
            <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#6f5b46] font-medium tabular-nums">
              <span className="inline-flex items-center gap-1.5">
                <PineMark className="w-3.5 h-3.5" />
                {isLive
                  ? `${visibleItems.length} live lot${visibleItems.length !== 1 ? "s" : ""}`
                  : `${visibleItems.length} lot${visibleItems.length !== 1 ? "s" : ""}`}
              </span>
              {isLive && endedCount > 0 && (
                <>
                  <span className="text-[#cdbda3]">&middot;</span>
                  <span>{endedCount} ended</span>
                </>
              )}
              <span className="text-[#cdbda3]">&middot;</span>
              <span className="inline-flex items-center gap-1.5">
                <IcoClock className="w-3.5 h-3.5 text-[#8a7559]" />
                {isUpcoming ? (
                  <>Opens <LocalDate iso={auction.startAt.toISOString()} /></>
                ) : (
                  <>{isClosed ? "Closed" : isClosing ? "Closing" : "Closes"}{" "}<LocalDate iso={auction.endAt.toISOString()} /></>
                )}
              </span>
            </p>
          </div>
          {nextAuction && (
            <NextAuctionLink href={`/${orgSlug}/${nextAuction.slug}`} title={nextAuction.title} position="top" />
          )}
        </div>
      </div>

      {/* Item grid */}
      <section className="px-3 sm:px-8 py-4 sm:py-8 max-w-6xl mx-auto">
        {visibleItems.length === 0 ? (
          <div className="text-center py-16 px-6 rounded-2xl border border-dashed border-[#cdbda3] bg-[#fbf4e6]/70">
            <div className="nb-float flex justify-center mb-4">
              {isLive && endedCount > 0 ? <BidCritter className="w-20 h-20" /> : <WoodenCrate className="w-28 h-24" />}
            </div>
            <p className="font-display text-2xl font-black tracking-tight text-[#241a12]">
              {isLive && endedCount > 0 ? "That's the last gavel" : "The crate's still packed"}
            </p>
            <p className="text-sm text-[#6f5b46] mt-1.5 max-w-sm mx-auto leading-relaxed">
              {isLive && endedCount > 0
                ? "Every lot in this auction has closed. Winners are being sorted now; check your dashboard for results."
                : "Lots for this auction haven't been listed yet. Check back soon."}
            </p>
            <div className="flex flex-wrap justify-center gap-2.5 mt-6">
              {isLive && endedCount > 0 && (
                <Link href="/dashboard" className="rounded-xl border-2 border-[#6c4d39]/25 hover:border-[#6c4d39]/50 bg-white text-[#6c4d39] font-bold py-3 px-6 transition-colors text-sm">
                  My results
                </Link>
              )}
              <Link href="/auctions" className="rounded-xl bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold py-3 px-6 transition-colors text-sm">
                Browse live auctions
              </Link>
            </div>
          </div>
        ) : (
          <AuctionItemsView items={viewItems} isStaff={isStaff} />
        )}
      </section>

      {/* Cycle to the next live auction — keep browsing without backing out. */}
      {nextAuction && (
        <div className="px-3 sm:px-8 pb-14 max-w-6xl mx-auto flex flex-col items-center gap-4">
          <BranchDivider className="w-56 h-6 opacity-80" />
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8a7559]">Keep the streak going</p>
          <NextAuctionLink href={`/${orgSlug}/${nextAuction.slug}`} title={nextAuction.title} position="bottom" />
        </div>
      )}
    </main>
  );
}
