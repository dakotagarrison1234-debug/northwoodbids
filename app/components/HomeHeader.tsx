"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import UserMenu from "./UserMenu";
import { IcoMagnifier, IcoGavel, IcoTrophy, IcoStar, IcoTruck } from "./BidIcons";
import { LogoPumpkin } from "./Halloween";

/**
 * Site header. Built to be easy to read and easy to hit:
 *  - Desktop: bold 16px links with icons, the current page as a filled pill,
 *    a labeled Search and Help, and the account button with the person's name.
 *  - Phones: logo + Menu up top, and a tab row of the four places people go
 *    (Auctions, Search, My Bids, Pickup). The tab row tucks away while you
 *    scroll down and comes back the moment you scroll up.
 */
type NavItem = { href: string; label: string; match: string[]; icon: (cls: string) => React.ReactNode };

const NAV: NavItem[] = [
  { href: "/auctions", label: "Auctions", match: ["/auctions"], icon: (c) => <IcoGavel className={c} /> },
  { href: "/dashboard", label: "My Bids", match: ["/dashboard", "/my-bids", "/invoice"], icon: (c) => <IcoTrophy className={c} /> },
  { href: "/watchlist", label: "Watchlist", match: ["/watchlist"], icon: (c) => <IcoStar className={c} filled /> },
  { href: "/pickup", label: "Pickup", match: ["/pickup"], icon: (c) => <IcoTruck className={c} /> },
];

const PHONE_TABS: NavItem[] = [
  NAV[0],
  { href: "/search", label: "Search", match: ["/search"], icon: (c) => <IcoMagnifier className={c} /> },
  NAV[1],
  NAV[3],
];

