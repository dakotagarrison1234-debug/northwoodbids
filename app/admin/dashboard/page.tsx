export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { ItemStatus } from "@prisma/client";
import { requireUserOrg } from "@/lib/auth";
import PusherRefresh from "@/app/components/PusherRefresh";
import { Panel, Pill, Empty, fmtMoney0, fmtMoney } from "../ui";

/**
 * The admin's home screen answers ONE question: what needs me right now?
 *
 * It used to show all-time totals — sales, items listed, bids placed. Those are
 * vanity numbers: true, but you can't DO anything about them, and they look
 * identical on your busiest day and your quietest. They've been replaced with
 * things that are either a job to do today or money that hasn't arrived.
 */

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 shrink-0">
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}

/** A job to do. Big count, plain sentence, whole row is the tap target. */
function ActionRow({
  href, count, label, sub, tone,
}: { href: string; count: number | string; label: string; sub: string; tone: "red" | "amber" | "green" | "slate" }) {
  const c = {
    red: { box: "bg-red-50 border-red-200", num: "text-red-600" },
    amber: { box: "bg-amber-50 border-amber-200", num: "text-amber-700" },
    green: { box: "bg-green-50 border-green-200", num: "text-green-700" },
    slate: { box: "bg-white border-slate-200", num: "text-slate-400" },
  }[tone];
  return (
    <Link href={href} className={`flex items-center gap-4 px-4 py-4 border-2 rounded-2xl ${c.box} active:scale-[0.99] transition-transform`}>
      <div className={`text-4xl font-extrabold tabular-nums w-16 text-center shrink-0 ${c.num}`}>{count}</div>
      <div className="min-w-0 flex-1">
        <div className="text-base font-bold text-slate-900 leading-tight">{label}</div>
        <div className="text-sm text-slate-500 leading-snug mt-0.5">{sub}</div>
      </div>
      <Chevron />
    </Link>
  );
}

