export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { requireUserOrg } from "@/lib/auth";
import ItemStatusButton from "@/app/components/ItemStatusButton";

export default async function WinnersPage() {
  const membership = await requireUserOrg();
  const orgId = membership.organization.id;

  // Get org's item IDs first
  const orgItems = await prisma.item.findMany({
    where: { organizationId: orgId },
    select: { id: true },
  });
  const orgItemIds = orgItems.map(i => i.id);

  const [wonBids, activeBids, payments] = await Promise.all([
    prisma.bid.findMany({
      where: { status: "WON", itemId: { in: orgItemIds } },
      include: { item: { include: { photos: true } } },
      orderBy: { placedAt: "desc" },
    }),
    prisma.bid.findMany({
      where: { status: "ACTIVE", itemId: { in: orgItemIds } },
      include: { item: { include: { auction: true } } },
      orderBy: { amount: "desc" },
    }),
    prisma.payment.findMany({
      where: { itemId: { in: orgItemIds } },
    }),
  ]);

  // Resolve bidder display names
  const allBidderIds = [...new Set([
    ...wonBids.map(b => b.clerkUserId),
    ...activeBids.map(b => b.clerkUserId),
  ])];
  const profiles = allBidderIds.length
    ? await prisma.bidderProfile.findMany({ where: { clerkUserId: { in: allBidderIds } } })
    : [];
  const profileMap = new Map(profiles.map(p => [p.clerkUserId, p]));

  const paymentMap = new Map(payments.map((p) => [p.itemId, p]));

  const displayName = (clerkUserId: string) => {
    const p = profileMap.get(clerkUserId);
    return p?.name || p?.email || `${clerkUserId.substring(0, 8)}…`;
  };

  return (
    <>
      <header className="border-b border-[#e3d6bf] px-4 sm:px-8 py-5">
        <h1 className="text-2xl sm:text-3xl font-semibold">Winners &amp; Payments</h1>
      </header>

      <div className="px-4 sm:px-8 py-6 space-y-8">

        {/* Confirmed Winners */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Confirmed Winners</h2>
          {wonBids.length === 0 ? (
            <p className="text-base text-[#8a7559]">No confirmed winners yet — winners are set when an auction closes.</p>
          ) : (
            <div className="bg-white border border-[#e3d6bf] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-[#e3d6bf]">
                    <th className="text-left px-6 py-4 text-[#8a7559] text-sm font-medium">Item</th>
                    <th className="text-left px-6 py-4 text-[#8a7559] text-sm font-medium">Winning Bid</th>
                    <th className="text-left px-6 py-4 text-[#8a7559] text-sm font-medium">Winner</th>
                    <th className="text-left px-6 py-4 text-[#8a7559] text-sm font-medium">Payment</th>
                    <th className="text-left px-6 py-4 text-[#8a7559] text-sm font-medium">Item Status</th>
                    <th className="text-left px-6 py-4 text-[#8a7559] text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {wonBids.map((bid) => {
                    const payment = paymentMap.get(bid.itemId);
                    return (
                      <tr key={bid.id} className="border-b border-[#e3d6bf] last:border-0 hover:bg-[#efe3d0]/50">
                        <td className="px-6 py-4 font-medium text-base">{bid.item.title}</td>
                        <td className="px-6 py-4 text-[#6c4d39] font-bold text-base">${Number(bid.amount).toLocaleString()}</td>
                        <td className="px-6 py-4 text-[#4a3a2b] text-base">
                          {displayName(bid.clerkUserId)}
                        </td>
                        <td className="px-6 py-4">
                          {payment?.status === "PAID" ? (
                            <span className="text-xs bg-[#6c4d39]/20 text-[#6c4d39] px-2 py-1 rounded-full">Paid</span>
                          ) : (
                            <span className="text-xs bg-yellow-500/20 text-amber-600 px-2 py-1 rounded-full">Unpaid</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            bid.item.status === "SOLD" ? "bg-[#6c4d39]/15 text-[#563e2c]"
                            : (bid.item.status as string) === "PENDING_PICKUP" ? "bg-amber-50 text-amber-700"
                            : (bid.item.status as string) === "PICKED_UP" ? "bg-[#efe3d0] text-[#4a3a2b]"
                            : "bg-[#e7dcc6] text-[#6f5b46]"
                          }`}>
                            {bid.item.status.replace("_", " ").toLowerCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <ItemStatusButton
                            itemId={bid.item.id}
                            currentStatus={bid.item.status}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>

        {/* Current Leaders */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Current Leading Bids</h2>
          {activeBids.length === 0 ? (
            <p className="text-base text-[#8a7559]">No active bids yet.</p>
          ) : (
            <div className="bg-white border border-[#e3d6bf] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-[#e3d6bf]">
                    <th className="text-left px-6 py-4 text-[#8a7559] text-sm font-medium">Item</th>
                    <th className="text-left px-6 py-4 text-[#8a7559] text-sm font-medium">Auction</th>
                    <th className="text-left px-6 py-4 text-[#8a7559] text-sm font-medium">Leading Bid</th>
                    <th className="text-left px-6 py-4 text-[#8a7559] text-sm font-medium">Bidder</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBids.map((bid) => (
                    <tr key={bid.id} className="border-b border-[#e3d6bf] last:border-0 hover:bg-[#efe3d0]/50">
                      <td className="px-6 py-4 font-medium text-base">{bid.item.title}</td>
                      <td className="px-6 py-4 text-[#6f5b46] text-base">{bid.item.auction?.title || "—"}</td>
                      <td className="px-6 py-4 text-[#6c4d39] font-bold text-base">${Number(bid.amount).toLocaleString()}</td>
                      <td className="px-6 py-4 text-[#4a3a2b] text-base">{displayName(bid.clerkUserId)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
