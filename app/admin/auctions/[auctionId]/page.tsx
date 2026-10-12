export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import RecentBidsPanel, { type RecentBid } from "./RecentBidsPanel";
import LocalDate from "@/app/components/LocalDate";
import { money } from "@/lib/format";
import DeleteAuctionButton from "./DeleteAuctionButton";
import EditAuction from "./EditAuction";
import AuctionResults, { type ResultOrder } from "./AuctionResults";
import AuctionItemsList from "./AuctionItemsList";
import ArchiveButton from "./ArchiveButton";
import AuctionStatusButtons from "@/app/components/AuctionStatusButtons";
import PusherRefresh from "@/app/components/PusherRefresh";
import { IcoLink } from "@/app/components/BidIcons";
import { Pill, PageHeader, PageBody, Panel, BtnLink, Eyebrow, Progress, Empty, Row, Disclosure, type Tone } from "../../ui";

interface Props {
  params: Promise<{ auctionId: string }>;
}

const BIG_LINK =
  "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors whitespace-nowrap min-h-[50px] px-5 text-[17px] bg-white border-2 border-[#d9c7ab] text-[#563e2c] hover:bg-[#faf5ea] flex-1 sm:flex-none";

export default async function ManageAuctionPage({ params }: Props) {
  const { auctionId } = await params;

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      items: {
        include: {
          photos: true,
          location: { select: { id: true, name: true } },
          // Active transfer (if any) so the results list can show what's moving.
          transferRequest: { select: { status: true, toLocation: { select: { name: true } } } },
          // Total bid count is shown in the list — get it from the DB, not by loading rows.
          _count: { select: { bids: true } },
        },
      },
      organization: true,
    },
  });

  if (!auction) {
    return (
      <>
        <PageHeader title="Auction not found" tabs={false} back={{ href: "/admin/auctions", label: "Auctions" }} />
        <PageBody>
          <div className="bg-white border border-[#e6dac6] rounded-2xl">
            <Empty text="That auction doesn't exist." action={<BtnLink href="/admin/auctions" size="sm">Auctions</BtnLink>} />
          </div>
        </PageBody>
      </>
    );
  }

  const SOLD_STATUSES = ["SOLD", "PENDING_PICKUP", "PICKED_UP"];
  const isLiveAuction = auction.status === "OPEN" || auction.status === "CLOSING";
  // For live auctions, show all current bid totals; for closed/settled show confirmed sold amounts
  const totalRaised = isLiveAuction
    ? auction.items.filter(i => i.status === "ACTIVE").reduce((sum, item) => sum + Number(item.currentBid), 0)
    : auction.items.filter(i => SOLD_STATUSES.includes(i.status)).reduce((sum, item) => sum + Number(item.currentBid), 0);
  const totalBids = auction.items.reduce((sum, item) => sum + item._count.bids, 0);

  const now = new Date();
  const isScheduled = auction.status === "DRAFT" && auction.startAt > now;
  const isDraft = auction.status === "DRAFT";
  const isEnded = auction.status === "CLOSED" || auction.status === "SETTLED";

  // The last 10 bids across the whole auction — the "is anything happening" feed.
  let recentBids: RecentBid[] = [];
  if (!isEnded) {
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
    recentBids = recentBidRows.map((b) => ({
      id: b.id,
      itemId: b.itemId,
      itemTitle: b.item?.title ?? "Item",
      bidderName: bidderNameById.get(b.clerkUserId) ?? "Bidder",
      amount: Number(b.amount),
      placedAtISO: b.placedAt.toISOString(),
      isProxy: b.isProxy,
      isTop: b.status === "ACTIVE",
    }));
  }

  // ── Ended-auction data: who won what, paid or not, picked up or not. Only
  // fetched when ended so live auctions pay nothing. ──
  let resultOrders: ResultOrder[] = [];
  let pickupLocations: { id: string; name: string }[] = [];
  const unsoldCount = isEnded ? auction.items.filter((i) => i.status === "UNSOLD").length : 0;
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

    // Earliest upcoming pickup appointment per winner. Appointments are per-customer
    // (not per-auction), so any SCHEDULED appt means their winnings have a time.
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
  }

  // Status pill: colour says it all at a glance.
  const statusTone: Tone =
    auction.status === "OPEN" ? "green" :
    auction.status === "CLOSING" ? "amber" :
    "slate";
  const statusLabel =
    auction.status === "OPEN" ? "Open" :
    auction.status === "CLOSING" ? "Closing" :
    isEnded ? "Closed" :
    isScheduled ? "Scheduled" : "Draft";

  // How far through its run a live auction is — drives the progress bar.
  const runTotal = Math.max(1, auction.endAt.getTime() - auction.startAt.getTime());
  const runElapsed = Math.min(1, Math.max(0, (now.getTime() - auction.startAt.getTime()) / runTotal));
  const hoursLeft = (auction.endAt.getTime() - now.getTime()) / 36e5;
  const urgency: Tone = hoursLeft <= 6 ? "red" : hoursLeft <= 24 ? "amber" : "green";

  const lotsLine = `${auction.items.length} lot${auction.items.length !== 1 ? "s" : ""} · ${totalBids} bid${totalBids !== 1 ? "s" : ""}`;
  const liveNotifiedAtISO = auction.liveNotifiedAt ? auction.liveNotifiedAt.toISOString() : null;

  return (
    <>
      <PusherRefresh channel="auctions" event="auction-updated" />
      <PageHeader
        tabs={false}
        back={{ href: "/admin/auctions", label: "Auctions" }}
        title={auction.title}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Pill tone={statusTone} dot={isLiveAuction}>{statusLabel}</Pill>
            {auction.archived && <Pill tone="slate">Archived</Pill>}
            <span>
              {isDraft ? (
                <>Opens <LocalDate iso={auction.startAt.toISOString()} /></>
              ) : (
                <>{isEnded ? "Closed" : "Closes"} <LocalDate iso={auction.endAt.toISOString()} /></>
              )}
              {" · "}{lotsLine}
            </span>
          </span>
        }
      />

      <PageBody>
        {/* Money first and big — the one number on this page. */}
        <div className="rounded-2xl bg-[#241a12] text-[#fbf4e6] p-5">
          <Eyebrow className="!text-[#b9a688]">{isEnded ? "Sold for" : "Bid so far"}</Eyebrow>
          <div className="font-display text-4xl sm:text-5xl font-black mt-1 tabular-nums leading-none text-[#f0a35a]">{money(totalRaised)}</div>
          {isLiveAuction && <Progress value={runElapsed} tone={urgency} className="mt-4" />}
        </div>

        {/* Primary actions — big, always visible, wrap on a phone. */}
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {!isEnded && (
            <AuctionStatusButtons
              auctionId={auction.id}
              status={auction.status}
              liveNotifiedAtISO={liveNotifiedAtISO}
              show="primary"
              className="w-full sm:w-auto"
            />
          )}
          {!isEnded && (
            <BtnLink href={`/admin/items/new?auctionId=${auction.id}`} className="flex-1 sm:flex-none">Add a lot</BtnLink>
          )}
          {/* Styled like BtnLink outline — a raw Link because it opens in a new tab. */}
          <Link href={`/${auction.organization.slug}/${auction.slug}`} target="_blank" className={BIG_LINK}>
            <IcoLink className="w-4 h-4" /> View
          </Link>
          <BtnLink href={`/admin/auctions/${auction.id}/flyer`} variant="outline" className="flex-1 sm:flex-none">Flyer</BtnLink>
        </div>

        {isEnded ? (
          <>
            <AuctionResults orders={resultOrders} locations={pickupLocations} />

            {unsoldCount > 0 && (
              <Panel>
                <Row
                  href={`/admin/unsold?auction=${auction.id}`}
                  title={`${unsoldCount} lot${unsoldCount !== 1 ? "s" : ""} didn't sell`}
                />
              </Panel>
            )}
          </>
        ) : (
          <>
            {/* The lots — this is the work. */}
            <Panel title={<>Lots <span className="text-[#8a7559] text-[17px]">({auction.items.length})</span></>}>
              {auction.items.length === 0 ? (
                <Empty text="No lots yet." action={<BtnLink href={`/admin/items/new?auctionId=${auction.id}`}>Add a lot</BtnLink>} />
              ) : (
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

            <Disclosure label="Details">
              <EditAuction
                auctionId={auction.id}
                title={auction.title}
                description={auction.description}
                startAtISO={auction.startAt.toISOString()}
                endAtISO={auction.endAt.toISOString()}
                status={auction.status}
              />
            </Disclosure>

            {/* Last 10 bids. Refreshes live — PusherRefresh above is listening on
                `auction-updated`, which fires on every bid. */}
            <RecentBidsPanel bids={recentBids} />
          </>
        )}

        {/* Rare controls — one tap away, closed by default. */}
        <Disclosure label="More">
          <div className="px-4 sm:px-5 py-4 space-y-3">
            {isLiveAuction && (
              <AuctionStatusButtons
                auctionId={auction.id}
                status={auction.status}
                liveNotifiedAtISO={liveNotifiedAtISO}
                show="more"
              />
            )}
            <ArchiveButton auctionId={auction.id} archived={auction.archived} />
            {isDraft && <DeleteAuctionButton auctionId={auction.id} />}
          </div>
        </Disclosure>
      </PageBody>
    </>
  );
}
