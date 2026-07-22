export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { canAccessOrg } from "@/lib/auth";
import LocalDate from "@/app/components/LocalDate";
import ItemCardTimer from "@/app/components/ItemCardTimer";
import PusherRefresh from "@/app/components/PusherRefresh";
import NotFoundCard from "@/app/components/NotFoundCard";
import { PineMark, BranchDivider, WoodenCrate } from "@/app/components/Illustrations";

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
      openGraph: { title, description, images: [ogImage] },
      twitter: { card: "summary_large_image", title, description, images: [ogImage] },
    };
  } catch {
    return { title: "Auction" };
  }
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
  // While the auction is LIVE, ended items (sold/unsold) drop off the grid so
  // bidders only see what's still biddable (popcorn stragglers included).
  // Once the whole auction has closed, show everything as the historical view.
  const allVisible = auction.items.filter(i => i.status !== "DRAFT");
  const visibleItems = isUpcoming
    ? auction.items // preview every lot before it opens
    : isLive
    ? allVisible.filter(i => i.status === "ACTIVE")
    : allVisible;
  const endedCount = allVisible.length - (isLive ? visibleItems.length : 0);

  // Premium items float to the top of the grid (order among them doesn't matter).
  const premiumFirst = [...visibleItems].sort((a, b) => (b.isPremium ? 1 : 0) - (a.isPremium ? 1 : 0));

  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      {/* Live refresh: re-renders this page when bids land or items/auctions close */}
      <PusherRefresh channel="auctions" event="auction-updated" />

      {/* Status banners */}
      {isClosed && (
        <div className="bg-[#efe3d0]/40 border-b border-[#cdbda3]/50 px-6 sm:px-8 py-3 flex items-center gap-2.5">
          <IcoLock />
          <span className="text-[#6f5b46] text-sm font-medium">This auction has closed — bidding is no longer available.</span>
        </div>
      )}
      {isClosing && !isClosed && (
        <div className="bg-[#efe0c9] border-b border-[#e3c9a3] px-6 sm:px-8 py-3 flex items-center gap-2.5">
          <span className="text-[#8a5a2b]"><IcoClock /></span>
          <span className="text-[#8a5a2b] text-sm font-semibold">This auction is closing soon — place your final bids now.</span>
        </div>
      )}
      {isUpcoming && (
        <div className="bg-[#6c4d39]/8 border-b border-[#6c4d39]/20 px-6 sm:px-8 py-3 flex items-center gap-2.5">
          <span className="text-[#6c4d39]"><IcoClock /></span>
          <span className="text-[#6c4d39] text-sm font-semibold">
            This auction hasn&apos;t opened yet — preview the lots now. Bidding starts <LocalDate iso={auction.startAt.toISOString()} />.
          </span>
        </div>
      )}

      {/* Auction hero */}
      <div className="relative overflow-hidden bg-[#efe5d3]/80 border-b border-[#e3d6bf]/60 px-6 sm:px-8 py-6 sm:py-8">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-[#6c4d39]/4 rounded-full blur-[60px]" />
        </div>
        <div className="relative max-w-6xl mx-auto flex items-start sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Link href={`/${orgSlug}`} className="text-xs text-[#8a7559] hover:text-[#6c4d39] transition-colors font-medium">
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
              {isUpcoming ? (
                <>Opens <LocalDate iso={auction.startAt.toISOString()} /></>
              ) : (
                <>{isClosed ? "Closed" : isClosing ? "Closing" : "Closes"}{" "}<LocalDate iso={auction.endAt.toISOString()} /></>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Item grid */}
      <section className="px-6 sm:px-8 py-8 sm:py-10 max-w-6xl mx-auto">
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
            <div className="flex justify-center">
              <Link href="/auctions" className="bg-[#6c4d39] hover:bg-[#563e2c] text-white font-semibold py-3.5 px-7 rounded-xl transition-colors text-base">
                Browse Auctions
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
            {premiumFirst.map((item) => {
              const isItemSold = SOLD_STATUSES.includes(item.status);
              const isItemUnsold = item.status === "UNSOLD";
              const isItemClosed = isItemSold || isItemUnsold;
              const winning = isLive && !isItemClosed && isUserWinning(item.bids);
              const bidLabel = isUpcoming ? "Preview" : isItemUnsold ? "Ended" : isItemSold ? "Sold" : isClosed ? "Closed" : winning ? "You're winning" : "Bid now";
              // Full-width CTA bar. On a 2-up mobile grid a small right-aligned pill
              // reads as decoration; a bar reads as the thing to press.
              const bidClass = `block w-full text-center rounded-xl py-2 text-xs font-bold transition-colors ${
                isUpcoming
                  ? "bg-[#efe3d0] text-[#6c4d39] border border-[#6c4d39]/20"
                  : isClosed || isItemClosed
                  ? "bg-[#f4efe4] text-[#a3927b]"
                  : winning
                  ? "bg-[#efe0c9] text-[#563e2c] border border-[#6c4d39]/30"
                  : "bg-[#6c4d39] group-hover:bg-[#563e2c] text-white"
              }`;

              // Price shown depends on where the item is in its life. Every branch
              // gets BOTH a label and a value so the pair always reads as a sentence
              // ("Current bid / $14") instead of a floating number.
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

              // One meta line, always rendered so card heights can't diverge.
              const metaBits = [
                item.condition.replace("_", " ").toLowerCase(),
                item.size || null,
              ].filter(Boolean);

              const primaryPhoto = item.photos.find(p => p.isPrimary)?.url || item.photos[0]?.url;

              // Combo/pack lot: render a collage of up to 4 photos + an "N-Pack" badge.
              const packSize = item.packSize ?? 0;
              const isCombo = packSize > 1;
              const collage = [...item.photos]
                .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
                .slice(0, 4)
                .map((p) => p.url);

              // Live countdown badge — only for items still accepting bids
              const isItemLive =
                item.status === "ACTIVE" &&
                (auction.status === "OPEN" || auction.status === "CLOSING");
              const itemEndAtIso = (item.itemEndAt ?? auction.endAt).toISOString();

              return (
                /* h-full + flex column all the way down is what keeps every card in a
                   row the same height, with prices and CTAs on a shared baseline.
                   Without it, a 1-line title or a missing size silently shortens the
                   card and the whole row goes ragged. */
                <div key={item.id} className="flex flex-col h-full">
                <Link
                  href={`/${orgSlug}/${auctionSlug}/item/${item.id}`}
                  className={`cv-card flex flex-col h-full bg-white border rounded-2xl overflow-hidden transition-all group ${
                    item.isPremium
                      ? "nb-premium border-2"
                      : winning
                      ? "border-[#6c4d39]/50 shadow-[0_0_0_1px_rgba(108,77,57,0.15),0_0_20px_rgba(108,77,57,0.08)]"
                      : isClosed || isItemClosed
                      ? "border-[#e3d6bf]/60 opacity-80 hover:border-[#cdbda3]"
                      : "border-[#e3d6bf] hover:border-[#6c4d39]/40 hover:shadow-[0_0_25px_rgba(108,77,57,0.06)]"
                  }`}
                >
                  {/* Photo */}
                  <div className="w-full aspect-square bg-[#efe3d0] flex items-center justify-center text-[#8a7559] overflow-hidden relative">
                    {isCombo && collage.length > 1 ? (
                      <div className={`absolute inset-0 grid gap-0.5 ${collage.length === 2 ? "grid-cols-2 grid-rows-1" : "grid-cols-2 grid-rows-2"}`}>
                        {collage.map((url, i) => (
                          <div key={i} className={`relative bg-[#efe3d0] overflow-hidden ${collage.length === 3 && i === 0 ? "row-span-2" : ""}`}>
                            <Image src={url} alt="" fill sizes="(max-width:640px) 25vw, 12vw" className="object-cover" />
                          </div>
                        ))}
                      </div>
                    ) : primaryPhoto ? (
                      <Image
                        src={primaryPhoto}
                        alt={item.title}
                        fill
                        sizes="(max-width:640px) 50vw, 25vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
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
                    {/* ── Badge zones. One badge per corner, never two.
                        top-left  = countdown (ItemCardTimer hardcodes this position)
                        top-right = status (premium / winning / sold / ended)
                        bottom-left = N-Pack
                        bottom-right = staff edit
                        Previously Premium, Winning and the timer ALL sat top-left and
                        drew on top of each other on any live featured item. ── */}
                    {isItemLive && <ItemCardTimer itemId={item.id} endAt={itemEndAtIso} />}

                    {(() => {
                      // Exactly one status badge, in priority order.
                      const badge = isItemSold
                        ? { text: "Sold", cls: "bg-[#241a12]/80 text-white" }
                        : isItemUnsold
                        ? { text: "Ended", cls: "bg-[#f1e7d5]/85 text-[#8a7559]" }
                        : winning
                        ? { text: "Winning", cls: "bg-[#6c4d39] text-white" }
                        : item.isPremium
                        ? { text: "Featured", cls: "bg-[#c47b3e] text-white" }
                        : null;
                      if (!badge) return null;
                      return (
                        <div className={`absolute top-2.5 right-2.5 z-10 text-[11px] px-2.5 py-1 rounded-full font-bold shadow-sm backdrop-blur-sm ${badge.cls}`}>
                          {badge.text}
                        </div>
                      );
                    })()}

                    {isCombo && (
                      <div className="absolute bottom-2.5 left-2.5 bg-[#241a12]/85 text-white text-[11px] px-2.5 py-1 rounded-full font-bold shadow-sm z-10">
                        {packSize}-Pack
                      </div>
                    )}
                  </div>

                  {/* ── Info. Fixed-shape block: title (2 lines), meta (1 line), then
                      price + CTA pinned to the bottom via mt-auto so they line up
                      across every card in the row. ── */}
                  <div className="flex flex-col flex-1 p-3">
                    <h3 className="font-bold text-sm leading-snug group-hover:text-[#6c4d39] transition-colors line-clamp-2 min-h-[2.5rem] break-words">
                      {item.title}
                    </h3>

                    {/* Condition and size on ONE line. They used to be two separate
                        micro-rows, and the size row only existed sometimes — which is
                        what made card heights jump around. */}
                    <p className="text-[11px] text-[#8a7559] capitalize truncate mt-0.5">
                      {metaBits.join(" · ")}
                    </p>

                    <div className="mt-auto pt-2.5">
                      <div className="flex items-end justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10px] text-[#8a7559] uppercase tracking-wide leading-none">
                            {priceLabel}
                          </div>
                          <div className={`font-extrabold text-lg leading-tight tabular-nums truncate ${isItemUnsold ? "text-[#8a7559]" : "text-[#6c4d39]"}`}>
                            ${priceValue.toLocaleString()}
                          </div>
                        </div>
                        {/* MSRP sits beside the price it's contrasting with, not
                            floating off on its own row. */}
                        {Number(item.retailValue) > 0 && (
                          <div className="text-right shrink-0">
                            <div className="text-[10px] text-[#8a7559] uppercase tracking-wide leading-none">Retail</div>
                            <div className="text-[13px] font-bold text-[#a32d2d] leading-tight tabular-nums">
                              ${Number(item.retailValue).toLocaleString()}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className={`${bidClass} mt-2.5`}>{bidLabel}</div>
                    </div>
                  </div>
                </Link>

                {/* Staff edit as its own strip UNDER the card, not floating over it.
                    Absolutely positioning it inside the card meant it sat on top of
                    the CTA bar and swallowed taps meant for "Bid now". A separate row
                    can't collide with anything and is a bigger tap target anyway.
                    Nested <Link>s are invalid HTML, so it has to live outside. */}
                {isStaff && (
                  <Link
                    href={`/admin/items/${item.id}`}
                    className="mt-1.5 flex items-center justify-center gap-1.5 rounded-xl border border-[#cdbda3] bg-white/80 hover:bg-white text-[#6c4d39] text-xs font-bold py-2 transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z" /></svg>
                    Edit listing
                  </Link>
                )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
