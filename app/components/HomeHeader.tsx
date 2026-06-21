"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import UserMenu from "./UserMenu";

export default function HomeHeader() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const router = useRouter();
  const pathname = usePathname();

  if (
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/sign-in") ||
    pathname?.startsWith("/sign-up")
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

  return (
    <header className="border-b border-[#e5e0d5] px-4 sm:px-6 py-4 flex items-center justify-between gap-3 bg-white/95 backdrop-blur-md sticky top-0 z-40 shadow-sm">
      <Link href="/" className="flex items-center shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://assets.cdn.filesafe.space/TwuL7EwKfW8oGIV0Zo5q/media/6a373b261c5d711b35bf4e56.png"
          alt="Northwood Bids"
          className="h-12 w-auto max-w-[220px] object-contain"
        />
      </Link>

      {searchOpen ? (
        <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2">
          <input
            autoFocus
            type="text"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search items, auctions, businesses…"
            className="flex-1 bg-[#f2efe8] border border-[#e5e0d5] rounded-xl px-4 py-2 text-[#1a1916] placeholder-[#b0a99a] focus:outline-none focus:border-[#09a7ad]/60 text-sm transition-colors"
          />
          <button type="submit" className="bg-[#09a7ad] hover:bg-[#0898a0] text-white px-4 py-2 rounded-xl text-sm font-semibold shrink-0 transition-colors">
            Search
          </button>
          <button type="button" onClick={() => { setSearchOpen(false); setSearchQ(""); }}
            className="text-[#8c8778] hover:text-[#4a4640] text-xl px-1 shrink-0 leading-none transition-colors">
            ×
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button onClick={() => setSearchOpen(true)}
            className="text-[#6b6659] hover:text-[#1a1916] p-2 rounded-xl hover:bg-[#f2efe8] transition-colors" aria-label="Search">
            <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          </button>
          <Link href="/help"
            className="hidden sm:flex items-center gap-1.5 text-[#6b6659] hover:text-[#1a1916] text-sm px-3 py-1.5 rounded-xl hover:bg-[#f2efe8] transition-colors whitespace-nowrap"
            aria-label="Help">
            <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".5" fill="currentColor"/>
            </svg>
            Help
          </Link>
          <UserMenu />
        </div>
      )}
    </header>
  );
}
