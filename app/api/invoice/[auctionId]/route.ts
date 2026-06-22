export const dynamic = "force-dynamic";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessOrg } from "@/lib/auth";

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
      // An org admin may view another user's receipt, but only if they can
      // access the auction's org AND the requested user actually transacted in
      // this auction. Otherwise fall back to the caller's own invoice.
      const auction = await prisma.auction.findUnique({
        where: { id: auctionId },
        select: { organizationId: true },
      });
      if (auction && (await canAccessOrg(auction.organizationId))) {
        const [requestedPayment, requestedBid] = await Promise.all([
          prisma.payment.findFirst({
            where: { clerkUserId: requestedUser, item: { auctionId } },
            select: { id: true },
          }),
          prisma.bid.findFirst({
            where: { clerkUserId: requestedUser, item: { auctionId } },
            select: { id: true },
          }),
        ]);
        if (requestedPayment || requestedBid) {
          targetUserId = requestedUser;
        }
      }
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
            itemCode: true,
            photos: { select: { url: true, isPrimary: true } },
            auction: {
              select: {
                title: true,
                organization: {
                  select: { name: true, platformFeePercent: true, taxPercent: true },
                },
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
    const feePercent = num(payments[0].item.auction?.organization?.platformFeePercent);
    const taxPercent = num(payments[0].item.auction?.organization?.taxPercent);

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
        itemCode: p.item.itemCode ?? null,
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
      feePercent,
      taxPercent,
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
    console.error("[invoice GET]:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
