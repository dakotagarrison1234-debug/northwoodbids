export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { requireUserOrg } from "@/lib/auth";
import Link from "next/link";
import Image from "next/image";
import ItemStatusButton from "@/app/components/ItemStatusButton";
import RefundButton from "@/app/components/RefundButton";
import StatusPill from "@/app/components/StatusPill";
import { money } from "@/lib/format";
import PusherRefresh from "@/app/components/PusherRefresh";

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
      include: { item: { include: { auction: true, photos: true } } },
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

  // Current leaders, grouped per bidder (a bidder leading 5 items shows once,
  // with all 5 item previews below their name). activeBids is amount-desc, so
  // each bidder's items come out highest-first.
  type LeaderItem = { id: string; title: string; photo: string | null; amount: number };
  const leaderMap = new Map<string, LeaderItem[]>();
  for (const bid of activeBids) {
    const arr = leaderMap.get(bid.clerkUserId) ?? [];
    const photo =
      bid.item.photos.find((p) => p.isPrimary)?.url ?? bid.item.photos[0]?.url ?? null;
    arr.push({ id: bid.item.id, title: bid.item.title, photo, amount: Number(bid.amount) });
    leaderMap.set(bid.clerkUserId, arr);
  }
  const leaders = [...leaderMap.entries()]
    .map(([clerkUserId, items]) => ({
      clerkUserId,
      items,
      total: items.reduce((s, i) => s + i.amount, 0),
    }))
    .sort((a, b) => b.total - a.total);

  // Confirmed winners, grouped per winner — one card each, with a swipeable strip
  // of the items they won (and their per-item pay/pickup actions).
  type WonEntry = (typeof wonBids)[number];
  const winnerMap = new Map<string, WonEntry[]>();
  for (const bid of wonBids) {
    const arr = winnerMap.get(bid.clerkUserId) ?? [];
    arr.push(bid);
    winnerMap.set(bid.clerkUserId, arr);
  }
  const winnerGroups = [...winnerMap.entries()]
    .map(([clerkUserId, bids]) => {
      const sorted = [...bids].sort((a, b) => Number(b.amount) - Number(a.amount));
      const total = sorted.reduce((s, b) => s + Number(b.amount), 0);
      const unpaid = sorted.filter((b) => paymentMap.get(b.itemId)?.status !== "PAID").length;
      return { clerkUserId, bids: sorted, total, unpaid };
    })
    .sort((a, b) => {
      // Owers first (so staff see who still needs to pay), then by total desc.
      if ((a.unpaid > 0) !== (b.unpaid > 0)) return a.unpaid > 0 ? -1 : 1;
      return b.total - a.total;
    });

  return (
    <>
      <PusherRefresh channel="auctions" event="auction-updated" />
      <header className="border-b border-[#e3d6bf] px-6 sm:px-8 py-5">
        <h1 className="text-2xl sm:text-3xl font-semibold">Winners &amp; Payments</h1>
      </header>

      <div className="px-6 sm:px-8 py-6 space-y-8">

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

        {/* Confirmed Winners — grouped per winner with a swipeable item strip */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Confirmed Winners</h2>
          {winnerGroups.length === 0 ? (
            <p className="text-base text-[#8a7559]">No confirmed winners yet — winners are set when an auction closes.</p>
          ) : (
            <div className="space-y-4">
              {winnerGroups.map((g) => {
                const email = emailOf(g.clerkUserId);
                const phone = phoneOf(g.clerkUserId);
                return (
                  <div key={g.clerkUserId} className="bg-white border border-[#e3d6bf] rounded-xl p-5 sm:p-6">
                    {/* Winner header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-[#241a12] truncate">
                          {displayName(g.clerkUserId)}
                        </div>
                        <div className="text-sm text-[#8a7559] truncate">{email || phone || "—"}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-[#6c4d39] leading-none">{money(g.total)}</div>
                        <div className="mt-1">
                          {g.unpaid > 0 ? (
                            <span className="text-xs font-bold uppercase tracking-wide bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                              {g.unpaid} unpaid
                            </span>
                          ) : (
                            <span className="text-xs font-bold uppercase tracking-wide bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                              All paid
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#8a7559] mt-1">
                          {g.bids.length} item{g.bids.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>

                    {/* Swipeable item strip */}
                    <div className="mt-4 flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
                      {g.bids.map((bid) => {
                        const payment = paymentMap.get(bid.itemId);
                        const paid = payment?.status === "PAID";
                        const photo =
                          bid.item.photos.find((p) => p.isPrimary)?.url ?? bid.item.photos[0]?.url ?? null;
                        return (
                          <div
                            key={bid.id}
                            className="snap-start shrink-0 w-48 border border-[#e3d6bf] rounded-xl overflow-hidden bg-[#faf6ee] flex flex-col"
                          >
                            <Link href={`/admin/items/${bid.item.id}`} className="block relative aspect-square bg-[#efe3d0]">
                              {photo ? (
                                <Image src={photo} alt={bid.item.title} fill sizes="192px" className="object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[#b3a085] text-xs">No photo</div>
                              )}
                              <span className={`absolute top-1.5 right-1.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${
                                paid ? "bg-green-100 text-green-700 border-green-200" : "bg-amber-100 text-amber-700 border-amber-200"
                              }`}>
                                {paid ? "Paid" : "Unpaid"}
                              </span>
                            </Link>
                            <div className="p-3 flex flex-col gap-2 flex-1">
                              <div className="text-sm font-medium text-[#241a12] line-clamp-2 leading-snug">{bid.item.title}</div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[#6c4d39] font-bold text-sm">{money(Number(bid.amount))}</span>
                                <StatusPill status={bid.item.status} />
                              </div>
                              <div className="mt-auto flex flex-col gap-1.5 pt-1">
                                <ItemStatusButton itemId={bid.item.id} currentStatus={bid.item.status} />
                                {paid && bid.item.auctionId && (
                                  <Link
                                    href={`/invoice/${bid.item.auctionId}?user=${encodeURIComponent(g.clerkUserId)}`}
                                    className="text-xs text-[#6c4d39] hover:text-[#c47b3e] font-medium underline"
                                  >
                                    Receipt
                                  </Link>
                                )}
                                {paid && payment && (
                                  <RefundButton
                                    paymentId={payment.id}
                                    amount={Number(bid.amount)}
                                    winnerName={displayName(g.clerkUserId)}
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Current Leaders — grouped per bidder */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Current Leading Bids</h2>
          {leaders.length === 0 ? (
            <p className="text-base text-[#8a7559]">No active bids yet.</p>
          ) : (
            <div className="space-y-4">
              {leaders.map((leader) => {
                const email = emailOf(leader.clerkUserId);
                const phone = phoneOf(leader.clerkUserId);
                return (
                  <div key={leader.clerkUserId} className="bg-white border border-[#e3d6bf] rounded-xl p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-[#241a12] truncate">
                          {displayName(leader.clerkUserId)}
                        </div>
                        <div className="text-sm text-[#8a7559] truncate">
                          {email || phone || "—"}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-[#6c4d39] leading-none">{money(leader.total)}</div>
                        <div className="text-xs text-[#8a7559] mt-1">
                          winning {leader.items.length} item{leader.items.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                      {leader.items.map((it) => (
                        <Link href={`/admin/items/${it.id}`} key={it.id} className="block group">
                          <div className="relative aspect-square rounded-lg overflow-hidden bg-[#efe3d0] border border-[#e3d6bf]">
                            {it.photo ? (
                              <Image src={it.photo} alt={it.title} fill sizes="120px" className="object-cover group-hover:opacity-90 transition-opacity" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[#b3a085] text-xs">No photo</div>
                            )}
                            <span className="absolute bottom-0 inset-x-0 bg-[#6c4d39]/90 text-white text-[11px] font-bold text-center py-0.5">
                              {money(it.amount)}
                            </span>
                          </div>
                          <div className="text-xs text-[#4a3a2b] mt-1 line-clamp-1 group-hover:text-[#241a12]">{it.title}</div>
                        </Link>
                      ))}
                    </div>
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
