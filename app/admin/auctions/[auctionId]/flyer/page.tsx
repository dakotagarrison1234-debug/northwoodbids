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
        <div id="flyer" className="w-[600px] max-w-full bg-[#f1e7d5] rounded-3xl border border-[#cdbda3] overflow-hidden shadow-sm">
          {/* Header band */}
          <div className="bg-[#6c4d39] px-6 pt-6 pb-5 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_URL} alt="Northwood Bids" crossOrigin="anonymous" className="h-14 w-auto max-w-[220px] object-contain mx-auto mb-3" />
            <div className="inline-flex items-center gap-1.5 bg-[#efe0c9] text-[#8a4f1c] text-xs font-extrabold uppercase tracking-widest px-3 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-[#c47b3e] inline-block" /> Live auction
            </div>
            <h2 className="text-white font-extrabold text-2xl mt-2 leading-tight px-2">{auction.title}</h2>
            <div className="text-[#e8d9c2] text-sm mt-1">Closes {fmtCloses(auction.endAt)}</div>
          </div>

          {/* Item grid — 3×2 keeps the whole flyer close to a 1:1 social square */}
          <div className="p-3 grid grid-cols-3 gap-2.5">
            {chosen.map((item) => {
              const photo = item.photos.find((p) => p.isPrimary)?.url ?? item.photos[0]?.url ?? null;
              const price = priceOf(item);
              const retail = Number(item.retailValue);
              return (
                <div key={item.id} className="bg-white rounded-xl overflow-hidden border border-[#e3d6bf]">
                  <div className="aspect-square bg-[#efe3d0] overflow-hidden">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt={item.title} crossOrigin="anonymous" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#b3a085] text-[10px]">No photo</div>
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <div className="text-[10px] font-bold text-[#241a12] leading-tight line-clamp-2 min-h-[24px]">{item.title}</div>
                    <div className="text-[8px] text-[#8a7559] uppercase tracking-wide leading-none mt-1">{price.label}</div>
                    <div className="text-[#6c4d39] font-extrabold text-sm leading-tight">${price.value.toLocaleString()}</div>
                    {retail > 0 && (
                      <div className="text-[9px] text-[#8a7559] leading-tight">MSRP <span className="text-[#a32d2d] font-semibold">${retail.toLocaleString()}</span></div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer band */}
          <div className="bg-[#efe5d3] border-t border-[#cdbda3] px-6 py-4 text-center">
            <div className="text-[#6c4d39] font-extrabold text-lg">Bid now at northwoodbids.com</div>
            <div className="text-[#8a7559] text-sm mt-0.5">Real auctions. Real deals. Pick up local.</div>
          </div>
        </div>

        {chosen.length === 0 && (
          <p className="text-base text-[#8a7559] mt-4">This auction has no items with photos yet — add some items first.</p>
        )}
      </div>
    </>
  );
}
