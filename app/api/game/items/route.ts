import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Real auction items (with photos) to use as the lots in the auction game. Public.
export async function GET() {
  try {
    const items = await prisma.item.findMany({
      where: {
        status: "ACTIVE",
        auction: { status: { in: ["OPEN", "CLOSING"] } },
        photos: { some: {} },
      },
      take: 60,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        photos: { take: 1, orderBy: [{ isPrimary: "desc" }, { order: "asc" }], select: { url: true } },
        auction: { select: { slug: true, organization: { select: { slug: true } } } },
      },
    });

    const lots = items
      .filter((i) => i.photos[0]?.url)
      .map((i) => ({
        id: i.id,
        title: i.title,
        photo: i.photos[0].url,
        href: `/${i.auction?.organization.slug}/${i.auction?.slug}/item/${i.id}`,
      }));

    return NextResponse.json({ lots });
  } catch {
    return NextResponse.json({ lots: [] });
  }
}
