export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import AuctionCard from "./components/AuctionCard";
import SiteFooter from "./components/SiteFooter";
import PusherRefresh from "./components/PusherRefresh";
import TopItemsCarousel from "./components/TopItemsCarousel";
import HomeHero from "./components/HomeHero";
import BidTicker from "./components/BidTicker";
import ScrollReveal from "./components/ScrollReveal";
import { WoodenCrate, BranchDivider } from "./components/Illustrations";

function IconSearch() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  );
}
function IconBid() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 7l4 4-8 8H5v-4l8-8z" /><path d="m18.5 2.5 3 3" /><path d="m16 5 3 3" />
    </svg>
  );
}
function IconTrophy() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4a2 2 0 0 1-2-2V5h4" /><path d="M18 9h2a2 2 0 0 0 2-2V5h-4" />
      <path d="M8 21h8" /><path d="M12 17v4" /><path d="M6 3h12v8a6 6 0 0 1-12 0V3z" />
    </svg>
  );
}
function IconBot() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="9" cy="16" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="16" r="1" fill="currentColor" stroke="none" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" /><path d="M12 3v2" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

// (Urgency pill removed — AuctionCard now carries a live ticking AuctionCountdown
//  that shows regardless of how far out the date is.)

export default async function HomePage() {
  const { userId } = await auth();
  const now = new Date();

  const [activeAuctions, upcomingAuctions] = await Promise.all([
    prisma.auction.findMany({
      where: { status: "OPEN", archived: false },
      include: {
        organization: true,
        // Preview the most-popular items (most bids first; any items if none have bids).
        items: {
          where: { status: "ACTIVE" },
          orderBy: [{ bids: { _count: "desc" } }, { currentBid: "desc" }],
          take: 8,
          select: {
            id: true,
            photos: { take: 1, orderBy: [{ isPrimary: "desc" }, { order: "asc" }], select: { url: true } },
          },
        },
      },
      orderBy: { endAt: "asc" },
      take: 9,
    }),
    prisma.auction.findMany({
      where: { status: "DRAFT", startAt: { gt: now } },
      include: {
        organization: true,
        _count: { select: { items: true } },
        items: {
          take: 8,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            photos: { take: 1, orderBy: [{ isPrimary: "desc" }, { order: "asc" }], select: { url: true } },
          },
        },
      },
      orderBy: { startAt: "asc" },
      take: 6,
    }),
  ]);

  // Active-item count per auction (auction dollar totals are admin-only, never shown
  // on public cards) — one grouped query rather than loading every item row.
  const activeAuctionIds = activeAuctions.map((a) => a.id);
  const activeItemsByAuction = activeAuctionIds.length
    ? await prisma.item.groupBy({
        by: ["auctionId"],
        where: { auctionId: { in: activeAuctionIds }, status: "ACTIVE" },
        _count: { _all: true },
      })
    : [];
  const activeItemsMap = new Map(
    activeItemsByAuction.map((r) => [r.auctionId, r._count._all])
  );

  // "Hot right now" showcase: top live lots blended by bid count (engagement),
  // current bid, and MSRP. Pull a bounded candidate set ordered by bids, then
  // score in JS and keep the top 12 with a photo.
  const topCandidates = await prisma.item.findMany({
    where: { status: "ACTIVE", auction: { status: { in: ["OPEN", "CLOSING"] }, archived: false } },
    orderBy: [{ bids: { _count: "desc" } }, { currentBid: "desc" }],
    take: 60,
    select: {
      id: true, title: true, currentBid: true, retailValue: true, itemEndAt: true,
      photos: { take: 1, orderBy: [{ isPrimary: "desc" }, { order: "asc" }], select: { url: true } },
      _count: { select: { bids: true } },
      auction: { select: { slug: true, endAt: true, organization: { select: { slug: true } } } },
    },
  });
  const topItems = topCandidates
    .filter((it) => it.photos[0]?.url && it.auction?.slug && it.auction.organization?.slug)
    .map((it) => {
      const bidCount = it._count.bids;
      const cur = Number(it.currentBid);
      const msrp = Number(it.retailValue);
      return {
        id: it.id,
        title: it.title,
        href: `/${it.auction!.organization!.slug}/${it.auction!.slug}/item/${it.id}`,
        photo: it.photos[0]!.url,
        currentBid: cur,
        retailValue: msrp,
        bidCount,
        endsAt: new Date(it.itemEndAt ?? it.auction!.endAt).toISOString(),
        score: bidCount * 3 + cur + msrp * 0.02,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  // ── Hero live stats ──
  // Total lots live right now (sum across live auctions), how many bids landed in
  // the last 24h (the "it's happening" number), and the best MSRP discount on the
  // board — a headline "up to X% off retail". All cheap: one count + in-JS maxes.
  const liveLots = Array.from(activeItemsMap.values()).reduce((a, b) => a + b, 0);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const bidsToday = await prisma.bid.count({ where: { placedAt: { gte: dayAgo } } });
  const bestDeal = Math.min(
    95,
    topItems.reduce((best, it) => {
      if (it.retailValue > 0 && it.currentBid < it.retailValue) {
        return Math.max(best, Math.round((1 - it.currentBid / it.retailValue) * 100));
      }
      return best;
    }, 0)
  );

  // Ticker feed: the hottest lots as a streaming live board.
  const tickerLots = topItems.slice(0, 14).map((it) => ({
    id: it.id,
    title: it.title,
    href: it.href,
    currentBid: it.currentBid,
  }));

  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      <PusherRefresh channel="auctions" event="auction-updated" />
      {/* Hero */}
      <section className="relative px-5 sm:px-8 pt-4 pb-10 sm:pt-6 sm:pb-14 overflow-hidden">
        <HomeHero
          liveAuctions={activeAuctions.length}
          liveLots={liveLots}
          bidsToday={bidsToday}
          bestDeal={bestDeal}
          signedIn={!!userId}
        />
      </section>

      {/* Live board — streaming ticker of the hottest lots + current bids */}
      {tickerLots.length >= 4 && <BidTicker lots={tickerLots} />}

      {/* Hot right now — auto-scrolling showcase of the top live lots */}
      {topItems.length >= 4 && (
        <ScrollReveal variant="zoom">
          <TopItemsCarousel items={topItems} />
        </ScrollReveal>
      )}

      {/* Live Auctions */}
      <section id="live-auctions" className="px-6 sm:px-8 pt-4 pb-14 sm:pb-16 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <span className="w-2.5 h-2.5 rounded-full bg-[#6c4d39] animate-pulse shrink-0" />
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#241a12]">Live Auctions</h2>
          {activeAuctions.length > 0 && (
            <span className="text-[#8a7559] text-sm font-medium">({activeAuctions.length})</span>
          )}
        </div>
        {activeAuctions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
            {activeAuctions.map((auction, idx) => (
              <ScrollReveal key={auction.id} delay={Math.min(idx, 5) * 80} className="h-full [&>*]:h-full nb-lift rounded-2xl">
                <AuctionCard
                  mode="live"
                  auction={{
                    id: auction.id,
                    title: auction.title,
                    slug: auction.slug,
                    status: auction.status,
                    startAtIso: auction.startAt.toISOString(),
                    endAtIso: auction.endAt.toISOString(),
                    itemCount: activeItemsMap.get(auction.id) ?? 0,
                    org: {
                      name: auction.organization.name,
                      slug: auction.organization.slug,
                      logoUrl: auction.organization.logoUrl,
                    },
                    items: auction.items,
                  }}
                />
              </ScrollReveal>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-2xl border border-[#e3d6bf] shadow-sm">
            <WoodenCrate className="w-32 h-28 mx-auto mb-4" />
            <p className="text-lg font-bold mb-1 text-[#4a3a2b] font-display">No live auctions right now</p>
            <p className="text-sm text-[#8a7559]">{upcomingAuctions.length > 0 ? "See what's coming up below." : "Check back soon — new lots are added often."}</p>
          </div>
        )}
      </section>

      {/* Upcoming Auctions */}
      {upcomingAuctions.length > 0 && (
        <section id="upcoming" className="px-6 sm:px-8 pb-14 sm:pb-16 max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <span className="text-[#8a7559]"><IconClock /></span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#241a12]">Coming Soon</h2>
            <span className="text-[#8a7559] text-sm font-medium">({upcomingAuctions.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
            {upcomingAuctions.map((auction, idx) => (
              <ScrollReveal key={auction.id} delay={Math.min(idx, 5) * 80} className="h-full [&>*]:h-full nb-lift rounded-2xl">
                <AuctionCard
                  mode="upcoming"
                  auction={{
                    id: auction.id,
                    title: auction.title,
                    slug: auction.slug,
                    status: auction.status,
                    startAtIso: auction.startAt.toISOString(),
                    endAtIso: auction.endAt.toISOString(),
                    itemCount: auction._count.items,
                    org: {
                      name: auction.organization.name,
                      slug: auction.organization.slug,
                      logoUrl: auction.organization.logoUrl,
                    },
                    items: auction.items,
                  }}
                />
              </ScrollReveal>
            ))}
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="border-t border-[#e3d6bf]/60 bg-[#efe5d3] px-6 sm:px-8 py-14 sm:py-16">
        <div className="max-w-5xl mx-auto">
          <BranchDivider className="w-44 h-5 mx-auto mb-5 opacity-80" />
          <p className="text-center text-[#8a7559] text-xs font-bold uppercase tracking-[0.18em] mb-10">How it works</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-10">
            {[
              { icon: <IconSearch />, title: "Find an auction", desc: "Browse live auctions and watch the countdown. When the timer hits zero, the highest bid wins." },
              { icon: <IconBid />, title: "Place your bid", desc: "Bid in real time or set a max bid — we auto-bid for you. Instant alerts when you are outbid." },
              { icon: <IconTrophy />, title: "Win & pick up", desc: "Win and your card is charged automatically. Schedule your own pickup time online." },
            ].map(({ icon, title, desc }, idx) => (
              <ScrollReveal key={title} delay={idx * 110} variant="up">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-white border border-[#e3d6bf] rounded-2xl flex items-center justify-center text-[#6c4d39] shrink-0 shadow-sm">{icon}</div>
                  <div>
                    <h3 className="font-bold text-[#241a12] mb-1.5">{title}</h3>
                    <p className="text-[#6f5b46] text-sm leading-relaxed">{desc}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-[#8a7559]">
            <span className="flex items-center gap-2"><span className="text-[#6c4d39]"><IconBot /></span> Max bidding</span>
            <span className="flex items-center gap-2"><span className="text-[#6c4d39]"><IconBell /></span> Outbid alerts</span>
            <span className="flex items-center gap-2"><span className="text-[#6c4d39]"><IconClock /></span> Anti-sniping timer</span>
            <span className="flex items-center gap-2"><span className="text-[#6c4d39]"><IconShield /></span> Secure Stripe checkout</span>
          </div>
        </div>
      </section>

      {/* Game CTA */}
      <section className="px-6 sm:px-8 pb-14 sm:pb-16 max-w-6xl mx-auto">
        <ScrollReveal variant="zoom">
        <Link href="/play"
          className="group relative block overflow-hidden rounded-2xl border border-[#6c4d39]/30 bg-gradient-to-br from-[#6c4d39] to-[#4a3a2b] text-[#f1e7d5] px-6 sm:px-10 py-8 shadow-sm hover:shadow-[0_8px_30px_rgba(74,58,43,0.35)] transition-shadow">
          <div className="relative flex flex-col sm:flex-row items-center justify-between gap-5">
            <div className="text-center sm:text-left">
              <div className="text-xs font-bold uppercase tracking-widest text-[#e7dcc6]/70 mb-1">Auction Arcade</div>
              <h2 className="font-display text-2xl sm:text-3xl font-black text-white">Going Once, Going Twice!</h2>
              <p className="text-[#e7dcc6] text-sm sm:text-base mt-1">Slam the gavel, win the lots, and climb the high-score board.</p>
            </div>
            <span className="shrink-0 inline-flex items-center gap-2 bg-[#f1e7d5] text-[#4a3a2b] font-extrabold text-base px-7 py-3.5 rounded-xl group-hover:bg-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 4l6 6-3 3M14 4l-3 3M14 4l-9 9 5 5 9-9M5 13l-3 9 9-3" />
              </svg>
              Play now
            </span>
          </div>
        </Link>
        </ScrollReveal>
      </section>

      {/* Footer */}
      <SiteFooter />
    </main>
  );
}
