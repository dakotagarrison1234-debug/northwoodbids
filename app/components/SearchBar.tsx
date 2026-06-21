"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  placeholder = "Search items, auctions, businesses…",
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

  const inputClass = size === "large"
    ? "w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl pl-12 pr-4 py-4 text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39] text-base"
    : "w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl pl-11 pr-4 py-3 text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39] text-sm";

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8a7559] pointer-events-none">
          <svg width="16" height="16" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7" cy="7" r="4.5"/>
            <path d="M10.5 10.5 13 13"/>
          </svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => hasResults && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={inputClass}
          autoComplete="off"
        />
        {loading && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8a7559] text-xs animate-pulse">searching…</span>
        )}
        {!loading && query && (
          <button onClick={() => { setQuery(""); setOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a7559] hover:text-[#6f5b46] text-lg leading-none">
            ×
          </button>
        )}
      </div>

      {open && query.length >= 2 && (
        <div className="absolute top-full mt-2 w-full bg-white border border-[#cdbda3] rounded-xl shadow-2xl z-50 overflow-hidden max-h-[70vh] overflow-y-auto">
          {hasResults ? (
            <>
              {results!.items.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-[#8a7559] uppercase tracking-wider border-b border-[#e3d6bf]">Items</div>
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
                  <div className="px-4 py-2 text-xs font-semibold text-[#8a7559] uppercase tracking-wider border-b border-[#e3d6bf] border-t border-t-[#e3d6bf]">Live Auctions</div>
                  {results!.auctions.map(auction => (
                    <Link key={auction.id} href={`/${auction.organization.slug}/${auction.slug}`} onClick={clearAndClose}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-[#efe3d0] transition-colors">
                      <div className="w-10 h-10 bg-[#6c4d39]/20 rounded-lg shrink-0 flex items-center justify-center text-[#6c4d39]">
                        <svg width="16" height="16" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="8" cy="8" r="6"/><path d="M8 5v3.5l2 1.5"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#241a12] truncate">{auction.title}</div>
                        <div className="text-xs text-[#8a7559]">{auction.organization.name} · {auction._count.items} items</div>
                      </div>
                      <span className="text-xs bg-[#6c4d39]/20 text-[#6c4d39] px-2 py-0.5 rounded-full shrink-0">Live</span>
                    </Link>
                  ))}
                </div>
              )}

              {results!.orgs.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-[#8a7559] uppercase tracking-wider border-b border-[#e3d6bf] border-t border-t-[#e3d6bf]">Businesses</div>
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
                            ? <span className="text-[#6c4d39]">{org.auctions.length} live now</span>
                            : `${org._count.auctions} auctions total`}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              <Link href={`/search?q=${encodeURIComponent(query)}`} onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1 px-4 py-3 text-sm text-[#6c4d39] hover:bg-[#efe3d0] border-t border-[#e3d6bf] transition-colors">
                See all results for &ldquo;{query}&rdquo; →
              </Link>
            </>
          ) : (
            !loading && (
              <div className="px-4 py-8 text-center">
                <p className="text-[#8a7559] text-sm">No active items or live auctions found for &ldquo;{query}&rdquo;</p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
