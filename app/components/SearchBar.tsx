"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IcoMagnifier, IcoGavel } from "./BidIcons";
import { WoodenCrate } from "./Illustrations";

interface SearchItem {
  id: string;
  title: string;
  currentBid: number;
  organization: { name: string; slug: string };
  auction: { slug: string; title: string } | null;
  photos: { url: string }[];
}

interface SearchAuction {
  id: string;
  title: string;
  slug: string;
  organization: { name: string; slug: string };
  _count: { items: number };
}

interface SearchOrg {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  _count: { auctions: number };
  auctions: { id: string }[];
}

interface SearchResults {
  items: SearchItem[];
  auctions: SearchAuction[];
  orgs: SearchOrg[];
}

interface Props {
  defaultValue?: string;
  placeholder?: string;
  size?: "default" | "large";
}

export default function SearchBar({
  defaultValue = "",
  placeholder = "Search lots, auctions, brands",
  size = "default",
}: Props) {
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const router = useRouter();

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(null); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data: SearchResults = await res.json();
      setResults(data);
      setOpen(true);
    } catch {
      setResults(null);
      setOpen(false);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const hasResults = results && (results.items.length + results.auctions.length + results.orgs.length) > 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
    if (e.key === "Enter" && query.length >= 2) { setOpen(false); router.push(`/search?q=${encodeURIComponent(query)}`); }
  };

  const clearAndClose = () => { setOpen(false); setQuery(""); };

  const shared = "w-full bg-white border border-[#e3d6bf] text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 shadow-[0_1px_2px_rgba(60,40,25,0.06)] transition-[border-color,box-shadow]";
  const inputClass = size === "large"
    ? `${shared} rounded-2xl pl-12 pr-11 py-4 text-base`
    : `${shared} rounded-xl pl-11 pr-10 py-3 text-sm`;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <span className={`absolute top-1/2 -translate-y-1/2 text-[#8a7559] pointer-events-none ${size === "large" ? "left-4" : "left-3.5"}`}>
          <IcoMagnifier className={size === "large" ? "w-5 h-5" : "w-4 h-4"} />
        </span>
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          aria-label="Search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => hasResults && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={inputClass}
          autoComplete="off"
        />
        {loading && (
          <span
            aria-label="Searching"
            className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-[#6c4d39]/25 border-t-[#6c4d39] animate-spin"
          />
        )}
        {!loading && query && (
          <button
            type="button"
            onClick={() => { setQuery(""); setOpen(false); inputRef.current?.focus(); }}
            aria-label="Clear search"
            className="nb-focus absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[#8a7559] hover:text-[#241a12] hover:bg-[#efe3d0] transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        )}
      </div>

      {open && query.length >= 2 && (
        <div className="nb-search-in absolute top-full mt-2 w-full bg-white border border-[#e3d6bf] rounded-2xl shadow-[0_24px_48px_-20px_rgba(36,26,18,0.35)] z-50 overflow-hidden max-h-[70vh] overflow-y-auto">
          {hasResults ? (
            <>
              {results!.items.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-[10px] font-bold text-[#a08b6e] uppercase tracking-[0.12em] bg-[#fbf4e6] border-b border-[#e3d6bf]">Lots</div>
                  {results!.items.map(item => (
                    <Link key={item.id} href={`/${item.organization.slug}/${item.auction?.slug}/item/${item.id}`} onClick={clearAndClose}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-[#efe3d0] transition-colors">
                      {item.photos[0] ? (
                        <img src={item.photos[0].url} alt="" className="w-10 h-10 object-cover rounded-lg shrink-0"/>
                      ) : (
                        <div className="w-10 h-10 bg-[#efe3d0] rounded-lg shrink-0 flex items-center justify-center text-[#8a7559]">
                          <svg width="14" height="14" fill="none" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <rect x="1.5" y="2.5" width="11" height="9" rx="1.5"/>
                            <circle cx="7" cy="6.5" r="2"/>
                          </svg>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#241a12] truncate">{item.title}</div>
                        <div className="text-xs text-[#8a7559] truncate">{item.organization.name}</div>
                      </div>
                      <div className="text-[#6c4d39] text-sm font-semibold shrink-0">${(Number(item.currentBid) || 0).toLocaleString()}</div>
                    </Link>
                  ))}
                </div>
              )}

              {results!.auctions.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-[10px] font-bold text-[#a08b6e] uppercase tracking-[0.12em] bg-[#fbf4e6] border-y border-[#e3d6bf]">Live auctions</div>
                  {results!.auctions.map(auction => (
                    <Link key={auction.id} href={`/${auction.organization.slug}/${auction.slug}`} onClick={clearAndClose}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-[#efe3d0] transition-colors">
                      <div className="w-10 h-10 bg-[#6c4d39]/12 rounded-lg shrink-0 flex items-center justify-center text-[#6c4d39]">
                        <IcoGavel className="w-[18px] h-[18px]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#241a12] truncate">{auction.title}</div>
                        <div className="text-xs text-[#8a7559]">{auction.organization.name} &middot; {auction._count.items} lots</div>
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-[#5f7a45]/15 text-[#3f5226] px-2 py-0.5 rounded-full shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" aria-hidden="true" />Live</span>
                    </Link>
                  ))}
                </div>
              )}

              {results!.orgs.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-[10px] font-bold text-[#a08b6e] uppercase tracking-[0.12em] bg-[#fbf4e6] border-y border-[#e3d6bf]">Auction houses</div>
                  {results!.orgs.map(org => (
                    <Link key={org.id} href={`/${org.slug}`} onClick={clearAndClose}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-[#efe3d0] transition-colors">
                      {org.logoUrl ? (
                        <img src={org.logoUrl} alt={org.name} className="w-10 h-10 rounded-xl object-cover shrink-0"/>
                      ) : (
                        <div className="w-10 h-10 bg-[#6c4d39]/20 rounded-xl shrink-0 flex items-center justify-center text-[#6c4d39] font-bold text-base">
                          {org.name[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#241a12] truncate">{org.name}</div>
                        <div className="text-xs text-[#8a7559]">
                          {org.auctions.length > 0
                            ? <span className="text-[#3f5226] font-medium">{org.auctions.length} live now</span>
                            : `${org._count.auctions} auctions total`}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              <Link href={`/search?q=${encodeURIComponent(query)}`} onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-semibold text-[#6c4d39] hover:bg-[#efe3d0] bg-[#fbf4e6] border-t border-[#e3d6bf] transition-colors">
                All results for &ldquo;{query}&rdquo;
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
            </>
          ) : (
            !loading && (
              <div className="px-4 py-8 flex flex-col items-center text-center">
                <WoodenCrate className="w-20 h-16 mb-3" />
                <p className="text-[#241a12] text-sm font-semibold">Nothing live for &ldquo;{query}&rdquo;</p>
                <p className="text-[#8a7559] text-xs mt-1">Try a brand or a shorter word. New lots land every week.</p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
