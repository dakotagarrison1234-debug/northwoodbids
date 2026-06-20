export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import HomeHeader from "./components/HomeHeader";
import LocalDate from "./components/LocalDate";
import OrgLogo from "./components/OrgLogo";

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
function IconCalendar() {
  return (
    <svg className="w-9 h-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

export default async function HomePage() {
  const { userId } = await auth();
  const now = new Date();

  const [activeAuctions, upcomingAuctions, allOrgs] = await Promise.all([
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
    prisma.organization.findMany({
      where: { isActive: true },
      include: {
        auctions: { where: { status: "OPEN" }, select: { id: true } },
        _count: { select: { auctions: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const sortedOrgs = [...allOrgs].sort((a, b) => b.auctions.length - a.auctions.length);

  return (
    <main className="min-h-screen bg-[#faf8f4] text-[#1a1916]">
      <HomeHeader />

      {/* Hero */}
      <section className="relative px-4 sm:px-6 pt-14 pb-12 sm:pt-20 sm:pb-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[280px] bg-[#09a7ad]/6 rounded-full blur-[100px]" />
        </div>
        <div className="relative max-w-5xl mx-auto text-center">
          {activeAuctions.length > 0 && (
            <a href="#live-auctions" className="inline-flex items-center gap-2 bg-[#09a7ad]/10 border border-[#09a7ad]/25 text-[#09a7ad] text-xs font-bold px-4 py-2 rounded-full mb-6 hover:bg-[#0898a0]/15 transition-colors">
              <span className="w-2 h-2 rounded-full bg-[#09a7ad] animate-pulse inline-block" />
              {activeAuctions.length} live auction{activeAuctions.length !== 1 ? "s" : ""} happening now
            </a>
          )}
          <h1 className="text-4xl sm:text-6xl font-extrabold leading-[1.08] tracking-tight mb-5 text-[#1a1916]">
            Bid on great things.<br />
            <span className="bg-gradient-to-r from-[#09a7ad] to-[#0bbcc2] bg-clip-text text-transparent">
              Support great causes.
            </span>
          </h1>
          <p className="text-[#6b6659] text-lg sm:text-xl max-w-xl mx-auto mb-9 leading-relaxed">
            Real-time auctions from local nonprofits and schools. Bid live, get outbid alerts, and check out securely when you win.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="#live-auctions" className="bg-[#09a7ad] hover:bg-[#0898a0] text-white font-bold px-9 py-4 rounded-2xl text-base transition-all hover:shadow-[0_4px_24px_rgba(9,167,173,0.35)] w-full sm:w-auto text-center">
              {activeAuctions.length > 0 ? "See Live Auctions" : "Browse Auctions"}
            </a>
            {!userId && (
              <Link href="/sign-up" className="bg-white hover:bg-[#f2efe8] border border-[#e5e0d5] text-[#1a1916] font-semibold px-9 py-4 rounded-2xl text-base transition-colors w-full sm:w-auto text-center shadow-sm">
                Create Free Account
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Live Auctions */}
      <section id="live-auctions" className="px-4 sm:px-6 pt-4 pb-14 sm:pb-16 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <span className="w-2.5 h-2.5 rounded-full bg-[#09a7ad] animate-pulse shrink-0" />
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1a1916]">Live Auctions</h2>
          {activeAuctions.length > 0 && (
            <span className="text-[#8c8778] text-sm font-medium">({activeAuctions.length})</span>
          )}
        </div>
        {activeAuctions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {activeAuctions.map((auction) => {
              const raised = auction.items.reduce((sum, i) => sum + Number(i.currentBid), 0);
              const activeItems = auction.items.filter(i => i.status === "ACTIVE").length;
              return (
                <Link key={auction.id} href={`/${auction.organization.slug}/${auction.slug}`}
                  className="bg-white border border-[#e5e0d5] hover:border-[#09a7ad]/40 rounded-2xl p-6 transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)] group shadow-sm">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <div className="text-xs text-[#09a7ad] font-semibold mb-1.5 truncate">{auction.organization.name}</div>
                      <h3 className="font-bold text-base group-hover:text-[#09a7ad] transition-colors leading-snug text-[#1a1916]">{auction.title}</h3>
                    </div>
                    <span className="text-xs bg-[#09a7ad]/10 text-[#09a7ad] border border-[#09a7ad]/20 px-2.5 py-1 rounded-full shrink-0 font-bold whitespace-nowrap">Live</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#8c8778] mb-2">
                    <span>{activeItems} item{activeItems !== 1 ? "s" : ""}</span>
                    {raised > 0 && <span className="text-[#09a7ad] font-semibold">${raised.toLocaleString()} raised</span>}
                  </div>
                  <div className="text-xs text-[#b0a99a] mt-3 border-t border-[#f2efe8] pt-3">
                    Closes <LocalDate iso={auction.endAt.toISOString()} />
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-2xl border border-[#e5e0d5] shadow-sm">
            <div className="flex justify-center mb-4 text-[#b0a99a]"><IconCalendar /></div>
            <p className="text-base font-semibold mb-1 text-[#4a4640]">No live auctions right now</p>
            <p className="text-sm text-[#8c8778]">{upcomingAuctions.length > 0 ? "See what's coming up below." : "Check back soon — or explore organizations below."}</p>
          </div>
        )}
      </section>

      {/* Upcoming Auctions */}
      {upcomingAuctions.length > 0 && (
        <section className="px-4 sm:px-6 pb-14 sm:pb-16 max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <span className="text-[#8c8778]"><IconClock /></span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1a1916]">Coming Soon</h2>
            <span className="text-[#8c8778] text-sm font-medium">({upcomingAuctions.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {upcomingAuctions.map((auction) => (
              <Link key={auction.id} href={`/${auction.organization.slug}`}
                className="bg-white border border-[#e5e0d5] hover:border-[#d4cfc4] rounded-2xl p-6 transition-all group shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <div className="text-xs text-[#8c8778] font-semibold mb-1.5 truncate">{auction.organization.name}</div>
                    <h3 className="font-bold text-base leading-snug text-[#2c2a24]">{auction.title}</h3>
                  </div>
                  <span className="text-xs bg-[#f2efe8] text-[#8c8778] border border-[#e5e0d5] px-2.5 py-1 rounded-full shrink-0 font-semibold">Upcoming</span>
                </div>
                <div className="text-sm text-[#8c8778] mb-2">{auction._count.items} item{auction._count.items !== 1 ? "s" : ""}</div>
                <div className="text-xs text-[#09a7ad] font-medium mt-3 border-t border-[#f2efe8] pt-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#09a7ad]/60 inline-block" />
                  Opens <LocalDate iso={auction.startAt!.toISOString()} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Organizations */}
      {sortedOrgs.length > 0 && (
        <section className="px-4 sm:px-6 py-14 sm:py-16 max-w-6xl mx-auto border-t border-[#e5e0d5]/60">
          <div className="flex items-center gap-3 mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1a1916]">Browse by Organization</h2>
            <span className="text-[#8c8778] text-sm font-medium">({sortedOrgs.length})</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {sortedOrgs.map((org) => (
              <Link key={org.id} href={`/${org.slug}`}
                className="bg-white border border-[#e5e0d5] hover:border-[#d4cfc4] rounded-2xl p-5 transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] group shadow-sm">
                <div className="mb-3"><OrgLogo name={org.name} logoUrl={org.logoUrl} size="sm" /></div>
                <div className="font-semibold text-sm group-hover:text-[#09a7ad] transition-colors truncate leading-tight text-[#1a1916]">{org.name}</div>
                <div className="text-xs mt-1.5">
                  {org.auctions.length > 0
                    ? <span className="text-[#09a7ad] font-semibold">{org.auctions.length} live now</span>
                    : <span className="text-[#b0a99a]">{org._count.auctions} auction{org._count.auctions !== 1 ? "s" : ""}</span>
                  }
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="border-t border-[#e5e0d5]/60 bg-[#f5f1ea] px-4 sm:px-6 py-14 sm:py-16">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-[#8c8778] text-xs font-bold uppercase tracking-[0.18em] mb-10">How it works</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-10">
            {[
              { icon: <IconSearch />, title: "Find an auction", desc: "Browse live auctions and watch the countdown. When the timer hits zero, the highest bid wins." },
              { icon: <IconBid />, title: "Place your bid", desc: "Bid in real time or set a max bid — we auto-bid for you. Instant alerts when you are outbid." },
              { icon: <IconTrophy />, title: "Win & pick up", desc: "Win and your card is charged automatically. Arrange pickup with the organization." },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="w-12 h-12 bg-white border border-[#e5e0d5] rounded-2xl flex items-center justify-center text-[#09a7ad] shrink-0 shadow-sm">{icon}</div>
                <div>
                  <h3 className="font-bold text-[#1a1916] mb-1.5">{title}</h3>
                  <p className="text-[#6b6659] text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-[#8c8778]">
            <span className="flex items-center gap-2"><span className="text-[#09a7ad]"><IconBot /></span> Max bidding</span>
            <span className="flex items-center gap-2"><span className="text-[#09a7ad]"><IconBell /></span> Outbid alerts</span>
            <span className="flex items-center gap-2"><span className="text-[#09a7ad]"><IconClock /></span> Anti-sniping timer</span>
            <span className="flex items-center gap-2"><span className="text-[#09a7ad]"><IconShield /></span> Secure Stripe checkout</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#e5e0d5] bg-white px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4 text-sm text-[#8c8778]">
          <div className="flex items-center gap-1.5">
            <span>© {new Date().getFullYear()}</span>
            <a href="https://for-purpose.life" target="_blank" rel="noopener noreferrer" className="text-[#09a7ad] hover:underline font-medium">For Purpose Life</a>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/help" className="hover:text-[#1a1916] transition-colors">Help & Info</Link>
            <Link href="/terms" className="hover:text-[#1a1916] transition-colors">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-[#1a1916] transition-colors">Privacy Policy</Link>
            <a href="mailto:Ryan@for-purpose.com" className="hover:text-[#1a1916] transition-colors">Ryan@for-purpose.com</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
