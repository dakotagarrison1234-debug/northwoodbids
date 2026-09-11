export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import SearchBar from "@/app/components/SearchBar";
import LocalDate from "@/app/components/LocalDate";
import OrgLogo from "@/app/components/OrgLogo";
import ItemCardTimer from "@/app/components/ItemCardTimer";
import { WoodenCrate, BranchDivider, PineMark } from "@/app/components/Illustrations";
import { IcoMagnifier, BidCritter } from "@/app/components/BidIcons";

// Small uppercase group label with a count chip — one per result type.
function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2.5 mb-3.5">
      <h2 className="font-display text-lg font-black tracking-tight text-[#241a12]">{label}</h2>
      <span className="inline-flex items-center rounded-full bg-[#6c4d39] text-white text-[11px] font-black px-2 py-0.5 tabular-nums">
        {count}
      </span>
      <span aria-hidden className="flex-1 h-px bg-[#e3d6bf]" />
    </div>
  );
}

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = "" } = await searchParams;
  const query = q.trim();

  if (query.length < 2) {
    return (
      <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
        <div className="max-w-2xl mx-auto px-6 sm:px-8 py-14 sm:py-20 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#6c4d39] text-[#f6ecda] shadow-[0_8px_20px_-10px_rgba(108,77,57,0.9)] mb-5">
            <IcoMagnifier className="w-7 h-7" />
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight leading-[0.95] mb-2">
            What are you after?
          </h1>
          <p className="text-[#6f5b46] text-sm mb-7">Search live lots by name, brand or category.</p>
          <SearchBar size="large" />
          <p className="text-[#8a7559] text-xs mt-4">Type at least two characters.</p>
          <BranchDivider className="w-48 h-5 mx-auto mt-12 opacity-80" />
        </div>
      </main>
    );
  }

  const [items, auctions, orgs] = await Promise.all([
    prisma.item.findMany({
      where: {
        status: "ACTIVE",
        auction: { status: "OPEN", archived: false },
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { category: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { donorName: { contains: query, mode: "insensitive" } },
        ],
      },
      include: {
        organization: { select: { name: true, slug: true } },
        auction: { select: { slug: true, title: true, endAt: true, status: true } },
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
        auctions: { where: { status: "OPEN", archived: false }, select: { id: true } },
      },
    }),
  ]);

  const total = items.length + auctions.length + orgs.length;

  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      <div className="max-w-4xl mx-auto px-6 sm:px-8 py-6 sm:py-10">
        {/* Search bar pre-filled */}
        <div className="mb-6">
          <SearchBar defaultValue={query} size="large" />
        </div>

        {/* Results headline */}
        <div className="mb-8">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#6c4d39]">
            <PineMark className="w-3.5 h-3.5" /> Search results
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-black tracking-tight leading-tight mt-1 break-words">
            {total === 0 ? (
              <>Nothing on the floor for &ldquo;{query}&rdquo;</>
            ) : (
              <>
                <span className="tabular-nums">{total}</span> {total === 1 ? "match" : "matches"} for &ldquo;{query}&rdquo;
              </>
            )}
          </h1>
          {total > 0 && (
            <p className="text-sm text-[#6f5b46] mt-1">Only lots in live auctions show up here. Highest bids first.</p>
          )}
        </div>

        {/* Lots */}
        {items.length > 0 && (
          <section className="mb-10">
            <GroupHeader label="Lots" count={items.length} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map(item => (
                <Link
                  key={item.id}
                  href={`/${item.organization.slug}/${item.auction?.slug}/item/${item.id}`}
                  className="nb-lift bg-white border border-[#e3d6bf] hover:border-[#6c4d39]/40 rounded-2xl p-3 flex items-center gap-3.5 group"
                >
                  <div className="w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-[#faf5ea] ring-1 ring-[#efe0c9] flex items-center justify-center">
                    {item.photos[0] ? (
                      <img
                        src={item.photos[0].url}
                        alt={item.title}
                        className="w-full h-full object-contain p-1"
                      />
                    ) : (
                      <WoodenCrate className="w-10 h-9 opacity-70" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm leading-snug line-clamp-2 group-hover:text-[#6c4d39] transition-colors">
                      {item.title}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-[#8a7559]">
                      <span className="truncate">{item.auction?.title ?? item.organization.name}</span>
                      {item.auction &&
                      item.status === "ACTIVE" &&
                      (item.auction.status === "OPEN" || item.auction.status === "CLOSING") ? (
                        <ItemCardTimer
                          itemId={item.id}
                          endAt={new Date(item.itemEndAt ?? item.auction.endAt).toISOString()}
                          inline
                        />
                      ) : item.auction?.endAt ? (
                        <span className="shrink-0">
                          Closes <LocalDate iso={new Date(item.auction.endAt).toISOString()} />
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right shrink-0 leading-none">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-[#8a7559]">
                      {Number(item.currentBid) > 0 ? "Current bid" : "Starts at"}
                    </div>
                    <div className="font-display font-black text-lg text-[#6c4d39] tabular-nums mt-0.5">
                      ${(Number(item.currentBid) > 0 ? Number(item.currentBid) : Number(item.startingBid) || 0).toLocaleString()}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Auctions */}
        {auctions.length > 0 && (
          <section className="mb-10">
            <GroupHeader label="Live auctions" count={auctions.length} />
            <div className="space-y-2.5">
              {auctions.map(auction => {
                return (
                  <Link
                    key={auction.id}
                    href={`/${auction.organization.slug}/${auction.slug}`}
                    className="nb-lift bg-white border border-[#e3d6bf] hover:border-[#6c4d39]/40 rounded-2xl p-4 flex items-center justify-between gap-4 group"
                  >
                    <div className="min-w-0">
                      <div className="font-display font-black text-base tracking-tight truncate group-hover:text-[#6c4d39] transition-colors">
                        {auction.title}
                      </div>
                      <div className="text-xs text-[#8a7559] mt-0.5 tabular-nums">
                        {auction.organization.name} &middot; {auction.items.length} lot{auction.items.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] bg-[#e4f2e4] text-[#2f5d3a] border border-[#4a7c59]/30 px-2.5 py-1 rounded-full shrink-0">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-[#4a7c59] opacity-70 animate-ping" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4a7c59]" />
                      </span>
                      Live
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Businesses */}
        {orgs.length > 0 && (
          <section className="mb-10">
            <GroupHeader label="Auction houses" count={orgs.length} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {orgs.map(org => (
                <Link
                  key={org.id}
                  href={`/${org.slug}`}
                  className="nb-lift bg-white border border-[#e3d6bf] hover:border-[#6c4d39]/40 rounded-2xl p-4 group"
                >
                  <div className="mb-3">
                    <OrgLogo name={org.name} logoUrl={org.logoUrl} size="sm" />
                  </div>
                  <div className="font-semibold text-sm truncate group-hover:text-[#6c4d39] transition-colors">
                    {org.name}
                  </div>
                  <div className="text-xs text-[#8a7559] mt-1 tabular-nums">
                    {org.auctions.length > 0
                      ? <span className="text-[#2f5d3a] font-bold">{org.auctions.length} live now</span>
                      : `${org._count.auctions} auction${org._count.auctions !== 1 ? "s" : ""}`
                    }
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {total === 0 && (
          <div className="text-center py-14 px-6 rounded-2xl border border-dashed border-[#cdbda3] bg-[#fbf4e6]/80">
            <BidCritter className="nb-float w-20 h-20 mx-auto mb-4" />
            <p className="font-display text-2xl font-black tracking-tight text-[#241a12] mb-1.5">Came up empty</p>
            <p className="text-[#6f5b46] text-sm max-w-sm mx-auto leading-relaxed">
              Only lots in live auctions are searchable. Try a brand name, a shorter word, or browse the whole floor.
            </p>
            <Link
              href="/auctions"
              className="inline-flex items-center gap-2 mt-6 rounded-xl bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold text-sm px-6 py-3 transition-colors"
            >
              Browse live auctions
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
