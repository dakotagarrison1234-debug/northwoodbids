import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { OG_SIZE, ogFonts, ogLogo, ogPhoto, whenText } from "@/lib/og";
import { AuctionCard, type AuctionCardProps } from "@/lib/ogCards";

// An auction's share card: its name, how many lots, "from $2", when it closes,
// and a 2×2 of its most-bid lots.
export const alt = "An auction on Northwood Bids";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 600;

export default async function Image({ params }: { params: Promise<{ orgSlug: string; auctionSlug: string }> }) {
  const { orgSlug, auctionSlug } = await params;
  const [fonts, logo] = await Promise.all([ogFonts(), ogLogo()]);

  let card: AuctionCardProps = { logo, title: "Northwood Bids", photos: [], lots: 0, when: "New auctions every week", tone: "live", fromPrice: 2 };
  try {
    const org = await prisma.organization.findUnique({ where: { slug: orgSlug }, select: { id: true } });
    const auction = org
      ? await prisma.auction.findFirst({
          where: { organizationId: org.id, slug: auctionSlug },
          select: { id: true, title: true, status: true, startAt: true, endAt: true },
        })
      : null;
    if (auction) {
      const live = { auctionId: auction.id, status: { not: "DRAFT" as const } };
      const [lots, top, cheapest] = await Promise.all([
        prisma.item.count({ where: live }),
        prisma.item.findMany({
          where: { ...live, photos: { some: {} } },
          orderBy: [{ bids: { _count: "desc" } }, { currentBid: "desc" }],
          take: 4,
          select: { photos: { orderBy: [{ isPrimary: "desc" }, { order: "asc" }], take: 1, select: { url: true } } },
        }),
        prisma.item.findFirst({ where: live, orderBy: { startingBid: "asc" }, select: { startingBid: true } }),
      ]);
      const now = new Date();
      const notOpen = auction.status === "DRAFT" || auction.startAt > now;
      const closed = auction.status === "CLOSED" || auction.status === "SETTLED" || auction.endAt < now;
      const tone: AuctionCardProps["tone"] = closed ? "done" : notOpen ? "preview" : "live";
      const when = closed ? "Auction closed" : notOpen ? `Bidding opens ${whenText(auction.startAt, now)}` : `Bidding closes ${whenText(auction.endAt, now)}`;
      const photos = (await Promise.all(top.map((t) => ogPhoto(t.photos[0]?.url, 420)))).filter((x): x is string => !!x);
      card = {
        logo,
        title: auction.title,
        photos,
        lots,
        when,
        tone,
        fromPrice: cheapest ? Math.max(1, Math.round(Number(cheapest.startingBid))) : null,
      };
    }
  } catch {
    /* fall back to the plain card */
  }

  return new ImageResponse(AuctionCard(card), { ...size, fonts });
}
