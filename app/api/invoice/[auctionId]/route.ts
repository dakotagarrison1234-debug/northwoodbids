export const dynamic = "force-dynamic";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ auctionId: string }> }
) {
  try {
    const { auctionId } = await params;
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Determine target buyer: default to the current user.
    // An org admin may pass ?user=<clerkUserId> to view any winner's receipt.
    const url = new URL(req.url);
    const requestedUser = url.searchParams.get("user");
    let targetUserId = userId;
    if (requestedUser && requestedUser !== userId) {
      const membership = await getUserOrg();
      if (membership) targetUserId = requestedUser;
    }

    const payments = await prisma.payment.findMany({
      where: {
        status: "PAID",
        clerkUserId: targetUserId,
        item: { auctionId },
      },
      include: {
        item: {
          select: {
            title: true,
            photos: { select: { url: true, isPrimary: true } },
            auction: {
              select: {
                title: true,
                organization: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (payments.length === 0) {
      return NextResponse.json({ empty: true });
    }

    const num = (d: unknown) => (d == null ? 0 : Number(d));

    // Business name — prefer the auction's organization, fall back to the first org.
    let businessName =
      payments[0].item.auction?.organization?.name ?? null;
    if (!businessName) {
      const org = await prisma.organization.findFirst({ select: { name: true } });
      businessName = org?.name ?? "Auction House";
    }

    const auctionTitle = payments[0].item.auction?.title ?? "Auction";

    // Buyer name/email from BidderProfile
    const profile = await prisma.bidderProfile.findUnique({
      where: { clerkUserId: targetUserId },
      select: { name: true, email: true },
    });

    const lines = payments.map((p) => {
      const photos = p.item.photos ?? [];
      const primary = photos.find((ph) => ph.isPrimary) ?? photos[0] ?? null;
      const bid = num(p.amount);
      const premium = num(p.applicationFeeAmount);
      const tax = num(p.taxAmount);
      return {
        title: p.item.title,
        photo: primary?.url ?? null,
        bid,
        premium,
        tax,
        total: bid + premium + tax,
      };
    });

    const round = (n: number) => Math.round(n * 100) / 100;
    const subtotal = lines.reduce((s, l) => s + l.bid, 0);
    const premium = lines.reduce((s, l) => s + l.premium, 0);
    const tax = lines.reduce((s, l) => s + l.tax, 0);
    const grandTotal = subtotal + premium + tax;

    return NextResponse.json({
      business: { name: businessName },
      auction: { title: auctionTitle },
      buyer: { name: profile?.name ?? null, email: profile?.email ?? null },
      date: new Date().toISOString(),
      lines,
      totals: {
        subtotal: round(subtotal),
        premium: round(premium),
        tax: round(tax),
        grandTotal: round(grandTotal),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[invoice GET]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
