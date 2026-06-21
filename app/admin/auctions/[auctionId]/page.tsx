export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AuctionStatusButtons from "@/app/components/AuctionStatusButtons";
import LocalDate from "@/app/components/LocalDate";

function IcoWarning() {
  return <svg width="14" height="14" fill="none" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 2L1.5 12h11L7 2z"/><path d="M7 6v3M7 10.5v.5"/></svg>;
}
function IcoCheck() {
  return <svg width="12" height="12" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6l3 3 5-5"/></svg>;
}
function IcoPin() {
  return <svg width="11" height="11" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="5" r="2"/><path d="M6 1C3.79 1 2 2.79 2 5c0 3 4 7 4 7s4-4 4-7c0-2.21-1.79-4-4-4z"/></svg>;
}
function IcoBox() {
  return <svg width="40" height="40" fill="none" viewBox="0 0 40 40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 5L5 12.5v15L20 35l15-7.5v-15L20 5z"/><path d="M5 12.5l15 7.5 15-7.5M20 20v15"/><path d="M12.5 8.75L27.5 16.25"/></svg>;
}

interface Props {
  params: Promise<{ auctionId: string }>;
}

export default async function ManageAuctionPage({ params }: Props) {
  const { auctionId } = await params;

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      items: { include: { photos: true, bids: true } },
      organization: true,
    },
  });

  if (!auction) {
    return (
      <div className="flex items-center justify-center flex-1">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Auction not found</h1>
          <Link href="/admin/auctions" className="text-[#a4592a]">Back to auctions</Link>
        </div>
      </div>
    );
  }

  const SOLD_STATUSES = ["SOLD", "PENDING_PICKUP", "PICKED_UP"];
  // For live auctions, show all current bid totals; for closed/settled show confirmed sold amounts
  const totalRaised = (auction.status === "OPEN" || auction.status === "CLOSING")
    ? auction.items.filter(i => i.status === "ACTIVE").reduce((sum, item) => sum + Number(item.currentBid), 0)
    : auction.items.filter(i => SOLD_STATUSES.includes(i.status)).reduce((sum, item) => sum + Number(item.currentBid), 0);
  const totalBids = auction.items.reduce((sum, item) => sum + item.bids.length, 0);
  const now = new Date();
  const isScheduled = auction.status === "DRAFT" && auction.startAt > now;
  const isPastStart = auction.status === "DRAFT" && auction.startAt <= now;

  return (
    <>
      <header className="border-b border-[#e3d6bf] px-4 sm:px-8 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link href="/admin/auctions" className="text-[#6f5b46] hover:text-[#241a12] text-sm shrink-0">← Auctions</Link>
          <span className="text-[#8a7559]">/</span>
          <h1 className="text-lg sm:text-xl font-semibold truncate">{auction.title}</h1>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
            auction.status === "OPEN" ? "bg-[#a4592a]/20 text-[#843f1c]"
            : auction.status === "CLOSING" ? "bg-amber-100 text-amber-700"
            : auction.status === "CLOSED" || auction.status === "SETTLED" ? "bg-red-50 text-red-600"
            : isScheduled ? "bg-[#a4592a]/15 text-[#843f1c]"
            : "bg-[#e7dcc6] text-[#4a3a2b]"
          }`}>
            {isScheduled ? "scheduled" : auction.status.toLowerCase()}
          </span>
          {isPastStart && (
            <span className="text-xs text-amber-600 bg-yellow-500/10 px-2 py-1 rounded-full shrink-0">
              <span className="inline-flex items-center gap-1"><IcoWarning /> opens on next cron run</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Link
            href={`/${auction.organization.slug}/${auction.slug}`}
            target="_blank"
            className="text-[#4a3a2b] hover:text-[#241a12] font-medium text-xs sm:text-sm bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] px-3 py-2 rounded-lg whitespace-nowrap transition-colors"
          >
            View ↗
          </Link>
          <AuctionStatusButtons auctionId={auction.id} status={auction.status} />
        </div>
      </header>

      <div className="px-4 sm:px-8 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {[
            {
              label: (auction.status === "OPEN" || auction.status === "CLOSING") ? "Current Bid Total" : "Total Raised",
              value: `$${totalRaised.toLocaleString()}`,
            },
            { label: "Items", value: auction.items.length },
            { label: "Total Bids", value: totalBids },
            { label: "Active Items", value: auction.items.filter(i => i.status === "ACTIVE").length },
          ].map((stat) => (
            <div key={stat.label} className="bg-white border border-[#e3d6bf] rounded-xl p-4 sm:p-5">
              <div className="text-[#6f5b46] text-xs sm:text-sm font-medium mb-1.5">{stat.label}</div>
              <div className="text-2xl sm:text-3xl font-bold text-[#241a12]">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Auction timeline */}
        <div className="bg-white border border-[#e3d6bf] rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 text-sm">
          <div className="flex items-center gap-3 flex-1">
            <span className="text-[#8a7559] shrink-0">Opens</span>
            <span className={`font-medium ${auction.status === "OPEN" || auction.status === "CLOSED" || auction.status === "SETTLED" ? "text-[#a4592a]" : "text-[#241a12]"}`}>
              <LocalDate iso={auction.startAt.toISOString()} />
            </span>
            {(auction.status === "OPEN" || auction.status === "CLOSED" || auction.status === "SETTLED") && (
              <span className="text-[#a4592a] text-xs inline-flex items-center gap-0.5"><IcoCheck /> opened</span>
            )}
          </div>
          <div className="hidden sm:block text-[#b3a085]">→</div>
          <div className="flex items-center gap-3 flex-1">
            <span className="text-[#8a7559] shrink-0">Closes</span>
            <span className={`font-medium ${auction.status === "CLOSED" || auction.status === "SETTLED" ? "text-red-600" : "text-[#241a12]"}`}>
              <LocalDate iso={auction.endAt.toISOString()} />
            </span>
            {(auction.status === "CLOSED" || auction.status === "SETTLED") && (
              <span className="text-red-600 text-xs inline-flex items-center gap-0.5"><IcoCheck /> closed</span>
            )}
          </div>
          {auction.status === "DRAFT" && (
            <div className="text-[#8a7559] text-xs sm:text-right">
              {isScheduled
                ? "Will auto-open at start time (cron runs every minute)"
                : "Start time passed — will open on next cron run"}
            </div>
          )}
        </div>

        {/* Items */}
        <div className="bg-white border border-[#e3d6bf] rounded-xl overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-[#e3d6bf] flex items-center justify-between">
            <h2 className="font-semibold">Items ({auction.items.length})</h2>
            <Link
              href={`/admin/items/new?auctionId=${auction.id}`}
              className="bg-[#a4592a] hover:bg-[#843f1c] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              + Add Item
            </Link>
          </div>

          {auction.items.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="flex justify-center mb-4 text-[#8a7559]"><IcoBox /></div>
              <p className="text-[#6f5b46] font-medium mb-1">No items yet</p>
              <p className="text-[#8a7559] text-sm mb-6">Add items to this auction so bidders can start bidding.</p>
              <Link
                href={`/admin/items/new?auctionId=${auction.id}`}
                className="bg-[#a4592a] hover:bg-[#843f1c] text-white text-sm font-medium px-6 py-3 rounded-lg inline-block transition-colors"
              >
                + Add First Item
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[580px]">
                <thead>
                  <tr className="border-b border-[#e3d6bf]">
                    <th className="w-14 px-4 py-3"></th>
                    <th className="text-left px-4 py-3 text-[#4a3a2b] text-xs font-semibold uppercase tracking-wide">Item</th>
                    <th className="text-left px-4 py-3 text-[#4a3a2b] text-xs font-semibold uppercase tracking-wide">Start</th>
                    <th className="text-left px-4 py-3 text-[#4a3a2b] text-xs font-semibold uppercase tracking-wide">Current</th>
                    <th className="text-left px-4 py-3 text-[#4a3a2b] text-xs font-semibold uppercase tracking-wide">Bids</th>
                    <th className="text-left px-4 py-3 text-[#4a3a2b] text-xs font-semibold uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {auction.items.map((item) => {
                    const photo = item.photos.find(p => p.isPrimary) ?? item.photos[0];
                    return (
                      <tr key={item.id} className="border-b border-[#e3d6bf] last:border-0 hover:bg-[#efe3d0]/40 transition-colors">
                        <td className="px-4 py-3 w-14">
                          {photo ? (
                            <img
                              src={photo.url}
                              alt={item.title}
                              className="w-10 h-10 object-cover rounded-lg"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-[#efe3d0] rounded-lg flex items-center justify-center text-[#8a7559] text-xs">
                              ?
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-sm">{item.title}</div>
                          {item.category && <div className="text-xs text-[#8a7559]">{item.category}</div>}
                          {item.storageLocation && (
                            <div className="text-xs font-mono text-[#a4592a] mt-0.5 flex items-center gap-0.5"><IcoPin />{item.storageLocation}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#6f5b46] text-sm">${Number(item.startingBid)}</td>
                        <td className="px-4 py-3 text-[#a4592a] font-semibold text-sm">${Number(item.currentBid)}</td>
                        <td className="px-4 py-3 text-[#6f5b46] text-sm">{item.bids.length}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            item.status === "ACTIVE" ? "bg-[#a4592a]/20 text-[#843f1c]"
                            : item.status === "SOLD" ? "bg-[#efe0c9] text-[#843f1c]"
                            : (item.status as string) === "PENDING_PICKUP" ? "bg-amber-50 text-amber-700"
                            : (item.status as string) === "PICKED_UP" ? "bg-[#efe3d0] text-[#4a3a2b]"
                            : "bg-[#e7dcc6] text-[#4a3a2b]"
                          }`}>
                            {item.status.replace(/_/g, " ").toLowerCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/items/${item.id}`}
                            className="text-xs bg-[#efe3d0] hover:bg-[#e7dcc6] text-[#241a12] px-3 py-1.5 rounded-lg whitespace-nowrap"
                          >
                            Edit
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
