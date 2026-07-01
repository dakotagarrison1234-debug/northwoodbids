export const dynamic = "force-dynamic";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";
import AuctionStatusButtons from "@/app/components/AuctionStatusButtons";
import ProxyBidsPanel, { type ActiveProxy } from "./ProxyBidsPanel";
import LocalDate from "@/app/components/LocalDate";
import StatusPill from "@/app/components/StatusPill";
import { statusStyle } from "@/lib/statusStyles";
import { money } from "@/lib/format";
import DeleteAuctionButton from "./DeleteAuctionButton";
import EditAuction from "./EditAuction";
import PusherRefresh from "@/app/components/PusherRefresh";

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
      items: {
        include: {
          photos: true,
          // Single top ACTIVE bid (uses [itemId, status, amount] index) instead of full history.
          bids: { where: { status: "ACTIVE" }, orderBy: { amount: "desc" }, take: 1 },
          // Total bid count is shown in the table — get it from the DB, not by loading rows.
          _count: { select: { bids: true } },
        },
      },
      organization: true,
    },
  });

  if (!auction) {
    return (
      <div className="flex items-center justify-center flex-1">
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Auction not found</h1>
          <Link href="/admin/auctions" className="text-[#6c4d39] text-base font-semibold">Back to auctions</Link>
        </div>
      </div>
    );
  }

  const SOLD_STATUSES = ["SOLD", "PENDING_PICKUP", "PICKED_UP"];
  // For live auctions, show all current bid totals; for closed/settled show confirmed sold amounts
  const totalRaised = (auction.status === "OPEN" || auction.status === "CLOSING")
    ? auction.items.filter(i => i.status === "ACTIVE").reduce((sum, item) => sum + Number(item.currentBid), 0)
    : auction.items.filter(i => SOLD_STATUSES.includes(i.status)).reduce((sum, item) => sum + Number(item.currentBid), 0);
  const totalBids = auction.items.reduce((sum, item) => sum + item._count.bids, 0);
  const now = new Date();
  const isScheduled = auction.status === "DRAFT" && auction.startAt > now;
  const isPastStart = auction.status === "DRAFT" && auction.startAt <= now;
  const isEnded = auction.status === "CLOSED" || auction.status === "SETTLED";

  // Owner/admin only: the active Max Bids (proxy bids) on this auction's items.
  // Max amounts are competitive info, so staff below admin don't see them.
  const membership = await getUserOrg();
  const isOwnerOrAdmin = membership?.role === "OWNER" || membership?.role === "ADMIN";
  let activeProxies: ActiveProxy[] = [];
  if (isOwnerOrAdmin) {
    const rows = await prisma.proxyBid.findMany({
      where: { isActive: true, item: { auctionId } },
      orderBy: { maxAmount: "desc" },
      include: { item: { select: { id: true, title: true, currentBid: true } } },
    });
    const ids = [...new Set(rows.map((r) => r.clerkUserId))];
    const profiles = ids.length
      ? await prisma.bidderProfile.findMany({
          where: { clerkUserId: { in: ids } },
          select: { clerkUserId: true, name: true, email: true },
        })
      : [];
    const nameById = new Map(profiles.map((p) => [p.clerkUserId, p.name || p.email || "Bidder"]));
    activeProxies = rows.map((r) => ({
      id: r.id,
      itemId: r.item.id,
      itemTitle: r.item.title,
      currentBid: Number(r.item.currentBid),
      bidderName: nameById.get(r.clerkUserId) || "Bidder",
      maxAmount: Number(r.maxAmount),
    }));
  }

  return (
    <>
      <PusherRefresh channel="auctions" event="auction-updated" />
      <header className="border-b border-[#e3d6bf] px-6 sm:px-8 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link href="/admin/auctions" className="text-[#6f5b46] hover:text-[#241a12] text-base font-semibold shrink-0">← Auctions</Link>
          <span className="text-[#8a7559]">/</span>
          <h1 className="text-2xl sm:text-3xl font-semibold truncate">{auction.title}</h1>
          <span className={`text-sm font-semibold px-2.5 py-1 rounded-full shrink-0 ${
            isScheduled ? "bg-[#6c4d39]/12 text-[#6c4d39]" : statusStyle(auction.status)
          }`}>
            {isScheduled ? "scheduled" : auction.status.toLowerCase()}
          </span>
          {isPastStart && (
            <span className="text-xs text-amber-600 bg-yellow-500/10 px-2 py-1 rounded-full shrink-0">
              <span className="inline-flex items-center gap-1"><IcoWarning /> starting shortly</span>
            </span>
          )}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 sm:shrink-0">
          <Link
            href={`/${auction.organization.slug}/${auction.slug}`}
            target="_blank"
            className="text-center w-full sm:w-auto text-[#4a3a2b] hover:text-[#241a12] font-semibold text-base bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] px-6 py-3.5 rounded-xl whitespace-nowrap transition-colors"
          >
            View ↗
          </Link>
          <AuctionStatusButtons auctionId={auction.id} status={auction.status} />
        </div>
      </header>

      <div className="px-6 sm:px-8 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {[
            {
              label: (auction.status === "OPEN" || auction.status === "CLOSING") ? "Current Bid Total" : "Total Sales",
              value: money(totalRaised),
            },
            { label: "Items", value: auction.items.length },
            { label: "Total Bids", value: totalBids },
            { label: "Active Items", value: auction.items.filter(i => i.status === "ACTIVE").length },
          ].map((stat) => (
            <div key={stat.label} className="bg-white border border-[#e3d6bf] rounded-xl p-5 sm:p-6">
              <div className="text-[#6f5b46] text-sm sm:text-base font-medium mb-1.5">{stat.label}</div>
              <div className="text-2xl sm:text-3xl font-bold text-[#241a12]">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Auction timeline */}
        <div className="bg-white border border-[#e3d6bf] rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 text-base">
          <div className="flex items-center gap-3 flex-1">
            <span className="text-[#8a7559] shrink-0">Opens</span>
            <span className={`font-medium ${auction.status === "OPEN" || auction.status === "CLOSED" || auction.status === "SETTLED" ? "text-[#6c4d39]" : "text-[#241a12]"}`}>
              <LocalDate iso={auction.startAt.toISOString()} />
            </span>
            {(auction.status === "OPEN" || auction.status === "CLOSED" || auction.status === "SETTLED") && (
              <span className="text-[#6c4d39] text-xs inline-flex items-center gap-0.5"><IcoCheck /> opened</span>
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
            <div className="text-[#8a7559] text-sm sm:text-right">
              {isScheduled
                ? "This auction will go live automatically at its start time."
                : "The start time has passed — this auction will go live in a moment."}
            </div>
          )}
        </div>

        {/* Edit auction (name + times) — available until the auction has closed */}
        {!isEnded && (
          <EditAuction
            auctionId={auction.id}
            title={auction.title}
            startAtISO={auction.startAt.toISOString()}
            endAtISO={auction.endAt.toISOString()}
            status={auction.status}
          />
        )}

        {/* Active Max Bids (proxy bids) — owner/admin only */}
        {isOwnerOrAdmin && <ProxyBidsPanel proxies={activeProxies} />}

        {/* Items */}
        <div className="bg-white border border-[#e3d6bf] rounded-xl overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-[#e3d6bf] flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Items ({auction.items.length})</h2>
            {isEnded ? (
              <span className="text-sm text-[#8a7559] text-right">This auction has ended — items can no longer be added.</span>
            ) : (
              <Link
                href={`/admin/items/new?auctionId=${auction.id}`}
                className="bg-[#6c4d39] hover:bg-[#563e2c] text-white text-base font-semibold px-6 py-3.5 rounded-xl transition-colors whitespace-nowrap"
              >
                + Add Item
              </Link>
            )}
          </div>

          {auction.items.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="flex justify-center mb-4 text-[#8a7559]"><IcoBox /></div>
              <p className="text-[#6f5b46] text-base font-medium mb-1">No items yet</p>
              {isEnded ? (
                <p className="text-[#8a7559] text-base mb-2">This auction has ended — items can no longer be added.</p>
              ) : (
                <>
                  <p className="text-[#8a7559] text-base mb-6">Add items to this auction so bidders can start bidding.</p>
                  <Link
                    href={`/admin/items/new?auctionId=${auction.id}`}
                    className="bg-[#6c4d39] hover:bg-[#563e2c] text-white text-base font-semibold px-6 py-3.5 rounded-xl inline-block transition-colors"
                  >
                    + Add First Item
                  </Link>
                </>
              )}
            </div>
          ) : (
            // Dense, tappable list — one truncated line per item so 7–10 fit at a
            // glance. Tap a row to edit it.
            <ul className="divide-y divide-[#e3d6bf]">
              {auction.items.map((item) => {
                const photo = item.photos.find(p => p.isPrimary) ?? item.photos[0];
                return (
                  <li key={item.id}>
                    <Link
                      href={`/admin/items/${item.id}`}
                      className="flex items-center gap-3 px-4 sm:px-5 py-2.5 hover:bg-[#efe3d0]/50 transition-colors"
                    >
                      {photo ? (
                        <div className="relative w-9 h-9 rounded-lg overflow-hidden shrink-0">
                          <Image src={photo.url} alt="" fill sizes="36px" className="object-cover" />
                        </div>
                      ) : (
                        <div className="w-9 h-9 bg-[#efe3d0] rounded-lg flex items-center justify-center text-[#8a7559] text-xs shrink-0">?</div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm text-[#241a12] truncate">{item.title}</div>
                        <div className="text-xs text-[#8a7559] truncate flex items-center gap-2">
                          {item.storageLocation && (
                            <span className="font-mono text-[#6c4d39] inline-flex items-center gap-0.5 shrink-0"><IcoPin />{item.storageLocation}</span>
                          )}
                          <span className="shrink-0">{item._count.bids} bid{item._count.bids !== 1 ? "s" : ""}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-green-700 font-bold text-sm tabular-nums">{money(Number(item.currentBid))}</div>
                      </div>
                      <div className="shrink-0"><StatusPill status={item.status} /></div>
                      <svg className="w-4 h-4 text-[#b3a085] shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4l4 4-4 4" /></svg>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Danger zone — delete is only allowed for DRAFT auctions */}
        {auction.status === "DRAFT" && (
          <div className="bg-white border border-red-200 rounded-xl p-6 sm:p-7">
            <h2 className="text-lg font-semibold text-red-600 mb-1">Danger Zone</h2>
            <p className="text-base text-[#6f5b46] mb-4">
              Deleting this draft auction cannot be undone. Items in it will be unlinked and saved as drafts.
            </p>
            <DeleteAuctionButton auctionId={auction.id} />
          </div>
        )}
      </div>
    </>
  );
}
