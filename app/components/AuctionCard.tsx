// One auction card, shared by the home page (live + upcoming) and the /auctions
// browse page, so every surface stays identical. Shows the 8 most-active lots
// with a live, always-ticking countdown — live auctions count down to close,
// upcoming ones to open. Each state gets its own colour: moss for live, leather
// for on-deck, tan for ended.
import Link from "next/link";
import AuctionCountdown from "./AuctionCountdown";
import AuctionPreviewThumbs, { type PreviewItem } from "./AuctionPreviewThumbs";
import OrgLogo from "./OrgLogo";
import { PineMark } from "./Illustrations";
import { IcoGavel, IcoMagnifier, IcoTrophy } from "./BidIcons";

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

type Mode = "live" | "upcoming" | "ended";

const STATE: Record<
  Mode,
  { strip: string; pill: string; label: string; cta: string; ctaText: string }
> = {
  live: {
    strip: "bg-[#4a7c59]",
    pill: "bg-[#e4f2e4] text-[#2f5d3a] border-[#4a7c59]/30",
    label: "Live",
    cta: "bg-[#6c4d39] group-hover:bg-[#563e2c] text-white shadow-[0_6px_16px_-8px_rgba(108,77,57,0.8)]",
    ctaText: "Bid now",
  },
  upcoming: {
    strip: "bg-[#6c4d39]",
    pill: "bg-[#efe3d0] text-[#6c4d39] border-[#6c4d39]/20",
    label: "On deck",
    cta: "bg-[#efe3d0] text-[#6c4d39] group-hover:bg-[#e7dcc6]",
    ctaText: "Preview the lots",
  },
  ended: {
    strip: "bg-[#cdbda3]",
    pill: "bg-[#f4efe4] text-[#8a7559] border-[#e3d6bf]",
    label: "Ended",
    cta: "bg-[#f4efe4] text-[#8a7559] group-hover:bg-[#efe3d0]",
    ctaText: "See results",
  },
};

export default function AuctionCard({
  auction,
  mode,
  showOrg = false,
}: {
  auction: AuctionCardData;
  mode: Mode;
  showOrg?: boolean;
}) {
  const s = STATE[mode];
  const isLive = mode === "live";
  const Icon = isLive ? IcoGavel : mode === "upcoming" ? IcoMagnifier : IcoTrophy;

  return (
    <Link
      href={`/${auction.org.slug}/${auction.slug}`}
      className="cv-card nb-lift group relative flex flex-col bg-white border border-[#e3d6bf] hover:border-[#6c4d39]/40 rounded-2xl overflow-hidden shadow-sm"
    >
      {/* colour strip — the state, readable from across the room */}
      <span aria-hidden className={`block h-1.5 w-full ${s.strip}`} />

      <div className="flex flex-col flex-1 p-4 sm:p-5">
        {/* ── Header row: state pill + live clock ── */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] px-2.5 py-1 rounded-full border whitespace-nowrap ${s.pill}`}
          >
            {isLive ? (
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#4a7c59] opacity-70 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4a7c59]" />
              </span>
            ) : (
              <PineMark className="w-3 h-3" />
            )}
            {s.label}
          </span>
          {mode !== "ended" && (
            <AuctionCountdown
              targetIso={isLive ? auction.endAtIso : auction.startAtIso}
              mode={isLive ? "ends" : "opens"}
            />
          )}
        </div>

        {/* ── Title + meta ── */}
        <div className="mt-3.5">
          {showOrg && (
            <div className="flex items-center gap-2 mb-1.5">
              <OrgLogo name={auction.org.name} logoUrl={auction.org.logoUrl} size="xs" />
              <span className="text-[11px] text-[#8a7559] font-bold uppercase tracking-wider truncate">
                {auction.org.name}
              </span>
            </div>
          )}
          <h3 className="font-display font-black text-lg sm:text-xl leading-tight tracking-tight text-[#241a12] group-hover:text-[#6c4d39] transition-colors break-words">
            {auction.title}
          </h3>
          <p className="mt-1 text-[13px] text-[#8a7559] font-semibold tabular-nums">
            {auction.itemCount} lot{auction.itemCount !== 1 ? "s" : ""}
            {isLive && <span className="text-[#cdbda3]"> &middot; </span>}
            {isLive && <span className="text-[#4a7c59]">bidding open</span>}
          </p>
        </div>

        {/* ── 8-lot preview grid ── */}
        <div className="mt-3.5">
          <AuctionPreviewThumbs items={auction.items} totalItems={auction.itemCount} />
        </div>

        {/* ── CTA ── */}
        <div className="mt-auto pt-3.5">
          <div
            className={`w-full inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-extrabold transition-colors ${s.cta}`}
          >
            <Icon className="w-4 h-4" />
            {s.ctaText}
            <svg
              className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </div>
        </div>
      </div>
    </Link>
  );
}
