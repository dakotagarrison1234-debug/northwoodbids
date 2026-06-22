export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserOrg } from "@/lib/auth";
import LocalDate from "@/app/components/LocalDate";
import RefreshButton from "../RefreshButton";

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
      <header className="border-b border-[#e3d6bf] px-4 sm:px-8 py-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-semibold">Auctions ({auctions.length})</h1>
        <div className="flex items-center gap-2 sm:gap-3">
          <RefreshButton />
          <Link href="/admin/auctions/new" className="bg-[#6c4d39] hover:bg-[#563e2c] text-white text-base font-semibold px-6 py-3.5 rounded-xl transition-colors">
            + New Auction
          </Link>
        </div>
      </header>

      <div className="px-4 sm:px-8 py-6">
        {auctions.length === 0 ? (
          <div className="text-center py-20 text-[#8a7559]">
            <p className="text-lg mb-4">No auctions yet</p>
            <Link href="/admin/auctions/new" className="inline-block bg-[#6c4d39] hover:bg-[#563e2c] text-white text-base font-semibold px-6 py-3.5 rounded-xl transition-colors">
              Create your first auction
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
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
                  className="block bg-white border border-[#e3d6bf] hover:border-[#b9a98c] rounded-xl p-6 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-xl truncate">{auction.title}</h3>
                        <span className={`text-sm px-2.5 py-0.5 rounded-full shrink-0 ${
                          auction.status === "OPEN" ? "bg-[#6c4d39]/20 text-[#6c4d39]"
                          : auction.status === "CLOSING" ? "bg-yellow-500/20 text-amber-600"
                          : isScheduled ? "bg-blue-500/20 text-blue-600"
                          : auction.status === "DRAFT" ? "bg-[#e7dcc6] text-[#6f5b46]"
                          : "bg-red-500/20 text-red-600"
                        }`}>
                          {isScheduled ? "scheduled" : auction.status.toLowerCase()}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-base text-[#8a7559]">
                        <span>{auction.items.length} items</span>
                        <span className="text-[#6c4d39] font-medium">${raised.toLocaleString()} total</span>
                        {totalBids > 0 && <span>{totalBids} bids</span>}
                        <span>
                          <LocalDate iso={auction.startAt.toISOString()} format="date" /> → <LocalDate iso={auction.endAt.toISOString()} format="date" />
                        </span>
                      </div>
                    </div>
                    <span className="text-[#8a7559] hover:text-[#241a12] text-base font-semibold whitespace-nowrap shrink-0 self-end sm:self-auto">
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