export default function HomeHeader() {
  // Desktop search is "open" only for the route it was opened on, so navigating
  // away closes it without an effect.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [tabsHidden, setTabsHidden] = useState(false);
  const lastY = useRef(0);
  const router = useRouter();
  const pathname = usePathname();
  const searchOpen = openedOn !== null && openedOn === pathname;
  const setSearchOpen = (v: boolean) => setOpenedOn(v ? pathname ?? "/" : null);

  // Firm up the bar once the page moves; tuck the phone tab row away while
  // scrolling down, bring it back on any scroll up.
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 8);
      const dy = y - lastY.current;
      if (y < 80) setTabsHidden(false);
      else if (dy > 6) setTabsHidden(true);
      else if (dy < -6) setTabsHidden(false);
      lastY.current = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/superadmin") ||
    pathname?.startsWith("/sign-in") ||
    pathname?.startsWith("/sign-up") ||
    pathname?.startsWith("/play") ||
    pathname?.startsWith("/print")
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
      className={`nb-site-header safe-x sticky top-0 z-40 backdrop-blur-md transition-[box-shadow,background-color] duration-200 ${
        scrolled ? "bg-[#fbf4e6]/97 shadow-[0_8px_22px_-14px_rgba(60,40,25,0.55)]" : "bg-[#fbf4e6]/92"
      }`}
    >
      {/* ── Main row ── */}
      <div className="nb-header-pad px-3 sm:px-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <Link
            href="/"
            aria-label="Northwood Bids home"
            className={`nb-focus relative flex items-center shrink-0 transition-opacity hover:opacity-85 ${searchOpen ? "hidden md:flex" : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://assets.cdn.filesafe.space/U1S2bq3S7QBjnH50rEhn/media/6a380945f2131051b829edf3.png"
              alt="Northwood Bids"
              className="nb-logo-img h-10 sm:h-12 w-auto max-w-[40vw] sm:max-w-[220px] object-contain"
            />
            <LogoPumpkin />
          </Link>

          {searchOpen ? (
            <form onSubmit={handleSearch} className="nb-search-in flex-1 flex items-center gap-2 min-w-0 max-w-2xl">
              <label className="relative flex-1 min-w-0">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8a7559] pointer-events-none">
                  <IcoMagnifier className="w-5 h-5" />
                </span>
                <input
                  autoFocus
                  type="search"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") closeSearch(); }}
                  placeholder="Search lots and brands"
                  aria-label="Search"
                  enterKeyHint="search"
                  className="w-full h-12 bg-white border-2 border-[#e3d6bf] rounded-full pl-12 pr-4 text-[17px] text-[#241a12] placeholder-[#a3927b] focus:outline-none focus:border-[#6c4d39] transition-colors"
                />
              </label>
              <button
                type="submit"
                className="nb-focus h-12 px-6 rounded-full bg-[#6c4d39] hover:bg-[#563e2c] active:scale-[0.98] text-white text-[16px] font-bold shrink-0 transition-[background-color,transform]"
              >
                Search
              </button>
              <button
                type="button"
                onClick={closeSearch}
                aria-label="Close search"
                className="nb-focus w-12 h-12 grid place-items-center text-[#6f5b46] hover:text-[#241a12] hover:bg-[#efe3d0] rounded-full shrink-0 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
              </button>
            </form>
          ) : (
            <>
              {/* Desktop links */}
              <nav aria-label="Primary" className="hidden md:flex items-center gap-1 lg:gap-1.5">
                {NAV.map((n) => {
                  const active = isActive(n.match);
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      aria-current={active ? "page" : undefined}
                      className={`nb-focus inline-flex items-center gap-2 h-11 px-3.5 lg:px-4 rounded-full text-[16px] font-bold transition-colors ${
                        active
                          ? "bg-[#6c4d39] text-[#fbf4e6] shadow-[0_6px_16px_-8px_rgba(108,77,57,0.8)]"
                          : "text-[#4a3a2b] hover:bg-[#efe3d0] hover:text-[#241a12]"
                      }`}
                    >
                      {n.icon(`w-5 h-5 ${active ? "text-[#f0a35a]" : "text-[#8a6a4c]"}`)}
                      {n.label}
                    </Link>
                  );
                })}
              </nav>

              {/* Right: search, help, account */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  onClick={() => setSearchOpen(true)}
                  aria-label="Search"
                  className="nb-focus hidden md:inline-flex items-center gap-2 h-11 px-4 rounded-full border-2 border-[#e3d6bf] bg-white text-[#4a3a2b] hover:border-[#c9b391] hover:text-[#241a12] text-[16px] font-bold transition-colors"
                >
                  <IcoMagnifier className="w-5 h-5 text-[#8a6a4c]" />
                  <span className="hidden lg:inline">Search</span>
                </button>
                <Link
                  href="/help"
                  aria-current={pathname?.startsWith("/help") ? "page" : undefined}
                  className={`nb-focus hidden md:inline-flex items-center h-11 px-3.5 rounded-full text-[16px] font-bold transition-colors ${
                    pathname?.startsWith("/help") ? "bg-[#efe3d0] text-[#241a12]" : "text-[#4a3a2b] hover:bg-[#efe3d0]"
                  }`}
                >
                  Help
                </Link>
                <UserMenu />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Phone tab row: the four places people go ── */}
      <nav
        aria-label="Main"
        className={`md:hidden overflow-hidden transition-[max-height,opacity] duration-200 ${tabsHidden && !searchOpen ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}
      >
        <div className="grid grid-cols-4 px-1.5 pb-1.5">
          {PHONE_TABS.map((t) => {
            const active = isActive(t.match);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`nb-focus relative flex flex-col items-center justify-center gap-1 min-h-[56px] rounded-2xl mx-0.5 transition-colors ${
                  active ? "bg-[#6c4d39] text-[#fbf4e6]" : "text-[#4a3a2b] active:bg-[#efe3d0]"
                }`}
              >
                {t.icon(`w-6 h-6 ${active ? "text-[#f0a35a]" : "text-[#8a6a4c]"}`)}
                <span className="text-[14px] font-bold leading-none">{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Brand accent line */}
      <div aria-hidden className="h-[3px] bg-gradient-to-r from-[#6c4d39] via-[#c47b3e] to-[#4a7c59]" />
    </header>
  );
}
