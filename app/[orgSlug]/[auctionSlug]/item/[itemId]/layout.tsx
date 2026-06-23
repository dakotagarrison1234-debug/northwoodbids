import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

interface Props {
  params: Promise<{ orgSlug: string; auctionSlug: string; itemId: string }>;
}

// The item page itself is a client component, so it can't export metadata. This
// server layout supplies the per-item share card (title + primary photo + current
// bid) and just renders the page through. DB read is wrapped in try/catch so a
// hiccup falls back to a basic title rather than 500-ing the route. Root layout
// supplies metadataBase + defaults.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { itemId } = await params;
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { photos: true },
    });

    if (!item) {
      return { title: "Item" };
    }

    const ogImage =
      item.photos.find((p) => p.isPrimary)?.url ?? item.photos[0]?.url ?? "/icon-512.png";

    const bid = Number(item.currentBid) > 0 ? Number(item.currentBid) : Number(item.startingBid);
    const title = item.title;
    const description = `Current bid $${bid.toLocaleString()} — bid now on Northwood Bids.`;

    return {
      title,
      description,
      openGraph: { title, description, images: [ogImage] },
      twitter: { card: "summary_large_image", title, description, images: [ogImage] },
    };
  } catch {
    return { title: "Item" };
  }
}

export default function ItemLayout({ children }: { children: React.ReactNode }) {
  return children;
}
