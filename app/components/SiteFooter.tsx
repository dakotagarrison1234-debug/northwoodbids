"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PineMark, PineRidge } from "./Illustrations";

function Pin() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <path d="M12 21s-7-6.3-7-11a7 7 0 1 1 14 0c0 4.7-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Bid",
    links: [
      { href: "/auctions", label: "Auctions" },
      { href: "/search", label: "Search lots" },
      { href: "/watchlist", label: "Watchlist" },
      { href: "/dashboard", label: "My Bids" },
    ],
  },
  {
    heading: "Collect",
    links: [
      { href: "/pickup", label: "Pickup" },
      { href: "/refer", label: "Bid Bucks" },
      { href: "/giveaways", label: "Giveaways" },
      { href: "/help", label: "Help" },
    ],
  },
  {
    heading: "Fine print",
    links: [
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
];

const PICKUPS = [
  { town: "Owosso", note: "Shiawassee County" },
  { town: "Gladwin", note: "Gladwin County" },
];

/* Dark walnut plank footer with a pine ridge along the top edge. */
export default function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-[#2f2114] text-[#e7dcc6]">
      {/* Pine ridge sits on the cream page and hands off into the walnut panel. */}
      <div className="relative bg-[#f1e7d5]">
        <PineRidge className="nb-feather-x block w-full h-20 sm:h-28" />
      </div>

      {/* Weathered vertical plank grain */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 1px, transparent 1px, transparent 7px), repeating-linear-gradient(90deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 2px, transparent 2px, transparent 46px)",
        }}
      />
      {/* Warm lantern glow spilling from the top */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%]"
        style={{ background: "radial-gradient(120% 80% at 50% 0%, rgba(108,77,57,0.45), transparent 60%)" }}
      />

      <div className="relative safe-x max-w-6xl mx-auto px-6 pt-10 pb-8">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-x-6 gap-y-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-5">
            <Link href="/" className="nb-focus inline-flex items-center gap-2.5 rounded-lg">
              <PineMark className="w-7 h-7" />
              <span className="font-display font-extrabold text-xl text-white">Northwood Bids</span>
            </Link>
            <p className="mt-3 text-sm text-[#cdbda3] max-w-xs leading-relaxed">
              Brand-name overstock and returns, every lot from $2. Bid online, pick up in Owosso or Gladwin.
            </p>

            {/* Pickup locations */}
            <ul className="mt-5 grid grid-cols-2 gap-3 max-w-xs">
              {PICKUPS.map((p) => (
                <li key={p.town} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 font-semibold text-[#f1e7d5] text-sm">
                    <span className="text-[#f0a35a]"><Pin /></span>
                    {p.town}
                  </div>
                  <p className="text-[11px] text-[#b3a085] mt-0.5 pl-5">{p.note}, MI</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Link columns */}
          {COLUMNS.map((c) => (
            <div key={c.heading} className="md:col-span-2 md:col-start-auto">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#a08b6e] mb-3">{c.heading}</div>
              <ul className="space-y-2">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="nb-focus text-sm text-[#cdbda3] hover:text-white transition-colors rounded"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-9 pt-5 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#a08b6e]">
          <span>&copy; {new Date().getFullYear()} Northwood Bids. Mid-Michigan, born and raised.</span>
          <span className="text-[#8a7559]">Real bids, real pickup, no shipping games.</span>
        </div>
      </div>
    </footer>
  );
}

/* Site-wide footer wiring. Skipped where a page has its own footer (home),
   where a bottom bar or full-bleed flow owns the screen, and on staff tools. */
const NO_FOOTER = ["/", "/admin", "/superadmin", "/sign-in", "/sign-up", "/play", "/onboarding", "/invoice", "/register", "/join"];

export function GlobalFooter() {
  const pathname = usePathname() ?? "/";
  const hidden = NO_FOOTER.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p + "/")));
  if (hidden) return null;
  return <SiteFooter />;
}
