export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { ItemStatus } from "@prisma/client";
import { requireUserOrg } from "@/lib/auth";
import PusherRefresh from "@/app/components/PusherRefresh";
import { Panel, Pill, Row, ActionCard, PageHeader, PageBody, BtnLink, Progress, StatCard } from "../ui";
// Formatters come from the server-safe module — importing them from ui.tsx
// ("use client") makes them client references and they throw when called here.
import { fmtMoney0 } from "../format";

/**
 * Today — the admin's home. One question: what needs me right now?
 * Jobs (only the non-zero ones), then what's live and what's next, then one
 * quiet health number that links to Reports. Every card deep-links to the exact
 * place the work happens.
 */

function detroitDayKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

type Job = { href: string; count: number | string; label: string; sub: string; tone: "red" | "amber" | "green" };

export default async function AdminDashboard() {
  const membership = await requireUserOrg();
  const orgId = membership.organization.id;
  // Money is owner/admin only — same gate nav.ts uses for the Money group.
  const ownerish = membership.role === "OWNER" || membership.role === "ADMIN";
  const now = new Date();
  const soldStatuses: ItemStatus[] = ["SOLD", "PENDING_PICKUP", "PICKED_UP"];

  const [liveAuctions, upcomingAuctions, scheduled, unpaidRows, readyNoAppt, activeTransfers, weekAgg] = await Promise.all([
    prisma.auction.findMany({
      where: { organizationId: orgId, status: { in: ["OPEN", "CLOSING"] }, archived: false },
      orderBy: { endAt: "asc" },
      include: { _count: { select: { items: true } } },
    }),
    prisma.auction.findMany({
      where: { organizationId: orgId, status: "DRAFT", startAt: { gt: now }, archived: false },
      orderBy: { startAt: "asc" },
      take: 3,
      include: { _count: { select: { items: true } } },
    }),
    prisma.pickupAppointment.findMany({
      where: { organizationId: orgId, status: "SCHEDULED" },
      select: { id: true, startsAt: true, stagedSpot: true },
    }),
    ownerish
      ? prisma.payment.findMany({
          where: { item: { organizationId: orgId }, status: { in: ["PENDING", "FAILED"] }, comped: false },
          select: { amount: true, applicationFeeAmount: true, taxAmount: true, shippingAmount: true, clerkUserId: true },
        })
      : Promise.resolve([]),
    prisma.item.count({ where: { organizationId: orgId, status: "PENDING_PICKUP", pickupAppointmentId: null, transferRequestId: null, shippingBundleId: null } }),
    prisma.transferRequest.count({ where: { organizationId: orgId, status: { in: ["REQUESTED", "LOADED"] } } }),
    ownerish
      ? prisma.payment.aggregate({
          where: { item: { organizationId: orgId }, status: "PAID", comped: false, createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } },
          _sum: { amount: true },
        })
      : Promise.resolve(null),
  ]);

  const todayKey = detroitDayKey(now);
  const today = scheduled.filter((a) => detroitDayKey(a.startsAt) === todayKey);
  const late = scheduled.filter((a) => a.startsAt.getTime() < now.getTime() - 3600_000).length;
  const todayStaged = today.filter((a) => !!a.stagedSpot).length;

  const unpaidTotal = unpaidRows.reduce((s, p) => s + Number(p.amount) + Number(p.applicationFeeAmount ?? 0) + Number(p.taxAmount ?? 0) + Number(p.shippingAmount ?? 0), 0);
  const unpaidPeople = new Set(unpaidRows.map((p) => p.clerkUserId)).size;
  const weekSales = Number(weekAgg?._sum.amount ?? 0);

  const liveIds = liveAuctions.map((a) => a.id);
  const raisedRows = liveIds.length
    ? await prisma.item.groupBy({ by: ["auctionId"], where: { auctionId: { in: liveIds }, status: { in: [...soldStatuses, "ACTIVE"] } }, _sum: { currentBid: true } })
    : [];
  const raisedBy = new Map(raisedRows.map((r) => [r.auctionId, Number(r._sum.currentBid ?? 0)]));
  const hoursLeft = (d: Date) => (d.getTime() - now.getTime()) / 36e5;

  const jobs: Job[] = [];
  if (ownerish && unpaidTotal > 0) {
    jobs.push({ href: "/admin/winners", count: fmtMoney0(unpaidTotal), label: "Money not collected", sub: `${unpaidPeople} ${unpaidPeople === 1 ? "person" : "people"}`, tone: "red" });
  }
  if (today.length > 0) {
    jobs.push({ href: "/admin/pickup", count: today.length, label: `Pickup${today.length !== 1 ? "s" : ""} today`, sub: `${todayStaged} of ${today.length} staged`, tone: todayStaged < today.length ? "amber" : "green" });
  }
  if (late > 0) {
    jobs.push({ href: "/admin/pickup", count: late, label: "Late pickups", sub: "Booked, over an hour past, not picked up", tone: "red" });
  }
  if (readyNoAppt > 0) {
    jobs.push({ href: "/admin/pickup?tab=waiting", count: readyNoAppt, label: "Paid, not booked", sub: "Lots paid for with no pickup time yet", tone: "amber" });
  }
  if (activeTransfers > 0) {
    jobs.push({ href: "/admin/pickup?tab=transfers", count: activeTransfers, label: "Transfers to move", sub: "Lots going between warehouses", tone: "amber" });
  }

  return (
    <>
      <PusherRefresh channel="auctions" event="auction-updated" />

      <PageHeader
        eyebrow={now.toLocaleDateString("en-US", { timeZone: "America/Detroit", weekday: "long", month: "long", day: "numeric" })}
        title="Today"
        actions={
          <>
            <BtnLink href="/admin/items/new" variant="outline" size="sm">Add a lot</BtnLink>
            <BtnLink href="/admin/auctions/new" size="sm">New auction</BtnLink>
          </>
        }
      />

      <PageBody>
        {jobs.length > 0 ? (
          <div className="space-y-2.5">
            {jobs.map((j) => <ActionCard key={j.href + j.label} {...j} />)}
          </div>
        ) : (
          <p className="text-[#8a7559]">Nothing needs you right now.</p>
        )}

        {liveAuctions.length > 0 && (
          <Panel title="Live now">
            <ul className="divide-y divide-[#f0e6d6]">
              {liveAuctions.map((a) => {
                const h = hoursLeft(a.endAt);
                const total = Math.max(1, a.endAt.getTime() - a.startAt.getTime());
                const elapsed = Math.min(1, Math.max(0, (now.getTime() - a.startAt.getTime()) / total));
                const closingSoon = h <= 24;
                return (
                  <li key={a.id}>
                    <Link href={`/admin/auctions/${a.id}`} className="block px-4 py-3.5 min-h-[56px] hover:bg-[#faf5ea] active:bg-[#f4ede1] transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-[17px] text-[#241a12] leading-tight truncate">{a.title}</div>
                          <div className="text-[15px] text-[#8a7559] mt-0.5">{fmtMoney0(raisedBy.get(a.id) ?? 0)} bid so far · {a._count.items} lot{a._count.items !== 1 ? "s" : ""}</div>
                        </div>
                        <Pill tone={closingSoon ? "red" : "green"} dot>{h < 1 ? "< 1 hr" : h < 48 ? `${Math.round(h)} hr` : `${Math.round(h / 24)} days`}</Pill>
                      </div>
                      <Progress value={elapsed} tone={closingSoon ? "red" : "green"} className="mt-2.5" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}

        {upcomingAuctions.length > 0 && (
          <Panel title="On deck">
            <div className="divide-y divide-[#f0e6d6]">
              {upcomingAuctions.map((a) => (
                <Row
                  key={a.id}
                  href={`/admin/auctions/${a.id}`}
                  title={a.title}
                  sub={`${a._count.items} lot${a._count.items !== 1 ? "s" : ""} · opens ${a.startAt.toLocaleDateString("en-US", { timeZone: "America/Detroit", weekday: "short", month: "short", day: "numeric" })}`}
                  trailing={<Pill tone="slate">Draft</Pill>}
                />
              ))}
            </div>
          </Panel>
        )}

        {ownerish && (
          <div className="sm:max-w-xs">
            <StatCard label="Sold this week" value={fmtMoney0(weekSales)} href="/admin/reports" />
          </div>
        )}
      </PageBody>
    </>
  );
}
