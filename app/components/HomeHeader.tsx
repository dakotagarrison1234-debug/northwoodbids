"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import UserMenu from "./UserMenu";
import { IcoMagnifier } from "./BidIcons";

/* Primary routes shown in the desktop bar. On phones they live in the
   account drawer so the bar stays logo / search / account. */
const NAV: { href: string; label: string; match: string[] }[] = [
  { href: "/auctions", label: "Auctions", match: ["/auctions", "/search"] },
  { href: "/watchlist", label: "Watchlist", match: ["/watchlist"] },
  { href: "/dashboard", label: "My Bids", match: ["/dashboard", "/my-bids", "/invoice"] },
  { href: "/pickup", label: "Pickup", match: ["/pickup"] },
];

export default function HomeHeader() {
  // Search is "open" only for the route it was opened on, so navigating away
  // (from a result, a nav link, back button) closes it without an effect.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchOpen = openedOn !== null && openedOn === pathname;
  const setSearchOpen = (v: boolean) => setOpenedOn(v ? pathname ?? "/" : null);

  // Firm up the bar (solid cream + shadow) once the page has moved.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/superadmin") ||
    pathname?.startsWith("/sign-in") ||
    pathname?.startsWith("/sign-up") ||
    pathname?.startsWith("/play")
  ) {
    return null;
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQ.trim().length >= 2) {
      router.push(`/search?q=${encodeURIComponent(searchQ.trim())}`);
      setSearchOpen(false);
      setSearchQ("");
    }
  };

  const closeSearch = () => { setSearchOpen(false); setSearchQ(""); };
  const isActive = (m: string[]) => m.some((p) => pathname === p || pathname?.startsWith(p + "/"));

  return (
    <header
      className={`nb-header-pad safe-x sticky top-0 z-40 border-b border-[#e3d6bf] backdrop-blur-md transition-[box-shadow,background-color] duration-200 ${
        scrolled ? "bg-[#fbf4e6]/95 shadow-[0_6px_18px_-12px_rgba(60,40,25,0.45)]" : "bg-[#fbf4e6]/85"
      }`}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        {/* Logo */}
        <Link
          href="/"
          aria-label="Northwood Bids home"
          className={`nb-focus flex items-center shrink-0 transition-opacity hover:opacity-85 ${searchOpen ? "hidden sm:flex" : ""}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://assets.cdn.filesafe.space/U1S2bq3S7QBjnH50rEhn/media/6a380945f2131051b829edf3.png"
            alt="Northwood Bids"
            className="h-11 sm:h-12 w-auto max-w-[200px] sm:max-w-[220px] object-contain"
          />
        </Link>

        {searchOpen ? (
          <form onSubmit={handleSearch} className="nb-search-in flex-1 flex items-center gap-2 min-w-0">
            <label className="relative flex-1 min-w-0">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8a7559] pointer-events-none">
                <IcoMagnifier className="w-4 h-4" />
              </span>
              <input
                autoFocus
                type="search"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") closeSearch(); }}
                placeholder="Search lots, auctions, brands"
                aria-label="Search"
                enterKeyHint="search"
                className="w-full bg-white border border-[#e3d6bf] rounded-xl pl-10 pr-3 py-2 text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 text-sm transition-[border-color,box-shadow]"
              />
            </label>
            <button
              type="submit"
              className="nb-focus bg-[#6c4d39] hover:bg-[#563e2c] active:scale-[0.98] text-white px-4 py-2 rounded-xl text-sm font-semibold shrink-0 transition-[background-color,transform]"
            >
              Search
            </button>
            <button
              type="button"
              onClick={closeSearch}
              aria-label="Close search"
              className="nb-focus text-[#8a7559] hover:text-[#241a12] hover:bg-[#efe3d0] p-2 rounded-xl shrink-0 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </button>
          </form>
        ) : (
          <>
            {/* Desktop nav */}
            <nav aria-label="Primary" className="hidden md:flex items-center gap-0.5">
              {NAV.map((n) => {
                const active = isActive(n.match);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className="nb-nav nb-focus text-sm font-medium px-3 py-2 rounded-xl hover:bg-[#efe3d0]/70"
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>

            {/* Right cluster: search, help, account */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <button
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
                className="nb-focus group flex items-center gap-2 text-[#6f5b46] hover:text-[#241a12] p-2 sm:pl-3 sm:pr-3.5 rounded-xl hover:bg-[#efe3d0] active:scale-[0.97] transition-[background-color,color,transform]"
              >
                <IcoMagnifier className="w-[18px] h-[18px] transition-transform group-hover:-rotate-6" />
                <span className="hidden sm:inline text-sm">Search</span>
              </button>
              <Link
                href="/help"
                aria-current={pathname?.startsWith("/help") ? "page" : undefined}
                className="nb-nav nb-focus hidden sm:flex items-center text-sm px-3 py-2 rounded-xl hover:bg-[#efe3d0]/70 whitespace-nowrap"
              >
                Help
              </Link>
              <UserMenu />
            </div>
          </>
        )}
      </div>
    </header>
  );
}
