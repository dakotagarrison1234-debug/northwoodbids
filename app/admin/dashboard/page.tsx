export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { ItemStatus } from "@prisma/client";
import { requireUserOrg } from "@/lib/auth";
import PusherRefresh from "@/app/components/PusherRefresh";
import { Panel, Pill, Empty, ActionCard, PageHeader, PageBody, BtnLink, Progress, Eyebrow } from "../ui";
// Formatters come from the server-safe module — importing them from ui.tsx
// ("use client") makes them client references and they throw when called here.
import { fmtMoney0, fmtMoney } from "../format";

/**
 * Today — the admin's home. One question: what needs me right now?
 * Jobs first (ordered by urgency), then the shift (today's pickups), then what's
 * live, then one honest health number. No vanity totals.
 */

function fmtTime(d: Date) {
  return d.toLocaleString("en-US", { timeZone: "America/Detroit", hour: "numeric", minute: "2-digit" });
}
function detroitDayKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", hour: "numeric", hour12: false }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function AdminDashboard() {
  const membership = await requireUserOrg();
  const orgId = membership.organization.id;
  const now = new Date();
  const soldStatuses: ItemStatus[] = ["SOLD", "PENDING_PICKUP", "PICKED_UP"];
  const dayStart = (() => {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(now);
    const m: Record<string, number> = {}; for (const x of p) if (x.type !== "literal") m[x.type] = Number(x.value);
    const hour = m.hour === 24 ? 0 : m.hour;
    return new Date(now.getTime() - (((hour * 60 + m.minute) * 60 + m.second) * 1000 + now.getMilliseconds()));
  })();

  const [liveAuctions, upcomingAuctions, scheduled, unpaidRows, readyNoAppt, activeTransfers, weekAgg, bidsToday, newBiddersWeek, liveGiveaways] =
    await Promise.all([
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
        orderBy: { startsAt: "asc" },
        include: { location: { select: { name: true } }, items: { select: { id: true } } },
      }),
      prisma.payment.findMany({
        where: { item: { organizationId: orgId }, status: { in: ["PENDING", "FAILED"] }, comped: false },
        select: { amount: true, applicationFeeAmount: true, taxAmount: true, clerkUserId: true },
      }),
      prisma.item.count({ where: { organizationId: orgId, status: "PENDING_PICKUP", pickupAppointmentId: null, transferRequestId: null } }),
      prisma.transferRequest.count({ where: { organizationId: orgId, status: { in: ["REQUESTED", "LOADED"] } } }),
      prisma.payment.aggregate({
        where: { item: { organizationId: orgId }, status: "PAID", comped: false, createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } },
        _sum: { amount: true },
      }),
      prisma.bid.count({ where: { item: { organizationId: orgId }, placedAt: { gte: dayStart } } }),
      prisma.bidderProfile.count({ where: { createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } } }),
      prisma.giveaway.count({ where: { organizationId: orgId, status: { in: ["ACTIVE", "ENDED"] }, archived: false } }),
    ]);

  const todayKey = detroitDayKey(now);
  const today = scheduled.filter((a) => detroitDayKey(a.startsAt) === todayKey);
  const late = scheduled.filter((a) => a.startsAt.getTime() < now.getTime() - 3600_000).length;
  const todayUnstaged = today.filter((a) => !a.stagedSpot).length;

  const unpaidTotal = unpaidRows.reduce((s, p) => s + Number(p.amount) + Number(p.applicationFeeAmount ?? 0) + Number(p.taxAmount ?? 0), 0);
  const unpaidPeople = new Set(unpaidRows.map((p) => p.clerkUserId)).size;
  const weekSales = Number(weekAgg._sum.amount ?? 0);

  const liveIds = liveAuctions.map((a) => a.id);
  const raisedRows = liveIds.length
    ? await prisma.item.groupBy({ by: ["auctionId"], where: { auctionId: { in: liveIds }, status: { in: [...soldStatuses, "ACTIVE"] } }, _sum: { currentBid: true } })
    : [];
  const raisedBy = new Map(raisedRows.map((r) => [r.auctionId, Number(r._sum.currentBid ?? 0)]));
  const hoursLeft = (d: Date) => (d.getTime() - now.getTime()) / 36e5;

  const jobs = [
    unpaidTotal > 0 && { href: "/admin/winners", count: fmtMoney0(unpaidTotal), label: "Money not collected", sub: `${unpaidPeople} ${unpaidPeople === 1 ? "person hasn't" : "people haven't"} paid — card declined or pending`, tone: "red" as const },
    late > 0 && { href: "/admin/pickup", count: late, label: "Late pickups", sub: "Booked, more than an hour past, not marked collected", tone: "red" as const },
    { href: "/admin/pickup", count: today.length, label: today.length === 0 ? "No pickups today" : `Pickup${today.length !== 1 ? "s" : ""} today`, sub: today.length === 0 ? "Nothing scheduled for today" : todayUnstaged > 0 ? `${todayUnstaged} still need staging` : "All staged and ready", tone: (today.length === 0 ? "slate" : todayUnstaged > 0 ? "amber" : "green") as "slate" | "amber" | "green" },
    readyNoAppt > 0 && { href: "/admin/pickup", count: readyNoAppt, label: "Paid, waiting to be booked", sub: "Winners who haven't picked a pickup time yet", tone: "amber" as const },
    activeTransfers > 0 && { href: "/admin/pickup", count: activeTransfers, label: "Transfers to move", sub: "Items waiting to go between warehouses", tone: "amber" as const },
  ].filter(Boolean) as { href: string; count: number | string; label: string; sub: string; tone: "red" | "amber" | "green" | "slate" }[];

  return (
    <>
      <PusherRefresh channel="auctions" event="auction-updated" />

      <PageHeader
        eyebrow={now.toLocaleDateString("en-US", { timeZone: "America/Detroit", weekday: "long", month: "long", day: "numeric" })}
        title={`${greeting(now)}.`}
        sub={jobs.filter((j) => j.tone === "red" || j.tone === "amber").length > 0 ? "A few things need you." : "Nothing's on fire. Nice."}
        actions={
          <>
            <BtnLink href="/admin/items/new" variant="outline" size="sm">Add a lot</BtnLink>
            <BtnLink href="/admin/auctions/new" size="sm">New auction</BtnLink>
          </>
        }
      />

      <PageBody wide>
        {/* Pulse strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Link href="/admin/reports" className="rounded-2xl bg-[#241a12] text-[#fbf4e6] p-4 nb-lift-sm">
            <Eyebrow className="!text-[#b9a688]">Sold this week</Eyebrow>
            <div className="font-display text-3xl font-black mt-1 tabular-nums">{fmtMoney(weekSales)}</div>
          </Link>
          <div className="rounded-2xl bg-white border border-[#e6dac6] p-4">
            <Eyebrow>Bids today</Eyebrow>
            <div className="font-display text-3xl font-black mt-1 tabular-nums text-[#241a12]">{bidsToday.toLocaleString()}</div>
          </div>
          <Link href="/admin/bidders" className="rounded-2xl bg-white border border-[#e6dac6] p-4 nb-lift-sm hover:border-[#c47b3e]/50">
            <Eyebrow>New bidders · 7d</Eyebrow>
            <div className="font-display text-3xl font-black mt-1 tabular-nums text-[#4a7c59]">+{newBiddersWeek}</div>
          </Link>
          <Link href="/admin/giveaways" className="rounded-2xl bg-white border border-[#e6dac6] p-4 nb-lift-sm hover:border-[#c47b3e]/50">
            <Eyebrow>Giveaways running</Eyebrow>
            <div className="font-display text-3xl font-black mt-1 tabular-nums text-[#241a12]">{liveGiveaways}</div>
          </Link>
        </div>

        <div className="grid lg:grid-cols-5 gap-5 items-start">
          {/* Left: jobs + schedule */}
          <div className="lg:col-span-3 space-y-5">
            <section>
              <Eyebrow className="mb-2">Needs you</Eyebrow>
              <div className="space-y-2.5">
                {jobs.map((j, i) => <ActionCard key={i} {...j} />)}
              </div>
            </section>

            {today.length > 0 && (
              <Panel title="Today's schedule" sub={`${today.length} pickup${today.length !== 1 ? "s" : ""}`} action={<Link href="/admin/pickup" className="text-sm font-bold text-[#6c4d39] px-2 py-2">Open board</Link>}>
                <ul className="divide-y divide-[#f0e6d6]">
                  {today.slice(0, 8).map((a) => {
                    const isLate = a.startsAt.getTime() < now.getTime() - 3600_000;
                    return (
                      <li key={a.id} className="px-4 py-3 flex items-center gap-3">
                        <span className={`w-[4.5rem] shrink-0 font-black tabular-nums ${isLate ? "text-[#a1321f]" : "text-[#241a12]"}`}>{fmtTime(a.startsAt)}</span>
                        <span className="min-w-0 flex-1 text-[#6f5b46] truncate">{a.items.length} item{a.items.length !== 1 ? "s" : ""} · {a.location.name}</span>
                        {isLate ? <Pill tone="red">Late</Pill> : a.stagedSpot ? <Pill tone="green">{a.stagedSpot}</Pill> : <Pill tone="amber">Stage</Pill>}
                      </li>
                    );
                  })}
                </ul>
                {today.length > 8 && <div className="px-4 py-2.5 text-sm text-[#8a7559] border-t border-[#f0e6d6]">+{today.length - 8} more today</div>}
              </Panel>
            )}
          </div>

          {/* Right: what's live */}
          <div className="lg:col-span-2 space-y-5">
            <Panel title="Live now" action={<Link href="/admin/auctions" className="text-sm font-bold text-[#6c4d39] px-2 py-2">All auctions</Link>}>
              {liveAuctions.length === 0 ? (
                <Empty text="Nothing live right now." sub="Open an auction and the board lights up." action={<BtnLink href="/admin/auctions/new" size="sm">Create an auction</BtnLink>} />
              ) : (
                <ul className="divide-y divide-[#f0e6d6]">
                  {liveAuctions.map((a) => {
                    const h = hoursLeft(a.endAt);
                    const total = Math.max(1, a.endAt.getTime() - a.startAt.getTime());
                    const elapsed = Math.min(1, Math.max(0, (now.getTime() - a.startAt.getTime()) / total));
                    const closingSoon = h <= 24;
                    return (
                      <li key={a.id}>
                        <Link href={`/admin/auctions/${a.id}`} className="block px-4 py-3.5 hover:bg-[#faf5ea]">
                          <div className="flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-[#241a12] truncate">{a.title}</div>
                              <div className="text-sm text-[#8a7559] mt-0.5">{a._count.items} lots · {fmtMoney0(raisedBy.get(a.id) ?? 0)} bid so far</div>
                            </div>
                            <Pill tone={closingSoon ? "red" : "green"} dot>{h < 1 ? "< 1 hr" : h < 48 ? `${Math.round(h)} hr` : `${Math.round(h / 24)} days`}</Pill>
                          </div>
                          <Progress value={elapsed} tone={closingSoon ? "red" : "green"} className="mt-2.5" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            {upcomingAuctions.length > 0 && (
              <Panel title="On deck">
                <ul className="divide-y divide-[#f0e6d6]">
                  {upcomingAuctions.map((a) => (
                    <li key={a.id}>
                      <Link href={`/admin/auctions/${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[#faf5ea]">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-[#241a12] truncate">{a.title}</div>
                          <div className="text-sm text-[#8a7559]">{a._count.items} lots · opens {a.startAt.toLocaleDateString("en-US", { timeZone: "America/Detroit", weekday: "short", month: "short", day: "numeric" })}</div>
                        </div>
                        <Pill tone="slate">Draft</Pill>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </div>
      </PageBody>
    </>
  );
}
