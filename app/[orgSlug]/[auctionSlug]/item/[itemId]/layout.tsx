import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import JsonLd from "@/app/components/JsonLd";
import { productLd, breadcrumbLd, SEO_BASE } from "@/lib/seo";

interface Props {
  params: Promise<{ orgSlug: string; auctionSlug: string; itemId: string }>;
}

const SOLD = ["SOLD", "PENDING_PICKUP", "PICKED_UP", "UNSOLD"];

// The item page itself is a client component, so it can't export metadata. This
// server layout supplies the per-item share card (title + primary photo + current
// bid), the canonical URL, and the Product/Breadcrumb structured data, then renders
// the page through. DB reads are wrapped in try/catch so a hiccup falls back rather
// than 500-ing the route.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { orgSlug, auctionSlug, itemId } = await params;
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { title: true, status: true, currentBid: true, startingBid: true, retailValue: true, _count: { select: { bids: true } } },
    });
    if (!item) return { title: "Item" };

    // The picture is the branded card in ./opengraph-image.tsx (photo, price,
    // % off, bids, end time). The words below ride along with it.
    const current = Number(item.currentBid);
    const bid = current > 0 ? current : Number(item.startingBid);
    const retailN = Number(item.retailValue);
    const off = retailN > bid && bid > 0 ? Math.round((1 - bid / retailN) * 100) : 0;
    const sold = ["SOLD", "PENDING_PICKUP", "PICKED_UP"].includes(item.status);
    const title = item.title;
    const lead = sold ? `Sold for $${bid.toLocaleString()}` : current > 0 ? `Bidding at $${bid.toLocaleString()}` : `Starts at $${bid.toLocaleString()}`;
    const parts = [
      lead,
      retailN > 0 ? `retail $${Math.round(retailN).toLocaleString()}${off >= 20 ? ` (${off}% off)` : ""}` : null,
      item._count.bids > 0 ? `${item._count.bids} bid${item._count.bids === 1 ? "" : "s"}` : null,
    ].filter(Boolean);
    const description = `${parts.join(" · ")}. Bid online at Northwood Bids, pick up in Corunna (24/7) or Gladwin.`;
    const canonical = `/${orgSlug}/${auctionSlug}/item/${itemId}`;

    return {
      title,
      description,
      alternates: { canonical },
      openGraph: { title, description, url: canonical, type: "website", siteName: "Northwood Bids" },
      twitter: { card: "summary_large_image", title, description },
    };
  } catch {
    return { title: "Item" };
  }
}

export default async function ItemLayout({ children, params }: { children: React.ReactNode; params: Props["params"] }) {
  let ld: object | null = null;
  let crumbs: object | null = null;
  try {
    const { orgSlug, auctionSlug, itemId } = await params;
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        photos: { orderBy: [{ isPrimary: "desc" }, { order: "asc" }] },
        auction: { select: { title: true, slug: true, endAt: true } },
      },
    });
    if (item) {
      const url = `${SEO_BASE}/${orgSlug}/${auctionSlug}/item/${itemId}`;
      const price = Number(item.currentBid) > 0 ? Number(item.currentBid) : Number(item.startingBid);
      const end = (item.itemEndAt ?? item.auction?.endAt) ?? null;
      ld = productLd({
        name: item.title,
        description: item.description,
        images: item.photos.map((p) => p.url).slice(0, 6),
        url,
        price,
        condition: item.condition,
        availability: SOLD.includes(item.status) ? "SoldOut" : "InStock",
        priceValidUntil: end ? new Date(end).toISOString() : null,
      });
      crumbs = breadcrumbLd([
        { name: "Home", url: SEO_BASE },
        { name: "Auctions", url: `${SEO_BASE}/auctions` },
        ...(item.auction ? [{ name: item.auction.title, url: `${SEO_BASE}/${orgSlug}/${item.auction.slug}` }] : []),
        { name: item.title, url },
      ]);
    }
  } catch {
    /* structured data is a nice-to-have — never block the page */
  }

  return (
    <>
      {ld && <JsonLd data={ld} />}
      {crumbs && <JsonLd data={crumbs} />}
      {children}
    </>
  );
}
