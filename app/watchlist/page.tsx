export const dynamic = "force-dynamic";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toViewItem } from "@/lib/viewItem";
import AuctionItemsView, { type ViewItem } from "@/app/components/AuctionItemsView";
import PusherRefresh from "@/app/components/PusherRefresh";
import { BidCritter, IcoStar } from "@/app/components/BidIcons";

/**
 * /watchlist — the lots a bidder has starred, laid out exactly like an auction
 * preview grid so it works as their own personal auction. Only LIVE and UPCOMING
 * lots are shown; anything that has ended is pruned from the watchlist on read, so
 * the list never fills with stale history. Tapping a card opens the lot with the
 * sticky bid bar, so bidding straight from here is one tap.
 */
export default async function WatchlistPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const rows = await prisma.watchlistItem.findMany({
    where: { clerkUserId: userId },
    select: {
      id: true,
      item: {
        select: {
          id: true,
          title: true,
          status: true,
          currentBid: true,
          startingBid: true,
          retailValue: true,
          condition: true,
          size: true,
          packSize: true,
          isPremium: true,
          itemEndAt: true,
          photos: { select: { url: true, isPrimary: true } },
          bids: { where: { status: "ACTIVE" }, orderBy: { amount: "desc" }, take: 1, select: { clerkUserId: true } },
          auction: {
            select: {
              slug: true,
              status: true,
              endAt: true,
              startAt: true,
              archived: true,
              organization: { select: { slug: true } },
            },
          },
        },
      },
    },
  });

  const now = Date.now();
  const live: typeof rows = [];
  const upcoming: typeof rows = [];
  const stale: string[] = [];

  for (const r of rows) {
    const it = r.item;
    const a = it.auction;
    if (!a || a.archived) { stale.push(r.id); continue; }
    const auctionLive = a.status === "OPEN" || a.status === "CLOSING";
    const endMs = (it.itemEndAt ?? a.endAt).getTime();
    if (auctionLive && it.status === "ACTIVE" && endMs > now) live.push(r);
    else if (a.status === "DRAFT") upcoming.push(r);
    else stale.push(r.id); // sold / unsold / closed — off the list
  }
  // Self-clean: drop ended lots so the watchlist stays live + upcoming only.
  if (stale.length) await prisma.watchlistItem.deleteMany({ where: { id: { in: stale } } });

  // Soonest-ending first, then upcoming by when their auction opens.
  live.sort((x, y) => (x.item.itemEndAt ?? x.item.auction!.endAt).getTime() - (y.item.itemEndAt ?? y.item.auction!.endAt).getTime());
  upcoming.sort((x, y) => x.item.auction!.startAt.getTime() - y.item.auction!.startAt.getTime());
  const ordered = [...live, ...upcoming];

  // Which of these has the user bid on (so cards can flag "Outbid")?
  const ids = ordered.map((r) => r.item.id);
  const userBidItemIds = new Set<string>();
  if (ids.length) {
    const myBids = await prisma.bid.findMany({
      where: { clerkUserId: userId, itemId: { in: ids } },
      select: { itemId: true },
      distinct: ["itemId"],
    });
    for (const b of myBids) userBidItemIds.add(b.itemId);
  }

  const items: ViewItem[] = ordered.map((r) =>
    toViewItem(
      r.item,
      {
        slug: r.item.auction!.slug,
        status: r.item.auction!.status,
        endAt: r.item.auction!.endAt,
        orgSlug: r.item.auction!.organization.slug,
      },
      { userId, userBidItemIds }
    )
  );

  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      <PusherRefresh channel="auctions" event="auction-updated" />
      <div className="px-5 sm:px-8 py-6 sm:py-8 max-w-6xl mx-auto">
        <div className="flex items-end justify-between gap-3 mb-5">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight flex items-center gap-2">
              <IcoStar className="w-7 h-7 text-[#c47b3e]" filled /> Watchlist
            </h1>
            <p className="text-sm text-[#6f5b46] mt-1">
              {live.length} live · {upcoming.length} upcoming — tap any lot to bid.
            </p>
          </div>
          <Link href="/dashboard" className="text-[#6c4d39] hover:text-[#563e2c] text-sm font-semibold underline underline-offset-2 shrink-0">
            My Bids
          </Link>
        </div>

        {items.length === 0 ? (
          <div className="bg-white border border-[#e3d6bf] rounded-2xl p-10 text-center max-w-lg mx-auto">
            <BidCritter className="w-20 h-20 mx-auto mb-3" />
            <p className="font-display text-xl font-black text-[#241a12]">Nothing on your watchlist yet</p>
            <p className="text-sm text-[#6f5b46] mt-1.5">
              Tap the star on any lot to keep an eye on it. Live and upcoming lots collect here so you can bid from one place.
            </p>
            <Link href="/auctions" className="inline-block mt-5 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold px-6 py-3 rounded-xl text-sm">
              Browse auctions
            </Link>
          </div>
        ) : (
          <AuctionItemsView items={items} isStaff={false} />
        )}
      </div>
    </main>
  );
}
