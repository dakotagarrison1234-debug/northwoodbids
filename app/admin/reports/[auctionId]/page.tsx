export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { requireUserOrg } from "@/lib/auth";
import { ensureSoldLocations } from "@/lib/soldLocation";
import { fmtMoney, fmtMoney0 } from "../../format";
import { PageHeader, PageBody, Panel, StatCard, Empty, BtnLink, Eyebrow, Progress, ActionCard } from "../../ui";

// Match the aggregate reports endpoint exactly so a single-auction view can never
// disagree with the ranked list it was opened from.
const STRIPE_PCT = 0.029;
const STRIPE_FIXED = 0.3;
const ROW_CAP = 20000;
const SOLD_STATUSES = ["SOLD", "PENDING_PICKUP", "PICKED_UP"] as const;

const num = (d: unknown) => (d == null ? 0 : Number(d));
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmtDate = (d: Date | null) =>
  d ? d.toLocaleString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric", year: "numeric" }) : "";

interface Props {
  params: Promise<{ auctionId: string }>;
}

export default async function AuctionReportPage({ params }: Props) {
  const { auctionId } = await params;
  const membership = await requireUserOrg();
  const orgId = membership.organization.id;
  const isNone = auctionId === "none";

  // Heal any sold item missing its selling-warehouse snapshot so commission never
  // credits the pickup/transfer destination.
  await ensureSoldLocations(orgId);

  const orgConfig = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { platformFeePercent: true },
  });
  const feePercent = num(orgConfig?.platformFeePercent);

  const auction = isNone
    ? null
    : await prisma.auction.findFirst({
        where: { id: auctionId, organizationId: orgId },
        select: { id: true, title: true, startAt: true, endAt: true, status: true },
      });

  if (!isNone && !auction) {
    return (
      <>
        <PageHeader title="Auction not found" back={{ href: "/admin/reports", label: "Reports" }} tabs={false} />
        <PageBody>
          <Panel>
            <Empty text="That auction isn't here." action={<BtnLink href="/admin/reports" size="sm">Back to reports</BtnLink>} />
          </Panel>
        </PageBody>
      </>
    );
  }

  // ALL paid rows for the org, so a Stripe charge shared across auctions is split
  // the same proportional way it is on the main report; then we keep only this
  // auction's rows for the totals.
  const paidAll = await prisma.payment.findMany({
    where: { status: "PAID", comped: false, item: { organizationId: orgId } },
    select: {
      amount: true, applicationFeeAmount: true, taxAmount: true, creditApplied: true, shippingAmount: true, shippingRefundedAt: true,
      stripePaymentIntentId: true, paidInCash: true,
      item: { select: { auctionId: true, soldLocation: { select: { id: true, name: true } }, location: { select: { id: true, name: true } } } },
    },
    take: ROW_CAP,
  });

  // Same gross as the main report: shipping was charged on the same PaymentIntent,
  // so it has to be in the base the Stripe fee is split over.
  const grossOf = (p: (typeof paidAll)[number]) =>
    num(p.amount) + num(p.applicationFeeAmount) + num(p.taxAmount) + (p.shippingRefundedAt ? 0 : num(p.shippingAmount ?? 0)) - num(p.creditApplied ?? 0);
  const piGross = new Map<string, number>();
  for (const p of paidAll) {
    if (!p.stripePaymentIntentId) continue;
    piGross.set(p.stripePaymentIntentId, (piGross.get(p.stripePaymentIntentId) ?? 0) + grossOf(p));
  }
  const feeForRow = (p: (typeof paidAll)[number]): number => {
    if (p.paidInCash) return 0; // cash paid in person — no Stripe cut
    const gross = grossOf(p);
    if (!p.stripePaymentIntentId) return gross > 0 ? gross * STRIPE_PCT + STRIPE_FIXED : 0;
    const total = piGross.get(p.stripePaymentIntentId) ?? 0;
    if (total <= 0) return 0;
    return (total * STRIPE_PCT + STRIPE_FIXED) * (gross / total);
  };

  const rows = paidAll.filter((p) =>
    isNone ? p.item?.auctionId == null : p.item?.auctionId === auctionId
  );

  let hammer = 0, premium = 0, tax = 0, credit = 0, fees = 0, itemsSold = 0;
  const byWarehouse = new Map<string, number>();
  for (const p of rows) {
    const fee = feeForRow(p);
    const sale = num(p.amount), prem = num(p.applicationFeeAmount);
    const t = num(p.taxAmount), cr = num(p.creditApplied ?? 0);
    itemsSold += 1;
    hammer += sale; premium += prem; tax += t; credit += cr; fees += fee;
    // Commission stays with the SELLING warehouse snapshot only — never the live
    // location, which after a pickup transfer is the destination.
    const wLabel = p.item?.soldLocation?.name ?? "Unassigned";
    byWarehouse.set(wLabel, (byWarehouse.get(wLabel) ?? 0) + (sale + prem - cr - fee));
  }
  const net = hammer + premium - credit - fees;
  const avgItem = itemsSold > 0 ? hammer / itemsSold : 0;
  const warehouses = [...byWarehouse.entries()].map(([label, n]) => ({ label, net: r2(n) })).sort((a, b) => b.net - a.net);
  const topWh = Math.max(1, ...warehouses.map((w) => w.net));

  // Sell-through — items that sold vs didn't in this auction.
  const auctionFilter = isNone ? { auctionId: null } : { auctionId };
  const [soldItemCount, unsoldItemCount] = await Promise.all([
    prisma.item.count({ where: { organizationId: orgId, ...auctionFilter, status: { in: [...SOLD_STATUSES] } } }),
    prisma.item.count({ where: { organizationId: orgId, ...auctionFilter, status: "UNSOLD" } }),
  ]);
  const offered = soldItemCount + unsoldItemCount;
  const sellThrough = offered > 0 ? Math.round((soldItemCount / offered) * 100) : 0;

  // Still owed on this auction (failed/pending cards). Collecting happens on Payments.
  const owedRows = await prisma.payment.findMany({
    where: { status: { in: ["PENDING", "FAILED"] }, comped: false, item: { organizationId: orgId, ...auctionFilter } },
    select: { clerkUserId: true, amount: true, applicationFeeAmount: true, taxAmount: true },
    take: 2000,
  });
  const owedTotal = r2(owedRows.reduce((s, p) => s + num(p.amount) + num(p.applicationFeeAmount) + num(p.taxAmount), 0));
  const owedPeople = new Set(owedRows.map((p) => p.clerkUserId)).size;

  const title = isNone ? "Items with no auction" : auction!.title;

  return (
    <>
      <PageHeader
        title={title}
        sub={auction ? `${fmtDate(auction.startAt)} to ${fmtDate(auction.endAt)}` : undefined}
        back={{ href: "/admin/reports", label: "Reports" }}
        tabs={false}
      />

      <PageBody className="pb-16">
        {/* Hero: net */}
        <div className="rounded-2xl bg-[#241a12] text-[#fbf4e6] p-5 sm:p-6 shadow-[0_10px_30px_-18px_rgba(36,26,18,0.7)]">
          <Eyebrow className="!text-[#b9a688]">You made</Eyebrow>
          <div className="font-display text-5xl sm:text-6xl font-black tracking-tight mt-1 tabular-nums leading-none text-[#f0a35a]">{fmtMoney0(net)}</div>
          <div className="text-[#d9c7ab] mt-2">
            {itemsSold} lot{itemsSold !== 1 ? "s" : ""} sold{avgItem > 0 ? ` · ${fmtMoney0(avgItem)} average` : ""}
          </div>
        </div>

        {/* Key figures */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Hammer" value={fmtMoney0(hammer)} />
          <StatCard label={`Premium (${feePercent}%)`} value={fmtMoney0(premium)} tone="green" />
          <StatCard label="Stripe fees" value={"−" + fmtMoney0(fees)} tone="red" />
          <StatCard label="Sales tax" value={fmtMoney0(tax)} tone="amber" />
          <StatCard
            label="Sell-through"
            value={`${sellThrough}%`}
            sub={`${soldItemCount} of ${offered}`}
            tone={sellThrough >= 80 ? "green" : sellThrough >= 50 ? "amber" : "slate"}
          />
        </div>

        {/* By warehouse */}
        {warehouses.length > 0 && (
          <Panel title="By warehouse">
            <ul className="px-4 sm:px-5 py-4 space-y-3">
              {warehouses.map((w) => (
                <li key={w.label}>
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <span className="font-bold text-[#241a12] min-w-0 truncate">{w.label}</span>
                    <span className="font-extrabold text-[#241a12] tabular-nums shrink-0">{fmtMoney0(w.net)}</span>
                  </div>
                  <Progress value={w.net / topWh} tone="leather" />
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {/* Still owed: collecting lives on Payments */}
        {owedTotal > 0 && (
          <ActionCard
            href="/admin/winners"
            tone="red"
            count={fmtMoney(owedTotal)}
            label="Still owed on this auction"
            sub={`${owedPeople} ${owedPeople === 1 ? "person" : "people"} · not counted above`}
          />
        )}

        {itemsSold === 0 && (
          <Panel>
            <Empty text="No paid sales recorded for this auction yet." />
          </Panel>
        )}
      </PageBody>
    </>
  );
}
