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
  try {
    const auctions = await prisma.auction.findMany({
      where: { status: { in: ["OPEN", "CLOSING"] } },
      select: { slug: true, updatedAt: true, organization: { select: { slug: true } } },
      take: 1000,
    });
    auctionUrls = auctions.map((a) => ({
      url: `${BASE}/${a.organization.slug}/${a.slug}`,
      lastModified: a.updatedAt,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    }));
  } catch {
    // DB unavailable at build — ship the static map.
  }

  return [...staticUrls, ...auctionUrls];
}
