export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserOrg } from "@/lib/auth";
import PusherRefresh from "@/app/components/PusherRefresh";
import AuctionsList, { type AuctionSummary } from "./AuctionsList";

const SOLD_STATUSES = ["SOLD", "PENDING_PICKUP", "PICKED_UP"] as const;

export default async function AuctionsPage() {
  const membership = await requireUserOrg();
  const orgId = membership.organization.id;

  // Three fixed queries regardless of size. The old version pulled EVERY item of
  // EVERY auction just to count them and sum their bids — at 100 auctions of 200
  // items that's 20,000 rows loaded to render a list of headlines.
  const [auctions, soldSums, bidCounts] = await Promise.all([
    prisma.auction.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, title: true, status: true, startAt: true, endAt: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.item.groupBy({
      by: ["auctionId"],
      where: { organizationId: orgId, status: { in: [...SOLD_STATUSES] } },
      _sum: { currentBid: true },
    }),
    prisma.bid.groupBy({
      by: ["itemId"],
      where: { item: { organizationId: orgId } },
      _count: { _all: true },
    }),
  ]);

  const raisedBy = new Map(soldSums.map((r) => [r.auctionId, Number(r._sum.currentBid ?? 0)]));

  // Bid counts come back per item; roll them up per auction in one pass.
  const itemAuction = await prisma.item.findMany({
    where: { organizationId: orgId, auctionId: { not: null } },
    select: { id: true, auctionId: true },
  });
  const auctionOfItem = new Map(itemAuction.map((i) => [i.id, i.auctionId]));
  const bidsBy = new Map<string, number>();
  for (const b of bidCounts) {
    const aid = auctionOfItem.get(b.itemId);
    if (!aid) continue;
    bidsBy.set(aid, (bidsBy.get(aid) ?? 0) + b._count._all);
  }

  const now = new Date();
  const summaries: AuctionSummary[] = auctions.map((a) => ({
    id: a.id,
    title: a.title,
    status: a.status,
    isScheduled: a.status === "DRAFT" && a.startAt > now,
    itemsCount: a._count.items,
    raised: raisedBy.get(a.id) ?? 0,
    totalBids: bidsBy.get(a.id) ?? 0,
    startAtIso: a.startAt.toISOString(),
    endAtIso: a.endAt.toISOString(),
  }));

  const live = summaries
    .filter((a) => a.status === "OPEN" || a.status === "CLOSING")
    .sort((a, b) => a.endAtIso.localeCompare(b.endAtIso));
  const upcoming = summaries
    .filter((a) => a.status === "DRAFT")
    .sort((a, b) => a.startAtIso.localeCompare(b.startAtIso));
  const closed = summaries
    .filter((a) => a.status !== "OPEN" && a.status !== "CLOSING" && a.status !== "DRAFT")
    .sort((a, b) => b.endAtIso.localeCompare(a.endAtIso));

  return (
    <>
      <PusherRefresh channel="auctions" event="auction-updated" />
      <header className="border-b border-slate-200 bg-white px-4 sm:px-8 py-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900">Auctions</h1>
        <Link
          href="/admin/auctions/new"
          className="shrink-0 inline-flex items-center justify-center min-h-[48px] px-5 rounded-xl bg-slate-900 text-white font-bold text-base"
        >
          + New
        </Link>
      </header>

      <div className="px-4 sm:px-8 py-5 max-w-2xl w-full">
        {auctions.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-lg text-slate-500 mb-4">No auctions yet.</p>
            <Link
              href="/admin/auctions/new"
              className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-xl bg-slate-900 text-white font-bold text-base"
            >
              Create your first auction
            </Link>
          </div>
        ) : (
          <AuctionsList live={live} upcoming={upcoming} closed={closed} />
        )}
      </div>
    </>
  );
}
