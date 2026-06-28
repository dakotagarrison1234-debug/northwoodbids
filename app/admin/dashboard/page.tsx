export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { ItemStatus } from "@prisma/client";
import { requireUserOrg } from "@/lib/auth";
import LocalDate from "@/app/components/LocalDate";
import RefreshButton from "../RefreshButton";
import PusherRefresh from "@/app/components/PusherRefresh";

function QuickIcon({ name }: { name: string }) {
  const s = { width: 16, height: 16, fill: "none", viewBox: "0 0 16 16", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "gavel") return <svg {...s} width={22} height={22}><path d="M10 2L6 6l4 4 4-4-4-4zM2 14l5-5"/><path d="M6 10l-4 4"/></svg>;
  if (name === "package") return <svg {...s} width={22} height={22}><path d="M8 2L2 5v6l6 3 6-3V5L8 2z"/><path d="M2 5l6 3 6-3M8 8v7"/></svg>;
  if (name === "users") return <svg {...s} width={22} height={22}><circle cx="6" cy="5" r="2.5"/><path d="M1 14c0-3 2-4.5 5-4.5s5 1.5 5 4.5"/><circle cx="12" cy="5" r="2"/><path d="M12 10c2 0 3 1 3 3.5"/></svg>;
  return null;
}

export default async function AdminDashboard() {
  const membership = await requireUserOrg();
  const orgId = membership.organization.id;

  const soldStatuses: ItemStatus[] = ["SOLD", "PENDING_PICKUP", "PICKED_UP"];
  const bidsWhere = { item: { organizationId: orgId } };

  // All header stats computed in the DB — no loading whole tables to count/sum in JS.
  const [
    totalRaisedAgg,
    itemCount,
    bidCount,
    uniqueBidderRows,
  ] = await Promise.all([
    prisma.item.aggregate({
      where: { organizationId: orgId, status: { in: soldStatuses } },
      _sum: { currentBid: true },
    }),
    prisma.item.count({ where: { organizationId: orgId } }),
    prisma.bid.count({ where: bidsWhere }),
    prisma.bid.findMany({
      where: bidsWhere,
      distinct: ["clerkUserId"],
      select: { clerkUserId: true },
    }),
  ]);

  const totalRaised = Number(totalRaisedAgg._sum.currentBid ?? 0);
  const uniqueBidders = uniqueBidderRows.length;

  // ALL currently-live auctions (OPEN + CLOSING) — show every one, not just the first.
  const liveAuctions = await prisma.auction.findMany({
    where: { organizationId: orgId, status: { in: ["OPEN", "CLOSING"] } },
    orderBy: { endAt: "asc" },
    include: { _count: { select: { items: true } } },
  });

  // If nothing is live yet, surface the soonest scheduled (DRAFT) so the card isn't empty.
  const upcomingAuction =
    liveAuctions.length === 0
      ? await prisma.auction.findFirst({
          where: { organizationId: orgId, status: "DRAFT" },
          orderBy: { startAt: "asc" },
          include: { _count: { select: { items: true } } },
        })
      : null;

  const shownAuctions = liveAuctions.length > 0 ? liveAuctions : upcomingAuction ? [upcomingAuction] : [];

  // "Raised" per shown auction (sum of sold items' current bid) — one grouped DB query.
  const shownIds = shownAuctions.map((a) => a.id);
  const raisedRows = shownIds.length
    ? await prisma.item.groupBy({
        by: ["auctionId"],
        where: { auctionId: { in: shownIds }, status: { in: soldStatuses } },
        _sum: { currentBid: true },
      })
    : [];
  const raisedByAuction = new Map(raisedRows.map((r) => [r.auctionId, Number(r._sum.currentBid ?? 0)]));

  return (
    <>
      <PusherRefresh channel="auctions" event="auction-updated" />
      <header className="border-b border-[#e3d6bf] px-6 sm:px-8 py-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-2 sm:gap-3">
          <RefreshButton />
          <Link
            href="/admin/auctions/new"
            className="bg-[#6c4d39] hover:bg-[#563e2c] text-white text-base font-semibold px-6 py-3.5 rounded-xl transition-colors"
          >
            + New Auction
          </Link>
        </div>
      </header>

      {/* Stats */}
      <div className="px-6 sm:px-8 py-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: "Total Sales", value: `$${totalRaised.toLocaleString()}` },
          { label: "Items Listed", value: itemCount },
          { label: "Active Bidders", value: uniqueBidders },
          { label: "Bids Placed", value: bidCount },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-[#e3d6bf] rounded-xl p-5 sm:p-6">
            <div className="text-[#8a7559] text-sm sm:text-base mb-1">{stat.label}</div>
            <div className="text-2xl sm:text-3xl font-bold">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Quick links — kept near the top for fast access */}
      <div className="px-6 sm:px-8 pb-6">
        <div className="grid grid-cols-2 gap-3 max-w-md">
          {[
            { label: "Auctions", href: "/admin/auctions", icon: "gavel" },
            { label: "Pickup", href: "/admin/pickup", icon: "package" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="bg-white border border-[#e3d6bf] hover:border-[#cdbda3] rounded-xl p-5 flex items-center gap-3 transition-colors"
            >
              <span className="text-[#6f5b46]"><QuickIcon name={link.icon} /></span>
              <span className="text-base font-semibold text-[#4a3a2b]">{link.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Active auctions */}
      <div className="px-6 sm:px-8 pb-8">
        <div className="bg-white border border-[#e3d6bf] rounded-xl p-6 sm:p-7">
          <h2 className="text-lg font-semibold mb-4">
            {liveAuctions.length > 0
              ? `Live Auctions (${liveAuctions.length})`
              : upcomingAuction
              ? "Next Auction"
              : "Active Auction"}
          </h2>
          {shownAuctions.length === 0 ? (
            <div>
              <p className="text-[#8a7559] text-base mb-4">No auctions yet.</p>
              <Link
                href="/admin/auctions/new"
                className="block text-center bg-[#6c4d39] hover:bg-[#563e2c] text-white text-base font-semibold px-6 py-3.5 rounded-xl transition-colors"
              >
                Create Auction
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {shownAuctions.map((a) => {
                const raised = raisedByAuction.get(a.id) ?? 0;
                return (
                  <div key={a.id} className="border border-[#e3d6bf] rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <div className="text-base font-semibold truncate">{a.title}</div>
                        <div className="text-[#8a7559] text-sm mt-0.5">
                          {a.status === "DRAFT" ? (
                            <>Opens <LocalDate iso={a.startAt.toISOString()} /></>
                          ) : (
                            <>Closes <LocalDate iso={a.endAt.toISOString()} /></>
                          )}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-bold uppercase tracking-wide px-2 py-1 rounded-full shrink-0 ${
                          a.status === "OPEN"
                            ? "bg-[#5f7a45]/15 text-[#3f5430]"
                            : a.status === "CLOSING"
                            ? "bg-[#8a5a2b]/15 text-[#8a5a2b]"
                            : "bg-[#6c4d39]/10 text-[#6c4d39]"
                        }`}
                      >
                        {a.status.toLowerCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-[#6f5b46] mb-3">
                      <span>{a._count.items} item{a._count.items !== 1 ? "s" : ""}</span>
                      <span className="text-[#6c4d39] font-semibold">${raised.toLocaleString()} total</span>
                    </div>
                    <Link
                      href={`/admin/auctions/${a.id}`}
                      className="block text-center bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] text-[#241a12] text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
                    >
                      Manage
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
