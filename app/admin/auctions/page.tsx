export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserOrg } from "@/lib/auth";
import LocalDate from "@/app/components/LocalDate";

const SOLD_STATUSES = ["SOLD", "PENDING_PICKUP", "PICKED_UP"];

export default async function AuctionsPage() {
  const membership = await requireUserOrg();

  const auctions = await prisma.auction.findMany({
    where: { organizationId: membership.organization.id },
    orderBy: { createdAt: "desc" },
    include: {
      items: { include: { bids: { select: { id: true } } } },
    },
  });

  return (
    <>
      <header className="border-b border-[#e3d6bf] px-4 sm:px-8 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Auctions ({auctions.length})</h1>
        <Link href="/admin/auctions/new" className="bg-[#a4592a] hover:bg-[#843f1c] text-white text-sm px-4 py-2 rounded-lg">
          + New Auction
        </Link>
      </header>

      <div className="px-4 sm:px-8 py-6">
        {auctions.length === 0 ? (
          <div className="text-center py-20 text-[#8a7559]">
            <p className="text-lg mb-4">No auctions yet</p>
            <Link href="/admin/auctions/new" className="bg-[#a4592a] hover:bg-[#843f1c] text-white px-6 py-3 rounded-lg">
              Create your first auction
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {auctions.map((auction) => {
              const raised = auction.items
                .filter(i => SOLD_STATUSES.includes(i.status))
                .reduce((sum, i) => sum + Number(i.currentBid), 0);
              const totalBids = auction.items.reduce((sum, i) => sum + i.bids.length, 0);
              const isScheduled = auction.status === "DRAFT" && auction.startAt > new Date();

              return (
                <Link
                  key={auction.id}
                  href={`/admin/auctions/${auction.id}`}
                  className="block bg-white border border-[#e3d6bf] hover:border-[#b9a98c] rounded-xl p-5 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-lg truncate">{auction.title}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                          auction.status === "OPEN" ? "bg-[#a4592a]/20 text-[#a4592a]"
                          : auction.status === "CLOSING" ? "bg-yellow-500/20 text-amber-600"
                          : isScheduled ? "bg-blue-500/20 text-blue-600"
                          : auction.status === "DRAFT" ? "bg-[#e7dcc6] text-[#6f5b46]"
                          : "bg-red-500/20 text-red-600"
                        }`}>
                          {isScheduled ? "scheduled" : auction.status.toLowerCase()}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-[#8a7559]">
                        <span>{auction.items.length} items</span>
                        <span className="text-[#a4592a] font-medium">${raised.toLocaleString()} raised</span>
                        {totalBids > 0 && <span>{totalBids} bids</span>}
                        <span>
                          <LocalDate iso={auction.startAt.toISOString()} format="date" /> → <LocalDate iso={auction.endAt.toISOString()} format="date" />
                        </span>
                      </div>
                    </div>
                    <span className="text-[#8a7559] hover:text-[#241a12] text-sm whitespace-nowrap shrink-0 self-end sm:self-auto">
                      Manage →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
