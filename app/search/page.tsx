export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import HomeHeader from "@/app/components/HomeHeader";
import SearchBar from "@/app/components/SearchBar";
import LocalDate from "@/app/components/LocalDate";
import OrgLogo from "@/app/components/OrgLogo";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = "" } = await searchParams;
  const query = q.trim();

  if (query.length < 2) {
    return (
      <main className="min-h-screen bg-[#faf8f4] text-[#1a1916]">
        <HomeHeader />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="flex justify-center mb-6 text-[#b0a99a]">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 48 48" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
              <circle cx="22" cy="22" r="14" />
              <path d="m40 40-8-8" />
            </svg>
          </div>
          <SearchBar size="large" />
          <p className="text-[#8c8778] text-sm mt-5">Type at least 2 characters to search</p>
        </div>
      </main>
    );
  }

  const [items, auctions, orgs] = await Promise.all([
    prisma.item.findMany({
      where: {
        status: "ACTIVE",
        auction: { status: "OPEN" },
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { category: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { donorName: { contains: query, mode: "insensitive" } },
        ],
      },
      include: {
        organization: { select: { name: true, slug: true } },
        auction: { select: { slug: true, title: true, endAt: true } },
        photos: { take: 1, orderBy: { isPrimary: "desc" } },
      },
      orderBy: { currentBid: "desc" },
    }),
    prisma.auction.findMany({
      where: {
        status: "OPEN",
        title: { contains: query, mode: "insensitive" },
      },
      include: {
        organization: { select: { name: true, slug: true } },
        items: { select: { currentBid: true } },
      },
    }),
    prisma.organization.findMany({
      where: { isActive: true, name: { contains: query, mode: "insensitive" } },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        _count: { select: { auctions: true } },
        auctions: { where: { status: "OPEN" }, select: { id: true } },
      },
    }),
  ]);

  const total = items.length + auctions.length + orgs.length;

  return (
    <main className="min-h-screen bg-[#faf8f4] text-[#1a1916]">
      <HomeHeader />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Search bar pre-filled */}
        <div className="mb-6">
          <SearchBar defaultValue={query} size="large" />
        </div>

        <p className="text-[#8c8778] text-sm mb-8">
          {total === 0
            ? <>No results for <span className="text-[#1a1916] font-semibold">&ldquo;{query}&rdquo;</span></>
            : <>{total} result{total !== 1 ? "s" : ""} for <span className="text-[#1a1916] font-semibold">&ldquo;{query}&rdquo;</span></>
          }
        </p>

        {/* Items */}
        {items.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs font-bold text-[#8c8778] uppercase tracking-[0.12em] mb-4">
              Items ({items.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map(item => (
                <Link
                  key={item.id}
                  href={`/${item.organization.slug}/${item.auction?.slug}/item/${item.id}`}
                  className="bg-white border border-[#e5e0d5] hover:border-[#09a7ad]/40 rounded-2xl p-4 flex items-center gap-4 transition-all hover:shadow-[0_0_20px_rgba(9,167,173,0.05)] group"
                >
                  {item.photos[0] ? (
                    <img
                      src={item.photos[0].url}
                      alt={item.title}
                      className="w-14 h-14 object-cover rounded-xl shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 bg-[#f2efe8] rounded-xl shrink-0 flex items-center justify-center text-[#8c8778]">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.5}>
                        <rect x="2" y="2" width="16" height="16" rx="2.5" />
                        <circle cx="7" cy="7" r="2" />
                        <path d="m18 13-4-4L4 18" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate group-hover:text-[#09a7ad] transition-colors text-sm">
                      {item.title}
                    </div>
                    <div className="text-xs text-[#8c8778] mt-0.5">{item.organization.name}</div>
                    {item.auction?.endAt && (
                      <div className="text-xs text-[#8c8778] mt-0.5">
                        Closes <LocalDate iso={new Date(item.auction.endAt).toISOString()} />
                      </div>
                    )}
                  </div>
                  <div className="text-[#09a7ad] font-extrabold text-lg shrink-0">
                    ${(Number(item.currentBid) || 0).toLocaleString()}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Auctions */}
        {auctions.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs font-bold text-[#8c8778] uppercase tracking-[0.12em] mb-4">
              Live Auctions ({auctions.length})
            </h2>
            <div className="space-y-2.5">
              {auctions.map(auction => {
                const raised = auction.items.reduce((sum, i) => sum + Number(i.currentBid), 0);
                return (
                  <Link
                    key={auction.id}
                    href={`/${auction.organization.slug}/${auction.slug}`}
                    className="bg-white border border-[#e5e0d5] hover:border-[#09a7ad]/40 rounded-2xl p-4 flex items-center justify-between gap-4 transition-all hover:shadow-[0_0_20px_rgba(9,167,173,0.05)] group"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold truncate group-hover:text-[#09a7ad] transition-colors">
                        {auction.title}
                      </div>
                      <div className="text-xs text-[#8c8778] mt-0.5">
                        {auction.organization.name} · {auction.items.length} items · ${raised.toLocaleString()} raised
                      </div>
                    </div>
                    <span className="text-xs bg-[#09a7ad]/15 text-[#09a7ad] border border-[#09a7ad]/20 px-2 py-0.5 rounded-full shrink-0 font-semibold">
                      Live
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Organizations */}
        {orgs.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs font-bold text-[#8c8778] uppercase tracking-[0.12em] mb-4">
              Organizations ({orgs.length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {orgs.map(org => (
                <Link
                  key={org.id}
                  href={`/${org.slug}`}
                  className="bg-white border border-[#e5e0d5] hover:border-[#d4cfc4] rounded-2xl p-4 transition-all group"
                >
                  <div className="mb-3">
                    <OrgLogo name={org.name} logoUrl={org.logoUrl} size="sm" />
                  </div>
                  <div className="font-semibold text-sm truncate group-hover:text-[#09a7ad] transition-colors">
                    {org.name}
                  </div>
                  <div className="text-xs text-[#8c8778] mt-1">
                    {org.auctions.length > 0
                      ? <span className="text-[#09a7ad] font-medium">{org.auctions.length} live now</span>
                      : `${org._count.auctions} auction${org._count.auctions !== 1 ? "s" : ""}`
                    }
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {total === 0 && (
          <div className="text-center py-16">
            <div className="flex justify-center mb-4 text-[#b0a99a]">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 40 40" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round">
                <circle cx="18" cy="18" r="12" />
                <path d="m34 34-7-7" />
                <path d="M18 13v5M18 21v2" />
              </svg>
            </div>
            <p className="text-[#8c8778] font-semibold mb-2">No results found</p>
            <p className="text-[#8c8778] text-sm mb-4">
              Only active items in live auctions appear in search.
            </p>
            <Link href="/" className="text-[#09a7ad] hover:text-[#0bbcc2] text-sm transition-colors">
              Browse all live auctions
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
