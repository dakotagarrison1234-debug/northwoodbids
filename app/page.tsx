export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import AuctionCard from "./components/AuctionCard";
import SiteFooter from "./components/SiteFooter";
import PusherRefresh from "./components/PusherRefresh";
import TopItemsCarousel from "./components/TopItemsCarousel";
import HomeHero from "./components/HomeHero";
import GiveawayCard from "./components/GiveawayCard";
import BidTicker from "./components/BidTicker";
import ScrollReveal from "./components/ScrollReveal";
import JsonLd from "./components/JsonLd";
import { localBusinessLd } from "@/lib/seo";
import { WoodenCrate, BranchDivider, PineRidge, GavelEmblem } from "./components/Illustrations";
import SectionHeader from "./components/SectionHeader";
import {
  IcoGavel,
  IcoTrophy,
  IcoTruck,
  IcoNew,
  IcoCheck,
  IcoCoin,
  IcoLock,
  IcoGift,
  IcoBolt,
} from "./components/BidIcons";

// ── Below-the-fold copy: the three steps and the real reasons to bid here. ──
const STEPS = [
  {
    n: "01",
    Icon: IcoGavel,
    title: "Bid",
    desc: "Every lot opens at $2. Bid live or set a max and we'll bid for you, up to your number.",
  },
  {
    n: "02",
    Icon: IcoTrophy,
    title: "Win",
    desc: "Clock hits zero, high bid takes it. Your card on file is charged only then, never before.",
  },
  {
    n: "03",
    Icon: IcoTruck,
    title: "Pick up",
    desc: "Book a time in Owosso or Gladwin. Won it at the other barn? We move it for free.",
  },
];

