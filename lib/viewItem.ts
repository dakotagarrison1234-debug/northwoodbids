import type { ViewItem } from "@/app/components/AuctionItemsView";

/**
 * Builds the pre-computed card model (`ViewItem`) the auction grid renders — the
 * same price label, badge, CTA and card styling the auction preview page uses —
 * from a lot + its auction. Lets the watchlist render lots from MANY auctions with
 * the exact look of the auction grid, so a bidder's watchlist reads like their own
 * personal preview screen.
 *
 * Mirrors the logic in app/[orgSlug]/[auctionSlug]/page.tsx.
 */

export type SourceItem = {
  id: string;
  title: string;
  status: string;
  currentBid: unknown;
  startingBid: unknown;
  retailValue: unknown;
  condition: string;
  size: string | null;
  packSize: number | null;
  isPremium: boolean;
  itemEndAt: Date | null;
  photos: { url: string; isPrimary: boolean }[];
  /** At most the single highest ACTIVE bid (fetched with take: 1). */
  bids: { clerkUserId: string | null }[];
};

export type SourceAuction = {
  slug: string;
  status: string;
  endAt: Date;
  orgSlug: string;
};

const SOLD_STATUSES = ["SOLD", "PENDING_PICKUP", "PICKED_UP"];

export function toViewItem(
  item: SourceItem,
  auction: SourceAuction,
  ctx: { userId: string | null; userBidItemIds: Set<string> }
): ViewItem {
  const isClosed = auction.status === "CLOSED" || auction.status === "SETTLED";
  const isUpcoming = auction.status === "DRAFT";
  const isLive = auction.status === "OPEN" || auction.status === "CLOSING";

  const isItemSold = SOLD_STATUSES.includes(item.status);
  const isItemUnsold = item.status === "UNSOLD";
  const isItemClosed = isItemSold || isItemUnsold;
  const winning =
    isLive && !isItemClosed && !!ctx.userId && item.bids.length > 0 && item.bids[0].clerkUserId === ctx.userId;
  const outbid = isLive && !isItemClosed && !winning && ctx.userBidItemIds.has(item.id);

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

  const isItemLive = item.status === "ACTIVE" && isLive;
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
    href: `/${auction.orgSlug}/${auction.slug}/item/${item.id}`,
    editHref: `/admin/items/${item.id}`,
    primaryPhoto,
    collage,
    isCombo,
    packSize,
    condition,
    size: item.size ?? null,
    priceLabel,
    priceValue,
    bidAmount: Number(item.currentBid),
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
}
