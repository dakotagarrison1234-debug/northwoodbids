export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import HomeHeader from "@/app/components/HomeHeader";
import LocalDate from "@/app/components/LocalDate";
import OrgLogo from "@/app/components/OrgLogo";
import PusherRefresh from "@/app/components/PusherRefresh";

function IcoCalendar() {
  return (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

export default async function AuctionsPage() {
  const auctions = await prisma.auction.findMany({
    where: { status: "OPEN" },
    include: {
      organization: { select: { id: true, name: true, slug: true, logoUrl: true } },
      items: { select: { currentBid: true, status: true } },
    },
    orderBy: { endAt: "asc" },
  });

  return (
    <main className="min-h-screen bg-[#faf8f4] text-[#1a1916]">
      <PusherRefresh channel="auctions" event="auction-updated" />
      <HomeHeader />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-8">
          <span className="w-2.5 h-2.5 rounded-full bg-[#09a7ad] animate-pulse inline-block shrink-0" />
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Live Auctions</h1>
          {auctions.length > 0 && (
            <span className="text-[#8c8778] text-base ml-1">({auctions.length})</span>
          )}
        </div>

        {auctions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {auctions.map((auction) => {
              const raised = auction.items.reduce((sum, i) => sum + Number(i.currentBid), 0);
              const activeItems = auction.items.filter((i) => i.status === "ACTIVE").length;
              return (
                <Link
                  key={auction.id}
                  href={`/${auction.organization.slug}/${auction.slug}`}
                  className="bg-white border border-[#e5e0d5] hover:border-[#09a7ad]/40 rounded-2xl p-5 transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] group flex flex-col gap-3"
                >
                  {/* Org + live badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <OrgLogo name={auction.organization.name} logoUrl={auction.organization.logoUrl} size="sm" />
                      <span className="text-xs text-[#09a7ad] font-semibold truncate">
                        {auction.organization.name}
                      </span>
                    </div>
                    <span className="text-xs bg-[#09a7ad]/15 text-[#09a7ad] border border-[#09a7ad]/20 px-2 py-0.5 rounded-full shrink-0 font-semibold">
                      Live
                    </span>
                  </div>

                  {/* Auction title */}
                  <h2 className="font-bold text-base group-hover:text-[#09a7ad] transition-colors leading-snug">
                    {auction.title}
                  </h2>

                  {/* Stats */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="text-[#8c8778]">{activeItems} item{activeItems !== 1 ? "s" : ""}</span>
                    {raised > 0 && (
                      <span className="text-[#09a7ad] font-semibold">${raised.toLocaleString()} raised</span>
                    )}
                  </div>

                  {/* End time */}
                  <div className="text-xs text-[#8c8778] border-t border-[#e5e0d5] pt-2 mt-auto">
                    Closes <LocalDate iso={auction.endAt.toISOString()} />
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-20 bg-[#faf8f4]/60 rounded-2xl border border-[#e5e0d5]">
            <div className="flex justify-center mb-4 text-[#b0a99a]">
              <IcoCalendar />
            </div>
            <p className="text-base font-semibold mb-1 text-[#6b6659]">No live auctions right now</p>
            <p className="text-sm text-[#8c8778] mb-6">Check back soon — new auctions are added regularly.</p>
            <Link href="/" className="text-[#09a7ad] hover:text-[#0bbcc2] text-sm font-medium transition-colors">
              Go to home page
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
