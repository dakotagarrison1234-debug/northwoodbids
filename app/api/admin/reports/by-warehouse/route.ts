export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

// Stripe standard pricing (US): 2.9% + $0.30 per successful charge (per PaymentIntent).
const STRIPE_PCT = 0.029;
const STRIPE_FIXED = 0.3;

type Bucket = {
  net: number;
  sales: number;
  premium: number;
  tax: number;
  fees: number;
  credit: number;
  itemsSold: number;
};
const emptyBucket = (): Bucket => ({ net: 0, sales: 0, premium: 0, tax: 0, fees: 0, credit: 0, itemsSold: 0 });

/**
 * GET /api/admin/reports/by-warehouse
 *
 * Net take-home from COMPLETED (PAID) payments, grouped by warehouse (the item's
 * pickup location) and, within each, by auction. "Net" = sale price + buyer's
 * premium − sales tax (remitted) − Stripe fees − any Bid Bucks credit, i.e. what
 * the business actually pockets. Stripe's 2.9%+$0.30 is charged once per
 * PaymentIntent, so it's allocated across that charge's items by gross share.
 */
export async function GET() {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;

  const num = (d: unknown) => (d == null ? 0 : Number(d));

  const payments = await prisma.payment.findMany({
    where: { status: "PAID", item: { organizationId: orgId } },
    select: {
      amount: true,
      applicationFeeAmount: true,
      taxAmount: true,
      creditApplied: true,
      stripePaymentIntentId: true,
      item: {
        select: {
          location: { select: { id: true, name: true } },
          auction: { select: { id: true, title: true } },
        },
      },
    },
  });

  // ── Allocate each PaymentIntent's Stripe fee across its rows by gross share ──
  // gross charged for a row = bid + premium + tax − credit (what actually hit the card).
  const grossOf = (p: (typeof payments)[number]) =>
    num(p.amount) + num(p.applicationFeeAmount) + num(p.taxAmount) - num(p.creditApplied ?? 0);

  // Sum gross per PaymentIntent (rows sharing a PI are one Stripe charge).
  const piGross = new Map<string, number>();
  for (const p of payments) {
    if (!p.stripePaymentIntentId) continue;
    piGross.set(p.stripePaymentIntentId, (piGross.get(p.stripePaymentIntentId) ?? 0) + grossOf(p));
  }
  const piFee = new Map<string, number>();
  for (const [pi, gross] of piGross) piFee.set(pi, gross * STRIPE_PCT + STRIPE_FIXED);

  const feeForRow = (p: (typeof payments)[number]): number => {
    const gross = grossOf(p);
    if (!p.stripePaymentIntentId) {
      // Solo charge (e.g. fully-credit-covered rows have gross 0 → ~no real fee).
      return gross > 0 ? gross * STRIPE_PCT + STRIPE_FIXED : 0;
    }
    const totalGross = piGross.get(p.stripePaymentIntentId) ?? 0;
    const totalFee = piFee.get(p.stripePaymentIntentId) ?? 0;
    if (totalGross <= 0) return 0;
    return totalFee * (gross / totalGross); // proportional allocation
  };

  // ── Group: warehouse → auction ──
  type WH = { id: string; name: string; bucket: Bucket; auctions: Map<string, { title: string; bucket: Bucket }> };
  const warehouses = new Map<string, WH>();
  const grand = emptyBucket();

  const add = (b: Bucket, p: (typeof payments)[number], fee: number) => {
    const sale = num(p.amount);
    const premium = num(p.applicationFeeAmount);
    const tax = num(p.taxAmount);
    const credit = num(p.creditApplied ?? 0);
    b.sales += sale;
    b.premium += premium;
    b.tax += tax;
    b.fees += fee;
    b.credit += credit;
    b.net += sale + premium - credit - fee; // tax in = tax out; net is what's pocketed
    b.itemsSold += 1;
  };

  for (const p of payments) {
    const fee = feeForRow(p);
    const whId = p.item.location?.id ?? "__none__";
    const whName = p.item.location?.name ?? "Unassigned";
    let wh = warehouses.get(whId);
    if (!wh) {
      wh = { id: whId, name: whName, bucket: emptyBucket(), auctions: new Map() };
      warehouses.set(whId, wh);
    }
    add(wh.bucket, p, fee);

    const auctionId = p.item.auction?.id ?? "__none__";
    const auctionTitle = p.item.auction?.title ?? "No auction";
    let a = wh.auctions.get(auctionId);
    if (!a) {
      a = { title: auctionTitle, bucket: emptyBucket() };
      wh.auctions.set(auctionId, a);
    }
    add(a.bucket, p, fee);

    add(grand, p, fee);
  }

  const round = (b: Bucket): Bucket => ({
    net: Math.round(b.net * 100) / 100,
    sales: Math.round(b.sales * 100) / 100,
    premium: Math.round(b.premium * 100) / 100,
    tax: Math.round(b.tax * 100) / 100,
    fees: Math.round(b.fees * 100) / 100,
    credit: Math.round(b.credit * 100) / 100,
    itemsSold: b.itemsSold,
  });

  const result = [...warehouses.values()]
    .map((wh) => ({
      name: wh.name,
      ...round(wh.bucket),
      auctions: [...wh.auctions.values()]
        .map((a) => ({ title: a.title, ...round(a.bucket) }))
        .sort((x, y) => y.net - x.net),
    }))
    .sort((x, y) => y.net - x.net);

  return NextResponse.json({ warehouses: result, grandTotal: round(grand) });
}
