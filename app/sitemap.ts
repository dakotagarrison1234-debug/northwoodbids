import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export const revalidate = 3600; // rebuild hourly

const BASE = "https://northwoodbids.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticUrls: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/auctions`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/help`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/play`, changeFrequency: "weekly", priority: 0.3 },
  ];

  let auctionUrls: MetadataRoute.Sitemap = [];
  let itemUrls: MetadataRoute.Sitemap = [];
  let orgUrls: MetadataRoute.Sitemap = [];
  try {
    // Live + upcoming auctions (upcoming lets Google discover them before they open).
    const auctions = await prisma.auction.findMany({
      where: { status: { in: ["OPEN", "CLOSING", "DRAFT"] }, archived: false },
      select: { slug: true, status: true, updatedAt: true, organization: { select: { slug: true } } },
      take: 2000,
    });
    auctionUrls = auctions.map((a) => ({
      url: `${BASE}/${a.organization.slug}/${a.slug}`,
      lastModified: a.updatedAt,
      changeFrequency: a.status === "DRAFT" ? ("daily" as const) : ("hourly" as const),
      priority: a.status === "DRAFT" ? 0.6 : 0.8,
    }));

    // Every biddable lot — the long tail of indexable product pages.
    const items = await prisma.item.findMany({
      where: { status: "ACTIVE", auction: { status: { in: ["OPEN", "CLOSING"] }, archived: false } },
      select: {
        id: true, updatedAt: true,
        auction: { select: { slug: true, organization: { select: { slug: true } } } },
      },
      take: 5000,
    });
    itemUrls = items
      .filter((i) => i.auction?.slug && i.auction.organization?.slug)
      .map((i) => ({
        url: `${BASE}/${i.auction!.organization!.slug}/${i.auction!.slug}/item/${i.id}`,
        lastModified: i.updatedAt,
        changeFrequency: "hourly" as const,
        priority: 0.7,
      }));

    // Seller/org landing pages.
    const orgs = await prisma.organization.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true },
      take: 200,
    });
    orgUrls = orgs.map((o) => ({
      url: `${BASE}/${o.slug}`,
      lastModified: o.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.5,
    }));
  } catch {
    // DB unavailable at build — ship the static map.
  }

  return [...staticUrls, ...orgUrls, ...auctionUrls, ...itemUrls];
}
