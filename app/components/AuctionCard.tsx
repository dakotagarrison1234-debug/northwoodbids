// One auction card, shared by the home page (live + upcoming) and the /auctions
// browse page, so all three stay identical. Shows the 8 most-active lots with live
// prices, and ALWAYS carries a ticking countdown regardless of how far out the date
// is — live auctions count down to close, upcoming ones to open.
import Link from "next/link";
import AuctionCountdown from "./AuctionCountdown";
import AuctionPreviewThumbs, { type PreviewItem } from "./AuctionPreviewThumbs";
import OrgLogo from "./OrgLogo";

export type AuctionCardData = {
  id: string;
  title: string;
  slug: string;
  status: string;
  startAtIso: string;
  endAtIso: string;
  itemCount: number;
  org: { name: string; slug: string; logoUrl: string | null };
  items: PreviewItem[];
};

export default function AuctionCard({
  auction,
  mode,
  showOrg = false,
}: {
  auction: AuctionCardData;
  mode: "live" | "upcoming";
  showOrg?: boolean;
}) {
  const isLive = mode === "live";

  return (
    <Link
      href={`/${auction.org.slug}/${auction.slug}`}
      className="cv-card group flex flex-col bg-white border border-[#e3d6bf] hover:border-[#6c4d39]/40 rounded-2xl p-4 sm:p-5 transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)] shadow-sm"
    >
      {/* ── Header row: status + live countdown, always present ── */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-bold whitespace-nowrap inline-flex items-center gap-1.5 ${
            isLive
              ? "bg-[#6c4d39]/10 text-[#6c4d39] border border-[#6c4d39]/20"
              : "bg-[#efe3d0] text-[#8a7559] border border-[#e3d6bf]"
          }`}
        >
          {isLive && <span className="w-1.5 h-1.5 rounded-full bg-[#6c4d39] animate-pulse inline-block" />}
          {isLive ? "Live" : "Upcoming"}
        </span>
        <AuctionCountdown
          targetIso={isLive ? auction.endAtIso : auction.startAtIso}
          mode={isLive ? "ends" : "opens"}
        />
      </div>

      {/* ── Title + optional org ── */}
      <div className="mt-3">
        {showOrg && (
          <div className="flex items-center gap-2 mb-1.5">
            <OrgLogo name={auction.org.name} logoUrl={auction.org.logoUrl} size="sm" />
            <span className="text-xs text-[#6c4d39] font-semibold truncate">{auction.org.name}</span>
          </div>
        )}
        <h3 className="font-bold text-base sm:text-lg leading-snug text-[#241a12] group-hover:text-[#6c4d39] transition-colors break-words">
          {auction.title}
        </h3>
        <p className="text-sm text-[#8a7559] mt-0.5">
          {auction.itemCount} item{auction.itemCount !== 1 ? "s" : ""}
        </p>
      </div>

      {/* ── 8-item preview grid ── */}
      <div className="mt-3">
        <AuctionPreviewThumbs items={auction.items} totalItems={auction.itemCount} />
      </div>

      {/* ── CTA row ── */}
      <div className="mt-auto pt-3">
        <div
          className={`w-full text-center rounded-xl py-2.5 text-sm font-bold transition-colors ${
            isLive
              ? "bg-[#6c4d39] group-hover:bg-[#563e2c] text-white"
              : "bg-[#efe3d0] text-[#6c4d39] group-hover:bg-[#e7dcc6]"
          }`}
        >
          {isLive ? "Bid now →" : "Preview lots →"}
        </div>
      </div>
    </Link>
  );
}
