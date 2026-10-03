export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { requireUserOrg } from "@/lib/auth";
import PusherRefresh from "@/app/components/PusherRefresh";
import { IcoGavel } from "@/app/components/BidIcons";
import { PageHeader, PageBody, BtnLink, Empty } from "../ui";
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
        id: true, title: true, status: true, startAt: true, endAt: true, archived: true,
        _count: { select: { items: true } },
      },
    }),
    // Sum current bids across items that currently carry value: still-live ACTIVE
    // items (so a LIVE auction shows its running "bid so far" total) AND already-sold
    // items (so a CLOSED auction shows what it made). Without ACTIVE here, a live
    // auction always read $0 because none of its items are sold yet.
    prisma.item.groupBy({
      by: ["auctionId"],
      where: { organizationId: orgId, status: { in: [...SOLD_STATUSES, "ACTIVE"] } },
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
    archived: a.archived,
    isScheduled: a.status === "DRAFT" && a.startAt > now,
    itemsCount: a._count.items,
    raised: raisedBy.get(a.id) ?? 0,
    totalBids: bidsBy.get(a.id) ?? 0,
    startAtIso: a.startAt.toISOString(),
    endAtIso: a.endAt.toISOString(),
  }));

  // Archived (test/junk) auctions get their own collapsed group and are pulled out
  // of the working live/upcoming/closed lists.
  const active = summaries.filter((a) => !a.archived);
  const archived = summaries
    .filter((a) => a.archived)
    .sort((a, b) => b.endAtIso.localeCompare(a.endAtIso));
  const live = active
    .filter((a) => a.status === "OPEN" || a.status === "CLOSING")
    .sort((a, b) => a.endAtIso.localeCompare(b.endAtIso));
  const upcoming = active
    .filter((a) => a.status === "DRAFT")
    .sort((a, b) => a.startAtIso.localeCompare(b.startAtIso));
  const closed = active
    .filter((a) => a.status !== "OPEN" && a.status !== "CLOSING" && a.status !== "DRAFT")
    .sort((a, b) => b.endAtIso.localeCompare(a.endAtIso));

  return (
    <>
      <PusherRefresh channel="auctions" event="auction-updated" />
      <PageHeader
        title="Auctions"
        sub="Build, run and close auctions."
        actions={<BtnLink href="/admin/auctions/new" size="sm">New auction</BtnLink>}
      />

      <PageBody>
        {auctions.length === 0 ? (
          <div className="bg-white border border-[#e6dac6] rounded-2xl">
            <Empty
              icon={<IcoGavel className="w-10 h-10" />}
              text="No auctions yet."
              sub="Create your first one and start adding lots."
              action={<BtnLink href="/admin/auctions/new">Create your first auction</BtnLink>}
            />
          </div>
        ) : (
          <AuctionsList live={live} upcoming={upcoming} closed={closed} archived={archived} />
        )}
      </PageBody>
    </>
  );
}
