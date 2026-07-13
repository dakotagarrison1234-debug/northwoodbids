export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserOrg } from "@/lib/auth";
import DownloadFlyerButton from "./DownloadFlyerButton";
import FlyerStage from "./FlyerStage";

const LOGO_URL =
  "https://assets.cdn.filesafe.space/TwuL7EwKfW8oGIV0Zo5q/media/6a373b261c5d711b35bf4e56.png";

/**
 * Every image on the flyer goes through our own origin. html2canvas has to read the
 * pixels back out of the canvas, and any image from a host that doesn't send CORS
 * headers either taints the canvas or — with crossOrigin set — silently refuses to
 * render, leaving a blank tile. Proxying makes them all same-origin.
 */
const proxied = (url: string) => `/api/admin/image-proxy?url=${encodeURIComponent(url)}`;

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
        take: 60,   // wide enough that a photographed item never falls outside the pool
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

  // Items WITH a photo always win a slot, in rank order. Only if there aren't six
  // of them do we top up with photoless items.
  // (The old version fell back to the plain top-6 the moment fewer than six items
  //  had photos — which could drop a photographed item in favour of a blank one.)
  const withPhoto = auction.items.filter((i) => i.photos.length > 0);
  const withoutPhoto = auction.items.filter((i) => i.photos.length === 0);
  const chosen = [...withPhoto, ...withoutPhoto].slice(0, 6);

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
          Your top 6 items with live prices, sized 1080×1080 for Facebook and Instagram.
          Tap <strong>Download image</strong> — or screenshot the flyer below, it&apos;s fully on screen.
        </p>

        {/* Built at the true 1080×1080 export size, displayed shrunk to fit. Every
            dimension below is a hard pixel value: no aspect-ratio, no overlays, no
            outer shadow on #flyer — all things html2canvas mangles. */}
        <FlyerStage>
          <div
            id="flyer"
            style={{ width: 1080, height: 1080, display: "flex", flexDirection: "column", background: "#ffffff" }}
          >
            {/* Top accent stripe */}
            <div style={{ height: 14, background: "linear-gradient(90deg,#6c4d39,#c47b3e,#6c4d39)", flexShrink: 0 }} />

            {/* Header — light, so the dark logo reads crisp */}
            <div style={{ background: "#faf5ea", borderBottom: "2px solid #efe0c9", padding: "28px 40px 24px", textAlign: "center", flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proxied(LOGO_URL)} alt="Northwood Bids" style={{ height: 84, width: "auto", maxWidth: 420, objectFit: "contain", margin: "0 auto", display: "block" }} />
              <div style={{ display: "inline-block", background: "#6c4d39", color: "#fff", fontSize: 15, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", padding: "7px 20px", borderRadius: 999, marginTop: 14 }}>
                Live Auction
              </div>
              <div className="font-display" style={{ color: "#241a12", fontWeight: 900, fontSize: 42, lineHeight: 1.1, marginTop: 12 }}>
                {auction.title}
              </div>
              <div style={{ color: "#8a5a2b", fontSize: 20, fontWeight: 700, marginTop: 8 }}>
                Closes {fmtCloses(auction.endAt)}
              </div>
            </div>

            {/* Item grid — 3 × 2, fills whatever height is left */}
            <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 16, padding: 20, background: "#ffffff" }}>
              {chosen.map((item) => {
                const photo = item.photos.find((p) => p.isPrimary)?.url ?? item.photos[0]?.url ?? null;
                const price = priceOf(item);
                const retail = Number(item.retailValue);
                return (
                  <div key={item.id} style={{ display: "flex", flexDirection: "column", minHeight: 0, border: "2px solid #e3d6bf", borderRadius: 16, overflow: "hidden", background: "#fff" }}>
                    {/* CONTAIN, never cover. These are product shots — cropping them to
                        fill the tile lops the head off the item, which is the whole point
                        of the flyer. Letterbox on white instead. */}
                    <div style={{ flex: 1, minHeight: 0, background: "#ffffff", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={proxied(photo)} alt={item.title} style={{ maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain", display: "block" }} />
                      ) : (
                        <div style={{ color: "#b3a085", fontSize: 16 }}>No photo</div>
                      )}
                    </div>
                    <div style={{ flexShrink: 0, padding: "8px 12px 10px", borderTop: "1px solid #efe0c9", background: "#faf5ea" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#241a12", lineHeight: 1.2, height: 34, overflow: "hidden" }}>
                        {item.title}
                      </div>
                      <div style={{ color: "#6c4d39", fontWeight: 900, fontSize: 28, lineHeight: 1, marginTop: 5 }}>
                        ${price.value.toLocaleString()}
                      </div>
                      <div style={{ fontSize: 13, color: "#8a7559", lineHeight: 1.2, marginTop: 4 }}>
                        {price.label}
                        {retail > 0 && (
                          <> · retail <span style={{ color: "#a32d2d", fontWeight: 700 }}>${retail.toLocaleString()}</span></>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer — bold brown CTA band */}
            <div style={{ background: "#6c4d39", padding: "22px 40px 26px", textAlign: "center", flexShrink: 0 }}>
              <div style={{ color: "#e0954f", fontSize: 15, fontWeight: 900, letterSpacing: "0.22em", textTransform: "uppercase" }}>
                Bid • Win • Pick up local
              </div>
              <div style={{ color: "#fff", fontWeight: 900, fontSize: 40, lineHeight: 1.1, marginTop: 4 }}>northwoodbids.com</div>
              <div style={{ color: "#e8d9c2", fontSize: 18, marginTop: 6 }}>New auctions every week — sign up free and start bidding.</div>
            </div>
          </div>
        </FlyerStage>

        {chosen.length === 0 && (
          <p className="text-base text-[#8a7559] mt-4">This auction has no items with photos yet — add some items first.</p>
        )}
      </div>
    </>
  );
}
