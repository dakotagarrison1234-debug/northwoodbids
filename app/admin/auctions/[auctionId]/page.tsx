export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";
import { type ActiveProxy } from "./ProxyBidsPanel";
import RecentBidsPanel, { type RecentBid } from "./RecentBidsPanel";
import LocalDate from "@/app/components/LocalDate";
import { money } from "@/lib/format";
import DeleteAuctionButton from "./DeleteAuctionButton";
import EditAuction from "./EditAuction";
import AuctionResults, { type ResultOrder, type ResultUnsold } from "./AuctionResults";
import AuctionItemsList from "./AuctionItemsList";
import ArchiveButton from "./ArchiveButton";
import AuctionStatusButtons from "@/app/components/AuctionStatusButtons";
import PusherRefresh from "@/app/components/PusherRefresh";
import { IcoCheck, IcoLink } from "@/app/components/BidIcons";
import { Pill, PageHeader, PageBody, Panel, BtnLink, StatCard, Eyebrow, Progress, Empty, type Tone } from "../../ui";

function IcoPin() {
  return <svg width="14" height="14" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="6" cy="5" r="2"/><path d="M6 1C3.79 1 2 2.79 2 5c0 3 4 7 4 7s4-4 4-7c0-2.21-1.79-4-4-4z"/></svg>;
}
function IcoBox() {
  return <svg width="40" height="40" fill="none" viewBox="0 0 40 40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 5L5 12.5v15L20 35l15-7.5v-15L20 5z"/><path d="M5 12.5l15 7.5 15-7.5M20 20v15"/><path d="M12.5 8.75L27.5 16.25"/></svg>;
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
          // Active transfer (if any) so the fulfillment board can show what's moving
          // and where — vs what's sitting at a warehouse ready to gather.
          transferRequest: { select: { status: true, toLocation: { select: { name: true } } } },
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
      <>
        <PageHeader title="Auction not found" tabs={false} back={{ href: "/admin/auctions", label: "All auctions" }} />
        <PageBody>
          <div className="bg-white border border-[#e6dac6] rounded-2xl">
            <Empty text="That auction doesn't exist." sub="It may have been deleted." action={<BtnLink href="/admin/auctions" size="sm">Back to auctions</BtnLink>} />
          </div>
        </PageBody>
      </>
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

  // ── Completed-auction data. Once an auction has ended the page is a fulfillment
  // board, not an editor: who won what, who's paid, where they pick up, and whether
  // it's been collected. Only fetched when ended so live auctions pay nothing. ──
  let resultOrders: ResultOrder[] = [];
  let resultUnsold: ResultUnsold[] = [];
  let pickupLocations: { id: string; name: string }[] = [];
  let relistTargets: { id: string; title: string; status: string }[] = [];
  if (isEnded) {
    const [payments, locs] = await Promise.all([
      prisma.payment.findMany({
        where: { item: { auctionId } },
        select: { itemId: true, clerkUserId: true, status: true, comped: true },
      }),
      prisma.pickupLocation.findMany({
        where: { organizationId: auction.organizationId, isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      }),
    ]);
    pickupLocations = locs;
    const payByItem = new Map(payments.map((p) => [p.itemId, p]));
    const winnerIds = [...new Set(payments.map((p) => p.clerkUserId))];
    const winnerProfiles = winnerIds.length
      ? await prisma.bidderProfile.findMany({
          where: { clerkUserId: { in: winnerIds } },
          select: { clerkUserId: true, name: true, email: true, phone: true, preferredPickupLocationId: true },
        })
      : [];
    const winById = new Map(winnerProfiles.map((p) => [p.clerkUserId, p]));

    // Earliest upcoming pickup appointment per winner — powers the "scheduled"
    // grouping. Appointments are per-customer (not per-auction), so any SCHEDULED
    // appt means their winnings have a collection time.
    const scheduledAppts = winnerIds.length
      ? await prisma.pickupAppointment.findMany({
          where: { organizationId: auction.organizationId, clerkUserId: { in: winnerIds }, status: "SCHEDULED" },
          orderBy: { startsAt: "asc" },
          select: { clerkUserId: true, startsAt: true, location: { select: { name: true } } },
        })
      : [];
    const apptByUser = new Map<string, { startsAt: Date; locationName: string | null }>();
    for (const a of scheduledAppts) {
      if (!apptByUser.has(a.clerkUserId)) {
        apptByUser.set(a.clerkUserId, { startsAt: a.startsAt, locationName: a.location?.name ?? null });
      }
    }

    // Group sold items into per-winner orders.
    const orderMap = new Map<string, ResultOrder>();
    for (const item of auction.items) {
      if (!SOLD_STATUSES.includes(item.status)) continue;
      const pay = payByItem.get(item.id);
      const winnerId = pay?.clerkUserId;
      if (!winnerId) continue; // no payment/winner record yet — skip (rare)
      const prof = winById.get(winnerId);
      const paidState: "paid" | "comped" | "unpaid" = pay?.comped
        ? "comped"
        : pay?.status === "PAID"
        ? "paid"
        : "unpaid";
      const photo = item.photos.find((p) => p.isPrimary)?.url ?? item.photos[0]?.url ?? null;
      const amount = Number(item.currentBid);
      let order = orderMap.get(winnerId);
      if (!order) {
        const appt = apptByUser.get(winnerId);
        order = {
          clerkUserId: winnerId,
          name: prof?.name || prof?.email || "Bidder",
          email: prof?.email ?? null,
          phone: prof?.phone ?? null,
          preferredLocationId: prof?.preferredPickupLocationId ?? null,
          scheduledFor: appt ? appt.startsAt.toISOString() : null,
          scheduledLocation: appt ? appt.locationName : null,
          total: 0,
          items: [],
        };
        orderMap.set(winnerId, order);
      }
      const tr = item.transferRequest;
      const transferring = !!tr && (tr.status === "REQUESTED" || tr.status === "LOADED");
      order.total += amount;
      order.items.push({
        id: item.id,
        title: item.title,
        code: item.itemCode ?? null,
        photo,
        amount,
        paidState,
        pickedUp: item.status === "PICKED_UP",
        gathered: item.grabbedAt != null,
        warehouse: item.location?.name ?? null,
        transferring,
        transferTo: transferring ? tr?.toLocation?.name ?? null : null,
      });
    }
    resultOrders = [...orderMap.values()].sort((a, b) => b.total - a.total);

    resultUnsold = auction.items
      .filter((i) => i.status === "UNSOLD")
      .map((i) => ({
        id: i.id,
        title: i.title,
        code: i.itemCode ?? null,
        photo: i.photos.find((p) => p.isPrimary)?.url ?? i.photos[0]?.url ?? null,
        highBid: Number(i.currentBid),
        warehouse: i.location?.name ?? null,
        storageLocation: i.storageLocation ?? null,
      }));

    // Auctions this item could be relisted into — anything not already ended.
    relistTargets = await prisma.auction.findMany({
      where: { organizationId: auction.organizationId, status: { in: ["DRAFT", "OPEN", "CLOSING"] } },
      orderBy: [{ startAt: "asc" }],
      select: { id: true, title: true, status: true },
    });
  }

  // Status pill: colour says it all at a glance.
  const statusTone: Tone =
    auction.status === "OPEN" ? "green" :
    auction.status === "CLOSING" ? "amber" :
    "slate";
  const statusLabel = isScheduled ? "Scheduled" : auction.status.toLowerCase();

  // How far through its run a live auction is — drives the timeline bar.
  const runTotal = Math.max(1, auction.endAt.getTime() - auction.startAt.getTime());
  const runElapsed = Math.min(1, Math.max(0, (now.getTime() - auction.startAt.getTime()) / runTotal));
  const hoursLeft = (auction.endAt.getTime() - now.getTime()) / 36e5;
  const timelineTone: Tone = isEnded ? "slate" : hoursLeft <= 6 ? "red" : hoursLeft <= 24 ? "amber" : "green";
  const liveCount = auction.items.filter(i => i.status === "ACTIVE").length;

  return (
    <>
      <PusherRefresh channel="auctions" event="auction-updated" />
      <PageHeader
        tabs={false}
        back={{ href: "/admin/auctions", label: "All auctions" }}
        title={auction.title}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Pill tone={statusTone} dot={isLiveAuction}>{statusLabel}</Pill>
            {isPastStart && <Pill tone="amber">Starting shortly</Pill>}
            {auction.archived && <Pill tone="slate">Archived · hidden</Pill>}
            <span>
              {isEnded ? "Closed" : "Closes"} <LocalDate iso={auction.endAt.toISOString()} />
            </span>
          </span>
        }
        actions={
          <>
            {/* Styled like BtnLink ghost/sm — a raw Link because it opens in a new tab. */}
            <Link
              href={`/${auction.organization.slug}/${auction.slug}`}
              target="_blank"
              className="inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors whitespace-nowrap min-h-[40px] px-3.5 text-sm bg-transparent text-[#6f5b46] hover:bg-[#f4ede1]"
            >
              <IcoLink className="w-4 h-4" /> View
            </Link>
            {!isEnded && (
              <BtnLink href="#edit-auction" variant="outline" size="sm">Edit</BtnLink>
            )}
            <BtnLink href={`/admin/auctions/${auction.id}/flyer`} variant="outline" size="sm">Flyer</BtnLink>
            {/* Archive — get a test/junk auction out of reports, winners and the site. */}
            <ArchiveButton auctionId={auction.id} archived={auction.archived} />
          </>
        }
      />

      <PageBody>
        {/* Money first and big — everything else is a supporting count. */}
        <div className="rounded-2xl bg-[#241a12] text-[#fbf4e6] p-5">
          <Eyebrow className="!text-[#b9a688]">{isLiveAuction ? "Bid so far" : "Sold for"}</Eyebrow>
          <div className="font-display text-4xl sm:text-5xl font-black mt-1 tabular-nums leading-none text-[#f0a35a]">{money(totalRaised)}</div>
          <div className="text-sm text-[#d9c7ab] mt-2.5 leading-snug">
            Winning bids only — before premium &amp; tax.
            {compedCount > 0 && (
              <>
                {" "}Includes <strong className="text-[#fbf4e6]">{money(compedTotal)} comped</strong>{" "}
                ({compedCount} of your own win{compedCount !== 1 ? "s" : ""}), which Reports leaves out.
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <StatCard label="Lots" value={auction.items.length} />
          <StatCard label="Bids" value={totalBids} />
          <StatCard label="Live" value={liveCount} tone={liveCount > 0 ? "green" : "slate"} />
        </div>

        {/* Auction timeline */}
        <Panel>
          <div className="px-4 sm:px-5 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
              <div className="flex-1 min-w-0">
                <Eyebrow>Opens</Eyebrow>
                <div className="font-bold text-[#241a12] mt-0.5 inline-flex items-center gap-1.5">
                  <LocalDate iso={auction.startAt.toISOString()} />
                  {(auction.status === "OPEN" || auction.status === "CLOSED" || auction.status === "SETTLED") && (
                    <Pill tone="green"><IcoCheck className="w-3 h-3" /> opened</Pill>
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <Eyebrow>Closes</Eyebrow>
                <div className={`font-bold mt-0.5 inline-flex items-center gap-1.5 ${isEnded ? "text-[#a1321f]" : "text-[#241a12]"}`}>
                  <LocalDate iso={auction.endAt.toISOString()} />
                  {isEnded && <Pill tone="red"><IcoCheck className="w-3 h-3" /> closed</Pill>}
                </div>
              </div>
            </div>
            {isLiveAuction && <Progress value={runElapsed} tone={timelineTone} className="mt-3.5" />}
            {auction.status === "DRAFT" && (
              <p className="text-sm text-[#8a7559] mt-3">
                {isScheduled
                  ? "This auction will go live automatically at its start time."
                  : "The start time has passed — this auction will go live in a moment."}
              </p>
            )}
          </div>
        </Panel>

        {/* Per-warehouse split — where this auction's items physically are, and what
            each warehouse is carrying. Admin-only info (bidders never see totals). */}
        {warehouses.length > 0 && (
          <Panel
            title={<span className="inline-flex items-center gap-1.5"><IcoPin /> By warehouse</span>}
            sub={isLiveAuction ? "Current bids" : isEnded ? "Sold" : "No bids yet"}
          >
            <div className="grid grid-cols-2 gap-2.5 px-4 sm:px-5 py-4">
              {warehouses.map((w) => (
                <div key={w.name} className="rounded-xl border border-[#e6dac6] bg-[#faf5ea] px-4 py-3">
                  <div className="text-sm font-bold text-[#241a12] truncate">{w.name}</div>
                  <div className="flex items-baseline justify-between gap-2 mt-1">
                    <span className="text-sm text-[#6f5b46]">
                      {w.items} {w.items === 1 ? "lot" : "lots"}
                    </span>
                    <span className="font-display text-lg font-black text-[#6c4d39] tabular-nums">{money(w.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {isEnded ? (
          <>
            {/* Ended → fulfillment board, not an editor. No name/time editing, no
                recent-bids feed, no add-item. Just settle + the results below. */}
            <Panel tone="slate">
              <div className="px-4 sm:px-5 py-4 flex flex-wrap items-center gap-3">
                <div className="min-w-0">
                  <div className="font-display text-lg font-black text-[#241a12]">This auction has ended</div>
                  <div className="text-sm text-[#8a7559]">Bidding is closed — manage collection below.</div>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <AuctionStatusButtons
                    auctionId={auction.id}
                    status={auction.status}
                    liveNotifiedAtISO={auction.liveNotifiedAt ? auction.liveNotifiedAt.toISOString() : null}
                  />
                </div>
              </div>
            </Panel>

            <AuctionResults
              auctionId={auction.id}
              orders={resultOrders}
              unsold={resultUnsold}
              locations={pickupLocations}
              relistTargets={relistTargets}
            />
          </>
        ) : (
          <>
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
            <Panel
              title={<>Lots <span className="text-[#8a7559] text-base">({auction.items.length})</span></>}
              action={
                isEnded ? (
                  <span className="text-sm text-[#8a7559] text-right">This auction has ended — items can no longer be added.</span>
                ) : (
                  <BtnLink href={`/admin/items/new?auctionId=${auction.id}`} size="sm">Add a lot</BtnLink>
                )
              }
            >
              {auction.items.length === 0 ? (
                <Empty
                  icon={<IcoBox />}
                  text="No lots yet"
                  sub={isEnded ? "This auction has ended — items can no longer be added." : "Add lots to this auction so bidders can start bidding."}
                  action={!isEnded ? <BtnLink href={`/admin/items/new?auctionId=${auction.id}`}>Add the first lot</BtnLink> : undefined}
                />
              ) : (
                // Dense, tappable list — one truncated line per item so 7–10 fit at a
                // glance. Tap a row to edit it. Search box appears once it gets long.
                <AuctionItemsList
                  items={auction.items.map((item) => {
                    const photo = item.photos.find((p) => p.isPrimary) ?? item.photos[0];
                    return {
                      id: item.id,
                      title: item.title,
                      photoUrl: photo?.url ?? null,
                      storageLocation: item.storageLocation ?? null,
                      bids: item._count.bids,
                      currentBid: Number(item.currentBid),
                      status: item.status,
                    };
                  })}
                />
              )}
            </Panel>

            {/* Danger zone — delete is only allowed for DRAFT auctions */}
            {auction.status === "DRAFT" && (
              <Panel tone="red" title={<span className="text-[#a1321f]">Danger zone</span>}>
                <div className="px-4 sm:px-5 py-4">
                  <p className="text-sm text-[#6f5b46] mb-4">
                    Deleting this draft auction cannot be undone. Items in it will be unlinked and saved as drafts.
                  </p>
                  <DeleteAuctionButton auctionId={auction.id} />
                </div>
              </Panel>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
