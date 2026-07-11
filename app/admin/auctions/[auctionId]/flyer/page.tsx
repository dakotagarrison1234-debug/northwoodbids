export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserOrg } from "@/lib/auth";
import DownloadFlyerButton from "./DownloadFlyerButton";

const LOGO_URL =
  "https://assets.cdn.filesafe.space/TwuL7EwKfW8oGIV0Zo5q/media/6a373b261c5d711b35bf4e56.png";

function fmtCloses(d: Date) {
  return d.toLocaleString("en-US", {
    timeZone: "America/Detroit",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface Props {
  params: Promise<{ auctionId: string }>;
}

export default async function FlyerPage({ params }: Props) {
  const { auctionId } = await params;
  await requireUserOrg();

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      items: {
        where: { status: { in: ["ACTIVE", "DRAFT"] } },
        // Best items first: premium, then most action, then highest value.
        orderBy: [{ isPremium: "desc" }, { currentBid: "desc" }, { retailValue: "desc" }],
        take: 18,
        include: { photos: true },
      },
    },
  });

  if (!auction) {
    return (
      <div className="flex items-center justify-center flex-1 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Auction not found</h1>
          <Link href="/admin/auctions" className="text-[#6c4d39] font-semibold">Back to auctions</Link>
        </div>
      </div>
    );
  }

  // Prefer items that actually have a photo; take the top 6.
  const withPhoto = auction.items.filter((i) => i.photos.length > 0);
  const chosen = (withPhoto.length >= 6 ? withPhoto : auction.items).slice(0, 6);

  const priceOf = (i: (typeof chosen)[number]) => {
    const cur = Number(i.currentBid);
    return cur > 0
      ? { label: "Current bid", value: cur }
      : { label: "Starts at", value: Number(i.startingBid) };
  };

  return (
    <>
      <header className="border-b border-[#e3d6bf] px-6 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link href={`/admin/auctions/${auction.id}`} className="text-[#6f5b46] hover:text-[#241a12] text-base font-semibold shrink-0">← Auction</Link>
          <span className="text-[#8a7559]">/</span>
          <h1 className="text-2xl sm:text-3xl font-semibold truncate">Social flyer</h1>
        </div>
        <DownloadFlyerButton />
      </header>

      <div className="px-6 sm:px-8 py-6">
        <p className="text-base text-[#6f5b46] mb-4 max-w-xl">
          A ready‑to‑post flyer of your top 6 items with live prices. Tap <strong>Download image</strong>, or just screenshot the card below and post it to Facebook or Instagram.
        </p>

        {/* ── The flyer (screenshot / download this) ── */}
        <div id="flyer" className="w-[600px] max-w-full bg-white rounded-[28px] overflow-hidden shadow-[0_10px_40px_rgba(108,77,57,0.15)] border border-[#e3d6bf]">
          {/* Top accent stripe */}
          <div className="h-2 bg-gradient-to-r from-[#6c4d39] via-[#c47b3e] to-[#6c4d39]" />

          {/* Header — light so the dark logo reads crisp */}
          <div className="bg-[#faf5ea] px-6 pt-6 pb-5 text-center border-b border-[#efe0c9]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_URL} alt="Northwood Bids" crossOrigin="anonymous" className="h-16 w-auto max-w-[240px] object-contain mx-auto" />
            <div className="mt-3 inline-flex items-center gap-2 bg-[#6c4d39] text-white text-[11px] font-extrabold uppercase tracking-[0.18em] px-3.5 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-[#e0954f] inline-block animate-pulse" /> Live Auction
            </div>
            <h2 className="font-display text-[#241a12] font-black text-[26px] leading-[1.1] mt-2.5 px-2">{auction.title}</h2>
            <div className="text-[#8a5a2b] text-sm font-semibold mt-1.5 inline-flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 1.5" /></svg>
              Closes {fmtCloses(auction.endAt)}
            </div>
          </div>

          {/* Item grid — 3×2, roughly square for social */}
          <div className="p-3.5 grid grid-cols-3 gap-3 bg-white">
            {chosen.map((item) => {
              const photo = item.photos.find((p) => p.isPrimary)?.url ?? item.photos[0]?.url ?? null;
              const price = priceOf(item);
              const retail = Number(item.retailValue);
              const pctOff = retail > 0 && price.value < retail ? Math.round((1 - price.value / retail) * 100) : null;
              return (
                <div key={item.id} className="bg-white rounded-2xl overflow-hidden border border-[#e3d6bf] shadow-[0_2px_8px_rgba(108,77,57,0.06)]">
                  <div className="relative aspect-square bg-[#efe3d0] overflow-hidden">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt={item.title} crossOrigin="anonymous" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#b3a085] text-[10px]">No photo</div>
                    )}
                    {pctOff != null && pctOff >= 20 && (
                      <div className="absolute top-1.5 right-1.5 bg-[#a32d2d] text-white text-[10px] font-black px-1.5 py-0.5 rounded-md shadow leading-none">
                        {pctOff}% OFF
                      </div>
                    )}
                    {item.isPremium && (
                      <div className="absolute top-1.5 left-1.5 bg-[#c47b3e] text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shadow leading-none uppercase tracking-wide">★</div>
                    )}
                  </div>
                  <div className="px-2 py-2">
                    <div className="text-[10px] font-bold text-[#241a12] leading-tight line-clamp-2 min-h-[24px]">{item.title}</div>
                    <div className="text-[8px] text-[#8a7559] uppercase tracking-wide leading-none mt-1.5">{price.label}</div>
                    <div className="text-[#6c4d39] font-black text-[17px] leading-tight">${price.value.toLocaleString()}</div>
                    {retail > 0 && (
                      <div className="text-[9px] text-[#8a7559] leading-tight">retail <span className="text-[#a32d2d] font-bold">${retail.toLocaleString()}</span></div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer — bold brown CTA band */}
          <div className="bg-[#6c4d39] px-6 py-5 text-center">
            <div className="text-[#e0954f] text-[10px] font-black uppercase tracking-[0.2em]">Bid • Win • Pick up local</div>
            <div className="text-white font-black text-[22px] leading-tight mt-1">northwoodbids.com</div>
            <div className="text-[#e8d9c2] text-xs mt-1">New auctions every week — sign up free and start bidding.</div>
          </div>
        </div>

        {chosen.length === 0 && (
          <p className="text-base text-[#8a7559] mt-4">This auction has no items with photos yet — add some items first.</p>
        )}
      </div>
    </>
  );
}
