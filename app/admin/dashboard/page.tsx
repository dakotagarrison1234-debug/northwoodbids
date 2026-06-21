export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserOrg } from "@/lib/auth";
import LocalDate from "@/app/components/LocalDate";

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
      <header className="border-b border-[#e3d6bf] px-4 sm:px-8 py-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-semibold">Dashboard</h1>
        <Link
          href="/admin/auctions/new"
          className="bg-[#a4592a] hover:bg-[#843f1c] text-white text-base font-semibold px-6 py-3.5 rounded-xl transition-colors"
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
          <div key={stat.label} className="bg-white border border-[#e3d6bf] rounded-xl p-5 sm:p-6">
            <div className="text-[#8a7559] text-sm sm:text-base mb-1">{stat.label}</div>
            <div className="text-2xl sm:text-3xl font-bold">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Recent bids + active auction */}
      <div className="px-4 sm:px-8 pb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-[#e3d6bf] rounded-xl p-6 sm:p-7">
          <h2 className="text-lg font-semibold mb-4">Recent Bids</h2>
          {recentBids.length === 0 ? (
            <p className="text-[#8a7559] text-base">No bids yet.</p>
          ) : (
            <div>
              {recentBids.map((bid) => {
                const p = profileMap.get(bid.clerkUserId);
                const name = p?.name || p?.email || `${bid.clerkUserId.substring(0, 8)}…`;
                return (
                  <div
                    key={bid.id}
                    className="flex items-center justify-between py-3 border-b border-[#e3d6bf] last:border-0"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="text-base font-medium truncate">{bid.item.title}</div>
                      <div className="text-sm text-[#8a7559] truncate">
                        {name} ·{" "}
                        {new Date(bid.placedAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <span className="text-[#a4592a] font-semibold text-base shrink-0">
                      ${Number(bid.amount).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#e3d6bf] rounded-xl p-6 sm:p-7">
          <h2 className="text-lg font-semibold mb-4">Active Auction</h2>
          {!activeAuction ? (
            <div>
              <p className="text-[#8a7559] text-base mb-4">No auctions yet.</p>
              <Link
                href="/admin/auctions/new"
                className="block text-center bg-[#a4592a] hover:bg-[#843f1c] text-white text-base font-semibold px-6 py-3.5 rounded-xl transition-colors"
              >
                Create Auction
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <div className="text-lg font-semibold">{activeAuction.title}</div>
                <div className="text-[#8a7559] text-base mt-0.5">
                  Closes <LocalDate iso={activeAuction.endAt.toISOString()} />
                </div>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-base">
                  <span className="text-[#8a7559]">Items</span>
                  <span>{activeAuction.items.length}</span>
                </div>
                <div className="flex justify-between text-base">
                  <span className="text-[#8a7559]">Raised</span>
                  <span className="text-[#a4592a] font-semibold">
                    ${activeAuction.items
                      .filter((i) => soldStatuses.includes(i.status))
                      .reduce((s, i) => s + Number(i.currentBid), 0)
                      .toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-base">
                  <span className="text-[#8a7559]">Status</span>
                  <span
                    className={`capitalize ${
                      activeAuction.status === "OPEN" ? "text-[#a4592a]" : "text-[#6f5b46]"
                    }`}
                  >
                    {activeAuction.status.toLowerCase()}
                  </span>
                </div>
              </div>
              <Link
                href={`/admin/auctions/${activeAuction.id}`}
                className="block text-center bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] text-[#241a12] text-base font-semibold px-6 py-3.5 rounded-xl transition-colors"
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
              className="bg-white border border-[#e3d6bf] hover:border-[#cdbda3] rounded-xl p-5 flex items-center gap-3 transition-colors"
            >
              <span className="text-[#6f5b46]"><QuickIcon name={link.icon} /></span>
              <span className="text-base font-semibold text-[#4a3a2b]">{link.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
