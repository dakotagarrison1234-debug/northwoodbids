export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserOrg } from "@/lib/auth";
import LocalDate from "@/app/components/LocalDate";

function QuickIcon({ name }: { name: string }) {
  const s = { width: 16, height: 16, fill: "none", viewBox: "0 0 16 16", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "gavel") return <svg {...s}><path d="M10 2L6 6l4 4 4-4-4-4zM2 14l5-5"/><path d="M6 10l-4 4"/></svg>;
  if (name === "package") return <svg {...s}><path d="M8 2L2 5v6l6 3 6-3V5L8 2z"/><path d="M2 5l6 3 6-3M8 8v7"/></svg>;
  if (name === "users") return <svg {...s}><circle cx="6" cy="5" r="2.5"/><path d="M1 14c0-3 2-4.5 5-4.5s5 1.5 5 4.5"/><circle cx="12" cy="5" r="2"/><path d="M12 10c2 0 3 1 3 3.5"/></svg>;
  return null;
}

export default async function AdminDashboard() {
  const membership = await requireUserOrg();
  const orgId = membership.organization.id;

  const [items, auctions, allBids] = await Promise.all([
    prisma.item.findMany({ where: { organizationId: orgId }, include: { bids: true } }),
    prisma.auction.findMany({
      where: { organizationId: orgId },
      orderBy: { endAt: "asc" },
      include: { items: true },
    }),
    prisma.bid.findMany({
      where: { item: { organizationId: orgId } },
      include: { item: true },
      orderBy: { placedAt: "desc" },
    }),
  ]);

  const soldStatuses = ["SOLD", "PENDING_PICKUP", "PICKED_UP"];
  const totalRaised = items
    .filter((i) => soldStatuses.includes(i.status))
    .reduce((sum, i) => sum + Number(i.currentBid), 0);
  // Prefer OPEN, then CLOSING, then DRAFT (scheduled), otherwise none
  const activeAuction =
    auctions.find((a) => a.status === "OPEN") ||
    auctions.find((a) => a.status === "CLOSING") ||
    auctions.find((a) => a.status === "DRAFT") ||
    null;
  const uniqueBidders = new Set(allBids.map((b) => b.clerkUserId)).size;
  const recentBids = allBids.slice(0, 6);

  // Resolve bidder display names for recent bids
  const recentIds = [...new Set(recentBids.map((b) => b.clerkUserId))];
  const profiles = recentIds.length
    ? await prisma.bidderProfile.findMany({ where: { clerkUserId: { in: recentIds } } })
    : [];
  const profileMap = new Map(profiles.map((p) => [p.clerkUserId, p]));

  return (
    <>
      <header className="border-b border-[#e5e0d5] px-4 sm:px-8 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <Link
          href="/admin/auctions/new"
          className="bg-[#09a7ad] hover:bg-[#0898a0] text-white text-sm px-4 py-2 rounded-lg"
        >
          + New Auction
        </Link>
      </header>

      {/* Stats */}
      <div className="px-4 sm:px-8 py-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: "Total Raised", value: `$${totalRaised.toLocaleString()}` },
          { label: "Items Listed", value: items.length },
          { label: "Active Bidders", value: uniqueBidders },
          { label: "Bids Placed", value: allBids.length },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-[#e5e0d5] rounded-xl p-4 sm:p-5">
            <div className="text-[#8c8778] text-xs sm:text-sm mb-1">{stat.label}</div>
            <div className="text-xl sm:text-2xl font-bold">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Recent bids + active auction */}
      <div className="px-4 sm:px-8 pb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-[#e5e0d5] rounded-xl p-5 sm:p-6">
          <h2 className="font-semibold mb-4">Recent Bids</h2>
          {recentBids.length === 0 ? (
            <p className="text-[#8c8778] text-sm">No bids yet.</p>
          ) : (
            <div>
              {recentBids.map((bid) => {
                const p = profileMap.get(bid.clerkUserId);
                const name = p?.name || p?.email || `${bid.clerkUserId.substring(0, 8)}…`;
                return (
                  <div
                    key={bid.id}
                    className="flex items-center justify-between py-3 border-b border-[#e5e0d5] last:border-0"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="text-sm font-medium truncate">{bid.item.title}</div>
                      <div className="text-xs text-[#8c8778] truncate">
                        {name} ·{" "}
                        {new Date(bid.placedAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <span className="text-[#09a7ad] font-semibold shrink-0">
                      ${Number(bid.amount).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#e5e0d5] rounded-xl p-5 sm:p-6">
          <h2 className="font-semibold mb-4">Active Auction</h2>
          {!activeAuction ? (
            <div>
              <p className="text-[#8c8778] text-sm mb-4">No auctions yet.</p>
              <Link
                href="/admin/auctions/new"
                className="block text-center bg-[#09a7ad] hover:bg-[#0898a0] text-white text-sm px-4 py-2 rounded-lg"
              >
                Create Auction
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <div className="text-lg font-semibold">{activeAuction.title}</div>
                <div className="text-[#8c8778] text-sm mt-0.5">
                  Closes <LocalDate iso={activeAuction.endAt.toISOString()} />
                </div>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-[#8c8778]">Items</span>
                  <span>{activeAuction.items.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#8c8778]">Raised</span>
                  <span className="text-[#09a7ad] font-semibold">
                    ${activeAuction.items
                      .filter((i) => soldStatuses.includes(i.status))
                      .reduce((s, i) => s + Number(i.currentBid), 0)
                      .toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#8c8778]">Status</span>
                  <span
                    className={`capitalize ${
                      activeAuction.status === "OPEN" ? "text-[#09a7ad]" : "text-[#6b6659]"
                    }`}
                  >
                    {activeAuction.status.toLowerCase()}
                  </span>
                </div>
              </div>
              <Link
                href={`/admin/auctions/${activeAuction.id}`}
                className="block text-center bg-[#f2efe8] hover:bg-[#e8e4dc] text-[#1a1916] text-sm px-4 py-2 rounded-lg"
              >
                Manage Auction
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="px-4 sm:px-8 pb-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Auctions", href: "/admin/auctions", icon: "gavel" },
            { label: "Pickup", href: "/admin/pickup", icon: "package" },
            { label: "Team", href: "/admin/staff", icon: "users" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="bg-white border border-[#e5e0d5] hover:border-[#d4cfc4] rounded-xl p-4 flex items-center gap-3 transition-colors"
            >
              <span className="text-[#6b6659]"><QuickIcon name={link.icon} /></span>
              <span className="text-sm font-medium text-[#4a4640]">{link.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