function fmtTime(d: Date) {
  return d.toLocaleString("en-US", { timeZone: "America/Detroit", hour: "numeric", minute: "2-digit" });
}
function detroitDayKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export default async function AdminDashboard() {
  const membership = await requireUserOrg();
  const orgId = membership.organization.id;
  const now = new Date();
  const soldStatuses: ItemStatus[] = ["SOLD", "PENDING_PICKUP", "PICKED_UP"];

  const [liveAuctions, todayAppts, unpaidRows, readyNoAppt, activeTransfers, weekAgg] =
    await Promise.all([
      prisma.auction.findMany({
        where: { organizationId: orgId, status: { in: ["OPEN", "CLOSING"] } },
        orderBy: { endAt: "asc" },
        include: { _count: { select: { items: true } } },
      }),
      // Today's pickups, in Michigan time.
      prisma.pickupAppointment.findMany({
        where: { organizationId: orgId, status: "SCHEDULED" },
        orderBy: { startsAt: "asc" },
        include: { location: { select: { name: true } }, items: { select: { id: true } } },
      }),
      // Money that hasn't landed. Comps aren't money, so they're excluded.
      prisma.payment.findMany({
        where: {
          item: { organizationId: orgId },
          status: { in: ["PENDING", "FAILED"] },
          comped: false,
        },
        select: { amount: true, applicationFeeAmount: true, taxAmount: true, clerkUserId: true },
      }),
      // Paid and waiting, but nobody's booked a time yet.
      prisma.item.count({
        where: { organizationId: orgId, status: "PENDING_PICKUP", pickupAppointmentId: null },
      }),
      prisma.transferRequest.count({
        where: { organizationId: orgId, status: { in: ["REQUESTED", "LOADED"] } },
      }),
      // Last 7 days of real sales — the only "how are we doing" number worth keeping.
      prisma.payment.aggregate({
        where: {
          item: { organizationId: orgId },
          status: "PAID",
          comped: false,
          createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
        _sum: { amount: true },
      }),
    ]);

  const todayKey = detroitDayKey(now);
  const today = todayAppts.filter((a) => detroitDayKey(a.startsAt) === todayKey);
  const todayUnstaged = today.filter((a) => !a.stagedSpot).length;

  const unpaidTotal = unpaidRows.reduce(
    (s, p) => s + Number(p.amount) + Number(p.applicationFeeAmount ?? 0) + Number(p.taxAmount ?? 0),
    0
  );
  const unpaidPeople = new Set(unpaidRows.map((p) => p.clerkUserId)).size;
  const weekSales = Number(weekAgg._sum.amount ?? 0);

  // Sum sold-item value per live auction in one grouped query.
  const liveIds = liveAuctions.map((a) => a.id);
  const raisedRows = liveIds.length
    ? await prisma.item.groupBy({
        by: ["auctionId"],
        where: { auctionId: { in: liveIds }, status: { in: [...soldStatuses, "ACTIVE"] } },
        _sum: { currentBid: true },
      })
    : [];
  const raisedBy = new Map(raisedRows.map((r) => [r.auctionId, Number(r._sum.currentBid ?? 0)]));

  const hoursLeft = (d: Date) => (d.getTime() - now.getTime()) / 36e5;

  return (
    <>
      <PusherRefresh channel="auctions" event="auction-updated" />

      <header className="border-b border-slate-200 bg-white px-4 sm:px-8 py-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900">Today</h1>
          <p className="text-sm text-slate-500">
            {now.toLocaleDateString("en-US", { timeZone: "America/Detroit", weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <Link
          href="/admin/auctions/new"
          className="shrink-0 inline-flex items-center justify-center min-h-[48px] px-5 rounded-xl bg-slate-900 text-white font-bold text-base"
        >
          + Auction
        </Link>
      </header>

      <div className="px-4 sm:px-8 py-5 space-y-5 max-w-2xl w-full">

        {/* ── What needs you ── ordered by urgency, not by category ── */}
        <div className="space-y-2.5">
          {unpaidTotal > 0 && (
            <ActionRow
              href="/admin/winners"
              count={fmtMoney0(unpaidTotal)}
              label="Money not collected"
              sub={`${unpaidPeople} ${unpaidPeople === 1 ? "person hasn't" : "people haven't"} paid — card declined or pending`}
              tone="red"
            />
          )}

          <ActionRow
            href="/admin/pickup"
            count={today.length}
            label={today.length === 0 ? "No pickups today" : `Pickup${today.length !== 1 ? "s" : ""} today`}
            sub={
              today.length === 0
                ? "Nothing scheduled for today"
                : todayUnstaged > 0
                ? `${todayUnstaged} still need staging`
                : "All staged and ready"
            }
            tone={today.length === 0 ? "slate" : todayUnstaged > 0 ? "amber" : "green"}
          />

          {readyNoAppt > 0 && (
            <ActionRow
              href="/admin/pickup"
              count={readyNoAppt}
              label="Paid, waiting to be booked"
              sub="Winners who haven't picked a pickup time yet"
              tone="amber"
            />
          )}

          {activeTransfers > 0 && (
            <ActionRow
              href="/admin/pickup"
              count={activeTransfers}
              label="Transfers to move"
              sub="Items waiting to go between warehouses"
              tone="amber"
            />
          )}
        </div>

        {/* ── Today's schedule ── the actual shift, at a glance ── */}
        {today.length > 0 && (
          <Panel
            title="Today's schedule"
            action={<Link href="/admin/pickup" className="text-base font-bold text-slate-600 px-2 py-2">Open</Link>}
          >
            <ul className="divide-y divide-slate-100">
              {today.slice(0, 6).map((a) => (
                <li key={a.id} className="px-4 py-3 flex items-center gap-3">
                  <span className="w-16 shrink-0 font-extrabold text-slate-900 tabular-nums">
                    {fmtTime(a.startsAt)}
                  </span>
                  <span className="min-w-0 flex-1 text-slate-600 truncate">
                    {a.items.length} item{a.items.length !== 1 ? "s" : ""} · {a.location.name}
                  </span>
                  {a.stagedSpot ? (
                    <Pill tone="green">{a.stagedSpot}</Pill>
                  ) : (
                    <Pill tone="amber">Stage</Pill>
                  )}
                </li>
              ))}
            </ul>
            {today.length > 6 && (
              <div className="px-4 py-2.5 text-sm text-slate-500 border-t border-slate-100">
                +{today.length - 6} more today
              </div>
            )}
          </Panel>
        )}

        {/* ── Live auctions ── with time pressure made obvious ── */}
        <Panel
          title="Live auctions"
          action={<Link href="/admin/auctions" className="text-base font-bold text-slate-600 px-2 py-2">All</Link>}
        >
          {liveAuctions.length === 0 ? (
            <Empty
              text="Nothing live right now."
              action={
                <Link href="/admin/auctions/new" className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-xl bg-slate-900 text-white font-bold text-base">
                  Create an auction
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {liveAuctions.map((a) => {
                const h = hoursLeft(a.endAt);
                const closingSoon = h <= 24;
                return (
                  <li key={a.id}>
                    <Link href={`/admin/auctions/${a.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 truncate">{a.title}</div>
                        <div className="text-sm text-slate-500 mt-0.5">
                          {a._count.items} items · {fmtMoney0(raisedBy.get(a.id) ?? 0)} bid so far
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <Pill tone={closingSoon ? "red" : "green"}>
                          {h < 1 ? "< 1 hr" : h < 48 ? `${Math.round(h)} hr` : `${Math.round(h / 24)} days`}
                        </Pill>
                      </div>
                      <Chevron />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* ── One health number, not four ── */}
        <Link
          href="/admin/reports"
          className="flex items-center justify-between gap-3 bg-slate-900 text-white rounded-2xl px-5 py-4 active:scale-[0.99] transition-transform"
        >
          <div>
            <div className="text-sm font-bold uppercase tracking-wider text-slate-400">Sold this week</div>
            <div className="text-3xl font-extrabold mt-0.5 tabular-nums">{fmtMoney(weekSales)}</div>
          </div>
          <span className="text-base font-bold text-slate-300">Reports ›</span>
        </Link>
      </div>
    </>
  );
}
