export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { requireUserOrg } from "@/lib/auth";
import { money } from "@/lib/format";
import PusherRefresh from "@/app/components/PusherRefresh";
import WinnersBoard, { type Leader, type Winner } from "@/app/components/WinnersBoard";

// Bound the org-wide pulls so the page stays fast even with thousands of items.
// (The board itself searches + paginates client-side on top of this.)
const FETCH_CAP = 3000;
const OWERS_SHOWN = 100;

export default async function WinnersPage() {
  const membership = await requireUserOrg();
  const orgId = membership.organization.id;

  const [wonBids, activeBids, payments] = await Promise.all([
    prisma.bid.findMany({
      where: { status: "WON", item: { organizationId: orgId } },
      include: { item: { include: { photos: { where: { isPrimary: true }, take: 1 }, auction: { select: { title: true } } } } },
      orderBy: { placedAt: "desc" },
      take: FETCH_CAP,
    }),
    prisma.bid.findMany({
      where: { status: "ACTIVE", item: { organizationId: orgId } },
      include: { item: { include: { photos: { where: { isPrimary: true }, take: 1 } } } },
      orderBy: { amount: "desc" },
      take: FETCH_CAP,
    }),
    prisma.payment.findMany({
      where: { item: { organizationId: orgId } },
      select: { id: true, itemId: true, status: true, comped: true },
      take: FETCH_CAP,
    }),
  ]);

  // Resolve bidder display info
  const allBidderIds = [...new Set([...wonBids.map((b) => b.clerkUserId), ...activeBids.map((b) => b.clerkUserId)])];
  const profiles = allBidderIds.length
    ? await prisma.bidderProfile.findMany({
        where: { clerkUserId: { in: allBidderIds } },
        select: { clerkUserId: true, name: true, email: true, phone: true },
      })
    : [];
  const profileMap = new Map(profiles.map((p) => [p.clerkUserId, p]));
  const paymentMap = new Map(payments.map((p) => [p.itemId, p]));

  const displayName = (id: string) => {
    const p = profileMap.get(id);
    return p?.name || p?.email || "Bidder";
  };
  const emailOf = (id: string) => profileMap.get(id)?.email || null;
  const phoneOf = (id: string) => profileMap.get(id)?.phone || null;
  const photoOf = (item: { photos: { url: string }[] }) => item.photos[0]?.url ?? null;

  // ── Who owes money ──────────────────────────────────────────────────────────
  const owers = wonBids.filter((b) => paymentMap.get(b.itemId)?.status !== "PAID");
  const totalOwed = owers.reduce((sum, b) => sum + Number(b.amount), 0);

  // ── Leaders (per bidder) ────────────────────────────────────────────────────
  const leaderMap = new Map<string, Leader>();
  for (const bid of activeBids) {
    let g = leaderMap.get(bid.clerkUserId);
    if (!g) {
      g = {
        clerkUserId: bid.clerkUserId,
        name: displayName(bid.clerkUserId),
        email: emailOf(bid.clerkUserId),
        phone: phoneOf(bid.clerkUserId),
        total: 0,
        items: [],
      };
      leaderMap.set(bid.clerkUserId, g);
    }
    g.items.push({ id: bid.item.id, title: bid.item.title, photo: photoOf(bid.item), amount: Number(bid.amount) });
    g.total += Number(bid.amount);
  }
  const leaders = [...leaderMap.values()].sort((a, b) => b.total - a.total);

  // ── Confirmed winners (per bidder) ──────────────────────────────────────────
  const winnerMap = new Map<string, Winner>();
  for (const bid of wonBids) {
    let g = winnerMap.get(bid.clerkUserId);
    if (!g) {
      g = {
        clerkUserId: bid.clerkUserId,
        name: displayName(bid.clerkUserId),
        email: emailOf(bid.clerkUserId),
        phone: phoneOf(bid.clerkUserId),
        total: 0,
        unpaid: 0,
        items: [],
      };
      winnerMap.set(bid.clerkUserId, g);
    }
    const payment = paymentMap.get(bid.itemId);
    const comped = payment?.comped === true;
    const paid = payment?.status === "PAID";
    g.items.push({
      id: bid.item.id,
      title: bid.item.title,
      photo: photoOf(bid.item),
      amount: Number(bid.amount),
      paid,
      comped,
      status: bid.item.status,
      auctionId: bid.item.auctionId,
      auctionTitle: bid.item.auction?.title ?? null,
      paymentId: payment?.id ?? null,
    });
    g.total += Number(bid.amount);
    if (!paid) g.unpaid += 1;
  }
  const winners = [...winnerMap.values()]
    .map((w) => ({ ...w, items: [...w.items].sort((a, b) => b.amount - a.amount) }))
    .sort((a, b) => {
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
            Who owes money {owers.length > 0 && <span className="text-[#6c4d39]">({money(totalOwed)})</span>}
          </h2>
          {owers.length === 0 ? (
            <div className="bg-white border border-[#e3d6bf] rounded-xl p-6 text-base text-[#6f5b46]">
              Everyone&apos;s paid up — no one currently owes money.
            </div>
          ) : (
            <div className="bg-white border border-[#e3d6bf] rounded-xl divide-y divide-[#e3d6bf]">
              {owers.slice(0, OWERS_SHOWN).map((bid) => {
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
              {owers.length > OWERS_SHOWN && (
                <div className="px-5 sm:px-6 py-3 text-sm text-[#8a7559]">
                  Showing first {OWERS_SHOWN} of {owers.length}. Use Confirmed Winners search below to find a specific bidder.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Confirmed winners + leaders — compact, searchable, paginated */}
        <WinnersBoard leaders={leaders} winners={winners} />
      </div>
    </>
  );
}
