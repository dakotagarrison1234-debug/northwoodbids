export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserOrg } from "@/lib/auth";
import RefreshButton from "../RefreshButton";
import PusherRefresh from "@/app/components/PusherRefresh";
import AuctionsList, { type AuctionSummary } from "./AuctionsList";

const SOLD_STATUSES = ["SOLD", "PENDING_PICKUP", "PICKED_UP"];

export default async function AuctionsPage() {
  const membership = await requireUserOrg();

  const auctions = await prisma.auction.findMany({
    where: { organizationId: membership.organization.id },
    orderBy: { createdAt: "desc" },
    include: {
      // Only the fields the summary needs — never load bid rows (counts via _count).
      items: { select: { status: true, currentBid: true, _count: { select: { bids: true } } } },
    },
  });

  const now = new Date();
  const summaries: AuctionSummary[] = auctions.map((auction) => {
    const raised = auction.items
      .filter((i) => SOLD_STATUSES.includes(i.status))
      .reduce((sum, i) => sum + Number(i.currentBid), 0);
    const totalBids = auction.items.reduce((sum, i) => sum + i._count.bids, 0);
    const isScheduled = auction.status === "DRAFT" && auction.startAt > now;
    return {
      id: auction.id,
      title: auction.title,
      status: auction.status,
      isScheduled,
      itemsCount: auction.items.length,
      raised,
      totalBids,
      startAtIso: auction.startAt.toISOString(),
      endAtIso: auction.endAt.toISOString(),
    };
  });

  // Live = OPEN/CLOSING (soonest to close first); Upcoming = not-yet-open DRAFTs
  // (soonest to open first); Closed = everything else (most recent first).
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
      <header className="border-b border-[#e3d6bf] px-6 sm:px-8 py-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-semibold">Auctions ({auctions.length})</h1>
        <div className="flex items-center gap-2 sm:gap-3">
          <RefreshButton />
          <Link href="/admin/auctions/new" className="bg-[#6c4d39] hover:bg-[#563e2c] text-white text-base font-semibold px-6 py-3.5 rounded-xl transition-colors">
            + New Auction
          </Link>
        </div>
      </header>

      <div className="px-6 sm:px-8 py-6">
        {auctions.length === 0 ? (
          <div className="text-center py-20 text-[#8a7559]">
            <p className="text-lg mb-4">No auctions yet</p>
            <Link href="/admin/auctions/new" className="inline-block bg-[#6c4d39] hover:bg-[#563e2c] text-white text-base font-semibold px-6 py-3.5 rounded-xl transition-colors">
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
