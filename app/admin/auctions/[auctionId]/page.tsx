export const dynamic = "force-dynamic";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";
import { type ActiveProxy } from "./ProxyBidsPanel";
import RecentBidsPanel, { type RecentBid } from "./RecentBidsPanel";
import LocalDate from "@/app/components/LocalDate";
import StatusPill from "@/app/components/StatusPill";
import { money } from "@/lib/format";
import DeleteAuctionButton from "./DeleteAuctionButton";
import EditAuction from "./EditAuction";
import PusherRefresh from "@/app/components/PusherRefresh";
import { Pill } from "../../ui";

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
          // Which warehouse each item sits in — powers the per-warehouse split below.
          location: { select: { id: true, name: true } },
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

  // Per-warehouse split (Owosso vs Gladwin vs …): how many items sit at each, and
  // what they're worth. "Worth" follows the same rule as the headline total —
  // live bids while the auction is running, confirmed sales once it's closed.
  const isLiveAuction = auction.status === "OPEN" || auction.status === "CLOSING";
  const counted = (s: string) => (isLiveAuction ? s === "ACTIVE" : SOLD_STATUSES.includes(s));
  const byWarehouse = new Map<string, { name: string; items: number; total: number }>();
  for (const item of auction.items) {
    const key = item.location?.id ?? "none";
    const name = item.location?.name ?? "No warehouse";
    const row = byWarehouse.get(key) ?? { name, items: 0, total: 0 };
    row.items += 1;
    if (counted(item.status)) row.total += Number(item.currentBid);
    byWarehouse.set(key, row);
  }
  const warehouses = [...byWarehouse.values()].sort((a, b) => b.items - a.items);

  const now = new Date();
  const isScheduled = auction.status === "DRAFT" && auction.startAt > now;
  const isPastStart = auction.status === "DRAFT" && auction.startAt <= now;
  const isEnded = auction.status === "CLOSED" || auction.status === "SETTLED";

  // Comped (admin-won) items in this auction. The totals below are HAMMER totals —
  // they include admin wins, because those bids were real. Reports counts money that
  // actually moved, so it excludes them. Surfacing the comp count here is what makes
  // the two pages reconcile instead of looking like one of them is wrong.
  const compedRows = await prisma.payment.findMany({
    where: { comped: true, item: { auctionId } },
    select: { itemId: true, item: { select: { currentBid: true } } },
  });
  const compedCount = compedRows.length;
  const compedTotal = compedRows.reduce((s, r) => s + Number(r.item?.currentBid ?? 0), 0);

  // The last 10 bids across the whole auction — the "is anything happening" feed.
  const recentBidRows = await prisma.bid.findMany({
    where: { item: { auctionId } },
    orderBy: { placedAt: "desc" },
    take: 10,
    select: {
      id: true,
      itemId: true,
      clerkUserId: true,
      amount: true,
      placedAt: true,
      isProxy: true,
      status: true,
      item: { select: { title: true } },
    },
  });
  // Bidder names live on BidderProfile, not on Bid — resolve them in one query.
  const bidderIds = [...new Set(recentBidRows.map((b) => b.clerkUserId))];
  const bidderProfiles = bidderIds.length
    ? await prisma.bidderProfile.findMany({
        where: { clerkUserId: { in: bidderIds } },
        select: { clerkUserId: true, name: true, email: true },
      })
    : [];
  const bidderNameById = new Map(bidderProfiles.map((p) => [p.clerkUserId, p.name || p.email || "Bidder"]));
  const recentBids: RecentBid[] = recentBidRows.map((b) => ({
    id: b.id,
    itemId: b.itemId,
    itemTitle: b.item?.title ?? "Item",
    bidderName: bidderNameById.get(b.clerkUserId) ?? "Bidder",
    amount: Number(b.amount),
    placedAtISO: b.placedAt.toISOString(),
    isProxy: b.isProxy,
    isTop: b.status === "ACTIVE",
  }));

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
      <header className="border-b border-slate-200 bg-white px-4 sm:px-8 py-3.5">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/admin/auctions" className="text-slate-500 text-base font-semibold shrink-0 py-2 pr-1">← Auctions</Link>
          <span className="text-slate-300">/</span>
          {/* Full title wraps rather than truncating — you need to know which
              auction you're about to change. */}
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 leading-snug break-words min-w-0">{auction.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Pill tone={
            auction.status === "OPEN" ? "green" :
            auction.status === "CLOSING" ? "amber" :
            isScheduled ? "slate" : "slate"
          }>
            {isScheduled ? "Scheduled" : auction.status.toLowerCase()}
          </Pill>
          {isPastStart && <Pill tone="amber">Starting shortly</Pill>}
          <Link
            href={`/${auction.organization.slug}/${auction.slug}`}
            target="_blank"
            className="ml-auto shrink-0 inline-flex items-center justify-center min-h-[40px] px-4 rounded-xl border-2 border-slate-200 bg-white text-slate-700 font-bold text-base"
          >
            View ↗
          </Link>
        </div>
      </header>

      <div className="px-4 sm:px-8 py-5 space-y-4 max-w-2xl w-full">
        {/* Money first and big — everything else is a supporting count. */}
        <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-4">
          <div className="text-sm font-bold uppercase tracking-wide text-slate-500">
            {(auction.status === "OPEN" || auction.status === "CLOSING") ? "Bid so far" : "Sold for"}
          </div>
          <div className="text-4xl font-extrabold text-green-700 tabular-nums mt-0.5">{money(totalRaised)}</div>
          <div className="text-sm text-slate-600 mt-1.5 leading-snug">
            Winning bids only — before premium &amp; tax.
            {compedCount > 0 && (
              <>
                {" "}Includes <strong>{money(compedTotal)} comped</strong>{" "}
                ({compedCount} of your own win{compedCount !== 1 ? "s" : ""}), which Reports leaves out.
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: "Items", value: auction.items.length },
            { label: "Bids", value: totalBids },
            { label: "Live", value: auction.items.filter(i => i.status === "ACTIVE").length },
          ].map((stat) => (
            <div key={stat.label} className="bg-white border border-slate-200 rounded-2xl p-3 text-center">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{stat.label}</div>
              <div className="text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Per-warehouse split — where this auction's items physically are, and what
            each warehouse is carrying. Admin-only info (bidders never see totals). */}
        {warehouses.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl px-4 py-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-1.5">
                <IcoPin /> By warehouse
              </h2>
              <span className="text-xs text-slate-400">
                {isLiveAuction ? "Current bids" : isEnded ? "Sold" : "No bids yet"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {warehouses.map((w) => (
                <div key={w.name} className="rounded-xl border border-[#e3d6bf] bg-[#faf5ea] px-4 py-3">
                  <div className="text-sm font-bold text-[#241a12] truncate">{w.name}</div>
                  <div className="flex items-baseline justify-between gap-2 mt-1">
                    <span className="text-sm text-[#6f5b46]">
                      {w.items} {w.items === 1 ? "item" : "items"}
                    </span>
                    <span className="text-lg font-extrabold text-[#6c4d39]">{money(w.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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

        {/* One control board: details, actions (silent open / send live text / closing
            soon / settle), the social flyer, and the private Active Max Bids panel. */}
        <EditAuction
          auctionId={auction.id}
          title={auction.title}
          description={auction.description}
          startAtISO={auction.startAt.toISOString()}
          endAtISO={auction.endAt.toISOString()}
          status={auction.status}
          isOwnerOrAdmin={isOwnerOrAdmin}
          proxies={activeProxies}
          liveNotifiedAtISO={auction.liveNotifiedAt ? auction.liveNotifiedAt.toISOString() : null}
        />

        {/* Last 10 bids on this auction. Refreshes live — PusherRefresh above is
            listening on `auction-updated`, which fires on every bid. */}
        <RecentBidsPanel bids={recentBids} />

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