const WHY = [
  { Icon: IcoNew, title: "99% brand new", desc: "Name-brand overstock, still in the box. Not a garage sale." },
  { Icon: IcoCheck, title: "Straight conditions", desc: "We open the box and tell you what's in it. No mystery lots." },
  { Icon: IcoCoin, title: "$2 starts", desc: "Every lot begins at two bucks. The crowd sets the price." },
  { Icon: IcoTruck, title: "Free barn-to-barn", desc: "Pick up in Owosso or Gladwin. We transfer between them at no charge." },
  { Icon: IcoLock, title: "Charged only if you win", desc: "Card on file, nothing taken until the gavel drops your way." },
  { Icon: IcoGift, title: "Bid Bucks", desc: "Invite a friend, earn $5 in Bid Bucks toward your own bill." },
];

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

  // Ticker feed: the LATEST bids landing across live lots — "what just happened",
  // a different story from the carousel's "what's hottest". It skips any lot the
  // carousel already showcases so the two strips never repeat the same names
  // side by side (falling back to overlap only if there's too little activity).
  const carouselIds = new Set(topItems.slice(0, 12).map((it) => it.id));
  const recentBids = await prisma.bid.findMany({
    where: { item: { status: "ACTIVE", auction: { status: { in: ["OPEN", "CLOSING"] }, archived: false } } },
    orderBy: { placedAt: "desc" },
    take: 80,
    select: {
      amount: true,
      itemId: true,
      item: {
        select: {
          title: true,
          auction: { select: { slug: true, organization: { select: { slug: true } } } },
        },
      },
    },
  });
  const seenTicker = new Set<string>();
  const latestLots: { id: string; title: string; href: string; currentBid: number }[] = [];
  for (const b of recentBids) {
    if (seenTicker.has(b.itemId)) continue; // one entry per lot — its most recent bid
    if (!b.item.auction?.slug || !b.item.auction.organization?.slug) continue;
    seenTicker.add(b.itemId);
    latestLots.push({
      id: b.itemId,
      title: b.item.title,
      href: `/${b.item.auction.organization.slug}/${b.item.auction.slug}/item/${b.itemId}`,
      currentBid: Number(b.amount),
    });
  }
  const fresh = latestLots.filter((l) => !carouselIds.has(l.id));
  const tickerLots = (fresh.length >= 4 ? fresh : latestLots).slice(0, 14);

  // Local-business structured data — one entry per physical pickup location, straight
  // from the DB, so the schema always matches reality. Powers local/map ranking.
  const seoLocations = await prisma.pickupLocation
    .findMany({ where: { isActive: true }, select: { name: true, address: true }, take: 20 })
    .catch(() => [] as { name: string; address: string | null }[]);

  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      {seoLocations.length > 0 && <JsonLd data={localBusinessLd(seoLocations)} />}
      <PusherRefresh channel="auctions" event="auction-updated" />
      {/* Hero */}
      <section className="relative overflow-hidden">
        <HomeHero
          liveAuctions={activeAuctions.length}
          liveLots={liveLots}
          bidsToday={bidsToday}
          bestDeal={bestDeal}
          signedIn={!!userId}
        />
      </section>

      {/* Active giveaway (renders nothing when there isn't one) */}
      <GiveawayCard />

      {/* Live board — streaming ticker of the hottest lots + current bids */}
      {tickerLots.length >= 4 && (
        <div className="max-w-6xl mx-auto px-5 sm:px-8 -mt-2">
          <BidTicker lots={tickerLots} />
        </div>
      )}

      {/* Hot right now — auto-scrolling showcase of the top live lots */}
      {topItems.length >= 4 && (
        <ScrollReveal variant="zoom">
          <TopItemsCarousel items={topItems} />
        </ScrollReveal>
      )}

      {/* Live Auctions */}
      <section id="live-auctions" className="px-6 sm:px-8 pt-8 pb-14 sm:pb-16 max-w-6xl mx-auto">
        <BranchDivider className="w-56 h-6 mx-auto mb-6 opacity-80" />
        <SectionHeader
          variant="live"
          eyebrow="Bidding is open"
          title="Live Right Now"
          tagline="Going once, going twice — get your bids in before the gavel drops."
          count={activeAuctions.length}
          countLabel={activeAuctions.length === 1 ? "auction" : "auctions"}
        />
        {activeAuctions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
            {activeAuctions.map((auction, idx) => (
              <ScrollReveal key={auction.id} delay={Math.min(idx, 5) * 80} className="h-full [&>*]:h-full">
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
          <div className="text-center py-14 px-6 bg-[#fbf4e6]/80 rounded-2xl border border-dashed border-[#cdbda3]">
            <WoodenCrate className="nb-float w-32 h-28 mx-auto mb-4" />
            <p className="font-display text-2xl font-black tracking-tight text-[#241a12] mb-1.5">The floor is quiet</p>
            <p className="text-sm text-[#6f5b46] max-w-sm mx-auto leading-relaxed">
              {upcomingAuctions.length > 0
                ? "Nothing closing right now. The next auction is on deck below, so scope the lots and line up your max bids."
                : "Nothing live at the moment. New lots hit the floor every week; check back soon."}
            </p>
            {upcomingAuctions.length > 0 && (
              <a href="#upcoming" className="inline-flex items-center gap-2 mt-5 rounded-xl bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold text-sm px-5 py-2.5 transition-colors">
                See what&apos;s on deck
              </a>
            )}
          </div>
        )}
      </section>

      {/* Upcoming Auctions */}
      {upcomingAuctions.length > 0 && (
        <section id="upcoming" className="px-6 sm:px-8 pb-14 sm:pb-16 max-w-6xl mx-auto">
          <BranchDivider className="w-56 h-6 mx-auto mb-6 opacity-80" />
          <SectionHeader
            variant="upcoming"
            eyebrow="Preview before it opens"
            title="On Deck"
            tagline="Scope the next drop early and line up your max bids."
            count={upcomingAuctions.length}
            countLabel={upcomingAuctions.length === 1 ? "auction" : "auctions"}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
            {upcomingAuctions.map((auction, idx) => (
              <ScrollReveal key={auction.id} delay={Math.min(idx, 5) * 80} className="h-full [&>*]:h-full">
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

      {/* ── How it works: Bid · Win · Pick up ── */}
      <section className="px-6 sm:px-8 pt-4 pb-14 sm:pb-16 max-w-6xl mx-auto">
        <BranchDivider className="w-56 h-6 mx-auto mb-8 opacity-80" />
        <div className="text-center mb-8">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#6c4d39]">
            <IcoBolt className="w-3.5 h-3.5" /> How it works
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-black leading-[0.95] tracking-tight text-[#241a12] mt-1.5">
            Bid. Win. Pick up.
          </h2>
          <p className="text-sm text-[#6f5b46] mt-2">Three steps, no fine print.</p>
        </div>
        <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {STEPS.map(({ n, Icon, title, desc }, idx) => (
            <li key={title} className="h-full">
              <ScrollReveal delay={idx * 110} variant="up" className="h-full [&>*]:h-full">
              <div className="relative flex sm:flex-col gap-4 rounded-2xl bg-white border border-[#e3d6bf] p-5 shadow-sm overflow-hidden">
                <span
                  aria-hidden
                  className="absolute -right-2 -top-4 font-display text-7xl font-black text-[#f1e7d5] select-none leading-none"
                >
                  {n}
                </span>
                <span className="relative w-12 h-12 shrink-0 rounded-xl bg-[#6c4d39] text-[#f6ecda] flex items-center justify-center shadow-[0_6px_16px_-8px_rgba(108,77,57,0.9)]">
                  <Icon className="w-6 h-6" />
                </span>
                <div className="relative min-w-0">
                  <h3 className="font-display text-xl font-black tracking-tight text-[#241a12]">{title}</h3>
                  <p className="text-sm text-[#6f5b46] leading-relaxed mt-1">{desc}</p>
                </div>
              </div>
              </ScrollReveal>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Why Northwood: the real selling points, on a cream plank ── */}
      <section className="nb-band px-6 sm:px-8 py-14 sm:py-16">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
            <div>
              <p className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#2f5d3a]">
                <IcoCheck className="w-3.5 h-3.5" /> Why Northwood
              </p>
              <h2 className="font-display text-3xl sm:text-4xl font-black leading-[0.95] tracking-tight text-[#241a12] mt-1.5">
                Real brands. Honest lots. Local pickup.
              </h2>
            </div>
            <p className="text-sm text-[#6f5b46] sm:max-w-xs sm:text-right leading-snug">
              A Michigan auction house that runs like a handshake.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {WHY.map(({ Icon, title, desc }, idx) => (
              <ScrollReveal key={title} delay={Math.min(idx, 5) * 70} variant="up" className="h-full [&>*]:h-full">
                <div className="nb-lift flex items-start gap-3.5 rounded-2xl bg-white border border-[#e3d6bf] p-4 sm:p-5">
                  <span className="w-10 h-10 shrink-0 rounded-xl bg-[#e4f2e4] text-[#2f5d3a] flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-black tracking-tight text-[#241a12] leading-tight">{title}</h3>
                    <p className="text-[13px] text-[#6f5b46] leading-relaxed mt-1">{desc}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA band ── */}
      <section className="px-6 sm:px-8 py-14 sm:py-16 max-w-6xl mx-auto">
        <ScrollReveal variant="zoom">
          <div className="relative overflow-hidden rounded-2xl bg-[#241a12] text-[#f1e7d5] shadow-[0_18px_40px_-20px_rgba(36,26,18,0.7)]">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div
                className="absolute -top-24 left-1/2 -translate-x-1/2 w-[520px] h-[300px] rounded-full blur-3xl"
                style={{ background: "radial-gradient(circle, rgba(240,163,90,0.28) 0%, rgba(240,163,90,0) 70%)" }}
              />
              <PineRidge className="nb-feather-x absolute bottom-0 left-0 w-full h-24 opacity-30" />
            </div>
            <div className="relative px-6 sm:px-10 pt-9 pb-24 sm:pb-28 text-center">
              <GavelEmblem className="w-14 h-14 mx-auto mb-4" />
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#f0a35a]">Two barns. One floor. Every week.</p>
              <h2 className="font-display text-3xl sm:text-5xl font-black leading-[0.95] tracking-tight text-white mt-2">
                Every lot starts at $2.
                <br />
                <span className="text-[#f0a35a]">Where it lands is up to you.</span>
              </h2>
              <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                <a
                  href="#live-auctions"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#f0a35a] hover:bg-[#f3b273] text-[#241a12] font-black px-8 py-3.5 text-base transition-colors shadow-[0_8px_24px_-8px_rgba(240,163,90,0.8)]"
                >
                  <IcoGavel className="w-5 h-5" />
                  {activeAuctions.length > 0 ? "Start bidding" : "See what's coming"}
                </a>
                {!userId && (
                  <Link
                    href="/sign-up"
                    className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border-2 border-[#f1e7d5]/25 hover:border-[#f1e7d5]/50 hover:bg-white/5 text-[#f1e7d5] font-bold px-8 py-3.5 text-base transition-colors"
                  >
                    Create free account
                  </Link>
                )}
              </div>
              <Link
                href="/play"
                className="inline-flex items-center gap-1.5 mt-6 text-[13px] font-semibold text-[#cdbda3] hover:text-[#f0a35a] transition-colors"
              >
                Warm up in the Auction Arcade
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Footer */}
      <SiteFooter />
    </main>
  );
}
