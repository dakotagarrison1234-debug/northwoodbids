export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { requireUserOrg } from "@/lib/auth";
import Link from "next/link";
import ItemStatusButton from "@/app/components/ItemStatusButton";
import StatusPill from "@/app/components/StatusPill";
import { money } from "@/lib/format";

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
    return p?.name || p?.email || "Bidder";
  };
  const emailOf = (clerkUserId: string) => profileMap.get(clerkUserId)?.email || null;
  const phoneOf = (clerkUserId: string) => profileMap.get(clerkUserId)?.phone || null;

  // "Who owes money" — winners whose payment isn't marked PAID.
  const owers = wonBids.filter((b) => paymentMap.get(b.itemId)?.status !== "PAID");
  const totalOwed = owers.reduce((sum, b) => sum + Number(b.amount), 0);

  return (
    <>
      <header className="border-b border-[#e3d6bf] px-4 sm:px-8 py-5">
        <h1 className="text-2xl sm:text-3xl font-semibold">Winners &amp; Payments</h1>
      </header>

      <div className="px-4 sm:px-8 py-6 space-y-8">

        {/* Who owes money */}
        <div>
          <h2 className="text-lg font-semibold mb-4">
            Who owes money{" "}
            {owers.length > 0 && <span className="text-[#6c4d39]">({money(totalOwed)})</span>}
          </h2>
          {owers.length === 0 ? (
            <div className="bg-white border border-[#e3d6bf] rounded-xl p-6 text-base text-[#6f5b46]">
              Everyone&apos;s paid up — no one currently owes money.
            </div>
          ) : (
            <div className="bg-white border border-[#e3d6bf] rounded-xl divide-y divide-[#e3d6bf]">
              {owers.map((bid) => {
                const email = emailOf(bid.clerkUserId);
                const phone = phoneOf(bid.clerkUserId);
                return (
                  <div key={bid.id} className="px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-[#241a12]">{displayName(bid.clerkUserId)}</div>
                      <div className="text-sm text-[#8a7559] truncate">
                        {bid.item.title}
                        {email ? ` · ${email}` : ""}
                        {phone ? ` · ${phone}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-lg font-bold text-[#6c4d39] mr-1">{money(Number(bid.amount))}</span>
                      {email && (
                        <a
                          href={`mailto:${email}?subject=${encodeURIComponent(`Payment for "${bid.item.title}"`)}`}
                          className="text-base font-semibold bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] text-[#241a12] px-5 py-2.5 rounded-xl transition-colors whitespace-nowrap"
                        >
                          Email
                        </a>
                      )}
                      {phone && (
                        <a
                          href={`tel:${phone}`}
                          className="text-base font-semibold bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] text-[#241a12] px-5 py-2.5 rounded-xl transition-colors whitespace-nowrap"
                        >
                          Call
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

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
                        <td className="px-6 py-4 text-[#6c4d39] font-bold text-base">{money(Number(bid.amount))}</td>
                        <td className="px-6 py-4 text-[#4a3a2b] text-base">
                          {displayName(bid.clerkUserId)}
                        </td>
                        <td className="px-6 py-4">
                          {payment?.status === "PAID" ? (
                            <StatusPill status="PAID" label="Paid" />
                          ) : (
                            <StatusPill status="PENDING" label="Unpaid" />
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <StatusPill status={bid.item.status} />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-2">
                            <ItemStatusButton
                              itemId={bid.item.id}
                              currentStatus={bid.item.status}
                            />
                            {payment?.status === "PAID" && bid.item.auctionId && (
                              <Link
                                href={`/invoice/${bid.item.auctionId}?user=${encodeURIComponent(bid.clerkUserId)}`}
                                className="text-xs text-[#6c4d39] hover:text-[#c47b3e] font-medium underline whitespace-nowrap"
                              >
                                Receipt
                              </Link>
                            )}
                          </div>
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
                      <td className="px-6 py-4 text-[#6c4d39] font-bold text-base">{money(Number(bid.amount))}</td>
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
