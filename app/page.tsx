export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import LocalDate from "./components/LocalDate";
import { PineRidge, MountainRange, WoodenCrate, BranchDivider, PineMark } from "./components/Illustrations";

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

export default async function HomePage() {
  const { userId } = await auth();
  const now = new Date();

  const [activeAuctions, upcomingAuctions] = await Promise.all([
    prisma.auction.findMany({
      where: { status: "OPEN" },
      include: {
        organization: true,
        items: { select: { currentBid: true, status: true } },
      },
      orderBy: { endAt: "asc" },
      take: 9,
    }),
    prisma.auction.findMany({
      where: { status: "DRAFT", startAt: { gt: now } },
      include: {
        organization: true,
        _count: { select: { items: true } },
      },
      orderBy: { startAt: "asc" },
      take: 6,
    }),
  ]);

  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      {/* Hero */}
      <section className="relative px-4 sm:px-6 pt-14 pb-28 sm:pt-16 sm:pb-32 overflow-hidden">
        <MountainRange className="pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 w-[860px] max-w-none opacity-40" />
        <div className="relative max-w-3xl mx-auto text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://assets.cdn.filesafe.space/TwuL7EwKfW8oGIV0Zo5q/media/6a373b261c5d711b35bf4e56.png"
            alt="Northwood Bids"
            className="h-28 sm:h-36 w-auto max-w-[300px] object-contain mx-auto mb-6 drop-shadow-sm"
          />
          {activeAuctions.length > 0 && (
            <a href="#live-auctions" className="inline-flex items-center gap-2 bg-[#a4592a]/10 border border-[#a4592a]/30 text-[#a4592a] text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-full mb-6 hover:bg-[#a4592a]/15 transition-colors">
              <span className="w-2 h-2 rounded-full bg-[#a4592a] animate-pulse inline-block" />
              {activeAuctions.length} live auction{activeAuctions.length !== 1 ? "s" : ""} happening now
            </a>
          )}
          <h1 className="font-display text-5xl sm:text-7xl font-black leading-[1.03] tracking-tight mb-5 text-[#241a12]">
            Going once.<br />
            <span className="text-[#a4592a]">Going twice.</span>
          </h1>
          <p className="text-[#6f5b46] text-lg sm:text-xl max-w-xl mx-auto mb-9 leading-relaxed">
            Real-time auctions with a handshake feel. Bid live, get outbid alerts, and check out securely the moment you win.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="#live-auctions" className="bg-[#a4592a] hover:bg-[#843f1c] text-white font-bold px-9 py-4 rounded-xl text-base transition-all hover:shadow-[0_6px_24px_rgba(164,89,42,0.35)] w-full sm:w-auto text-center">
              {activeAuctions.length > 0 ? "See Live Auctions" : "Browse Auctions"}
            </a>
            {!userId && (
              <Link href="/sign-up" className="bg-white hover:bg-[#efe3d0] border-2 border-[#241a12]/15 text-[#241a12] font-semibold px-9 py-4 rounded-xl text-base transition-colors w-full sm:w-auto text-center shadow-sm">
                Create Free Account
              </Link>
            )}
          </div>
        </div>
        <PineRidge className="pointer-events-none absolute bottom-0 left-0 w-full h-28" />
      </section>

      {/* Live Auctions */}
      <section id="live-auctions" className="px-4 sm:px-6 pt-4 pb-14 sm:pb-16 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <span className="w-2.5 h-2.5 rounded-full bg-[#a4592a] animate-pulse shrink-0" />
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#241a12]">Live Auctions</h2>
          {activeAuctions.length > 0 && (
            <span className="text-[#8a7559] text-sm font-medium">({activeAuctions.length})</span>
          )}
        </div>
        {activeAuctions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {activeAuctions.map((auction) => {
              const raised = auction.items.reduce((sum, i) => sum + Number(i.currentBid), 0);
              const activeItems = auction.items.filter(i => i.status === "ACTIVE").length;
              return (
                <Link key={auction.id} href={`/${auction.organization.slug}/${auction.slug}`}
                  className="bg-white border border-[#e3d6bf] hover:border-[#a4592a]/40 rounded-2xl p-6 transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)] group shadow-sm">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-base group-hover:text-[#a4592a] transition-colors leading-snug text-[#241a12]">{auction.title}</h3>
                    </div>
                    <span className="text-xs bg-[#a4592a]/10 text-[#a4592a] border border-[#a4592a]/20 px-2.5 py-1 rounded-full shrink-0 font-bold whitespace-nowrap">Live</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#8a7559] mb-2">
                    <span>{activeItems} item{activeItems !== 1 ? "s" : ""}</span>
                    {raised > 0 && <span className="text-[#a4592a] font-semibold">${raised.toLocaleString()} raised</span>}
                  </div>
                  <div className="text-xs text-[#b3a085] mt-3 border-t border-[#efe3d0] pt-3">
                    Closes <LocalDate iso={auction.endAt.toISOString()} />
                  </div>
                </Link>
              );
            })}
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
        <section className="px-4 sm:px-6 pb-14 sm:pb-16 max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <span className="text-[#8a7559]"><IconClock /></span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#241a12]">Coming Soon</h2>
            <span className="text-[#8a7559] text-sm font-medium">({upcomingAuctions.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {upcomingAuctions.map((auction) => (
              <Link key={auction.id} href={`/${auction.organization.slug}`}
                className="bg-white border border-[#e3d6bf] hover:border-[#cdbda3] rounded-2xl p-6 transition-all group shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-base leading-snug text-[#2c2317]">{auction.title}</h3>
                  </div>
                  <span className="text-xs bg-[#efe3d0] text-[#8a7559] border border-[#e3d6bf] px-2.5 py-1 rounded-full shrink-0 font-semibold">Upcoming</span>
                </div>
                <div className="text-sm text-[#8a7559] mb-2">{auction._count.items} item{auction._count.items !== 1 ? "s" : ""}</div>
                <div className="text-xs text-[#a4592a] font-medium mt-3 border-t border-[#efe3d0] pt-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#a4592a]/60 inline-block" />
                  Opens <LocalDate iso={auction.startAt!.toISOString()} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="border-t border-[#e3d6bf]/60 bg-[#efe5d3] px-4 sm:px-6 py-14 sm:py-16">
        <div className="max-w-5xl mx-auto">
          <BranchDivider className="w-44 h-5 mx-auto mb-5 opacity-80" />
          <p className="text-center text-[#8a7559] text-xs font-bold uppercase tracking-[0.18em] mb-10">How it works</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-10">
            {[
              { icon: <IconSearch />, title: "Find an auction", desc: "Browse live auctions and watch the countdown. When the timer hits zero, the highest bid wins." },
              { icon: <IconBid />, title: "Place your bid", desc: "Bid in real time or set a max bid — we auto-bid for you. Instant alerts when you are outbid." },
              { icon: <IconTrophy />, title: "Win & pick up", desc: "Win and your card is charged automatically. Arrange pickup with the business." },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="w-12 h-12 bg-white border border-[#e3d6bf] rounded-2xl flex items-center justify-center text-[#a4592a] shrink-0 shadow-sm">{icon}</div>
                <div>
                  <h3 className="font-bold text-[#241a12] mb-1.5">{title}</h3>
                  <p className="text-[#6f5b46] text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-[#8a7559]">
            <span className="flex items-center gap-2"><span className="text-[#a4592a]"><IconBot /></span> Max bidding</span>
            <span className="flex items-center gap-2"><span className="text-[#a4592a]"><IconBell /></span> Outbid alerts</span>
            <span className="flex items-center gap-2"><span className="text-[#a4592a]"><IconClock /></span> Anti-sniping timer</span>
            <span className="flex items-center gap-2"><span className="text-[#a4592a]"><IconShield /></span> Secure Stripe checkout</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#2f2114] text-[#e7dcc6] px-6 pt-10 pb-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <PineMark className="w-6 h-6" />
              <span className="font-display font-extrabold text-lg text-white">Northwood Bids</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[#cdbda3]">
              <Link href="/help" className="hover:text-white transition-colors">Help &amp; Info</Link>
              <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
              <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            </div>
          </div>
          <div className="mt-6 pt-5 border-t border-white/10 text-xs text-[#b3a085]">
            © {new Date().getFullYear()} Northwood Bids. All rights reserved.
          </div>
        </div>
      </footer>
    </main>
  );
}
