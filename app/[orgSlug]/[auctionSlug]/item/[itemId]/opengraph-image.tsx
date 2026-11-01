import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { OG_SIZE, ogFonts, ogLogo, ogPhoto, whenText } from "@/lib/og";
import { LotCard, type LotCardProps } from "@/lib/ogCards";

// A lot's share card: its photo, the price, how far under retail, bids and when
// it ends. Shared links (and invite links pointing at a lot) show this.
export const alt = "A lot up for auction on Northwood Bids";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 300; // prices move; refresh the card every 5 minutes

const SOLD = new Set(["SOLD", "PENDING_PICKUP", "PICKED_UP"]);

export default async function Image({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const [fonts, logo] = await Promise.all([ogFonts(), ogLogo()]);

  let card: LotCardProps = {
    logo, photo: null, title: "Northwood Bids", priceLabel: "Every lot from", price: 2, retail: null, bids: 0, when: "Bid at northwoodbids.com", tone: "live",
  };
  try {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        title: true, status: true, currentBid: true, startingBid: true, retailValue: true, itemEndAt: true,
        photos: { orderBy: [{ isPrimary: "desc" }, { order: "asc" }], take: 1, select: { url: true } },
        auction: { select: { status: true, startAt: true, endAt: true } },
        _count: { select: { bids: true } },
      },
    });
    if (item) {
      const current = Number(item.currentBid);
      const price = current > 0 ? current : Number(item.startingBid);
      const retail = Number(item.retailValue) > 0 ? Number(item.retailValue) : null;
      const end = item.itemEndAt ?? item.auction?.endAt ?? null;
      const now = new Date();
      const notOpen = item.auction?.status === "DRAFT" || (item.auction?.startAt && item.auction.startAt > now);
      let tone: LotCardProps["tone"] = "live";
      let priceLabel = current > 0 ? "Current bid" : "Starts at";
      let when = end ? `Ends ${whenText(end, now)}` : "Bidding now";
      if (SOLD.has(item.status)) {
        tone = "done"; priceLabel = "Sold for"; when = "Auction closed";
      } else if (item.status === "UNSOLD" || (end && end < now)) {
        tone = "done"; priceLabel = current > 0 ? "Final bid" : "Starting bid"; when = "Auction closed";
      } else if (notOpen) {
        tone = "preview"; priceLabel = "Starts at";
        when = item.auction?.startAt ? `Bidding opens ${whenText(item.auction.startAt, now)}` : "Coming up";
      }
      card = {
        logo,
        photo: await ogPhoto(item.photos[0]?.url),
        title: item.title,
        priceLabel,
        price,
        retail,
        bids: item._count.bids,
        when,
        tone,
      };
    }
  } catch {
    /* fall back to the plain card */
  }

  return new ImageResponse(LotCard(card), { ...size, fonts });
}
