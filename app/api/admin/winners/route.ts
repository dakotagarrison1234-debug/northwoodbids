export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

/**
 * Winners & Payments data, aggregated IN THE DATABASE.
 *
 * The previous version pulled up to 3,000 bids, 3,000 active bids and 3,000
 * payments into memory and did every total, grouping and search client-side. That
 * works at 50 winners and falls over at 1,000 — the page would ship megabytes of
 * JSON and then block the main thread grouping it.
 *
 * Now: every headline number and leaderboard is a groupBy, and the wins feed is
 * paginated. Response size is constant no matter how big the business gets.
 */

const PAGE = 25;
const LEADERS = 8;

const n = (d: unknown) => (d == null ? 0 : Number(d));

export async function GET(req: NextRequest) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;

  const url = req.nextUrl.searchParams;
  const q = (url.get("q") ?? "").trim();
  const skip = Math.max(0, Number(url.get("skip") ?? 0));
  const filter = url.get("filter") ?? "all"; // all | unpaid | paid

  const itemScope = { item: { organizationId: orgId } };

  // ── Search: resolve matching bidders first (bids have no name to match on) ──
  let searchUserIds: string[] | null = null;
  if (q) {
    const matches = await prisma.bidderProfile.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      },
      select: { clerkUserId: true },
      take: 500,
    });
    searchUserIds = matches.map((m) => m.clerkUserId);
  }

  const winsWhere = {
    status: "WON" as const,
    ...itemScope,
    ...(q
      ? {
          OR: [
            { clerkUserId: { in: searchUserIds ?? [] } },
            { item: { organizationId: orgId, title: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [
    wonAgg,
    winnerRows,
    owedRows,
    topSpend,
    topWins,
    topBids,
    biggestWin,
    liveLeaders,
    totalWins,
  ] = await Promise.all([
    prisma.bid.aggregate({ where: { status: "WON", ...itemScope }, _sum: { amount: true }, _count: true }),
    // Distinct winners — counted, not listed.
    prisma.bid.findMany({
      where: { status: "WON", ...itemScope },
      distinct: ["clerkUserId"],
      select: { clerkUserId: true },
    }),
    prisma.payment.groupBy({
      by: ["clerkUserId"],
      where: { ...itemScope, status: { in: ["PENDING", "FAILED"] }, comped: false },
      _sum: { amount: true, applicationFeeAmount: true, taxAmount: true },
      _count: true,
    }),
    // ── Leaderboards ──
    prisma.bid.groupBy({
      by: ["clerkUserId"],
      where: { status: "WON", ...itemScope },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: LEADERS,
    }),
    prisma.bid.groupBy({
      by: ["clerkUserId"],
      where: { status: "WON", ...itemScope },
      _count: { _all: true },
      orderBy: { _count: { clerkUserId: "desc" } },
      take: LEADERS,
    }),
    prisma.bid.groupBy({
      by: ["clerkUserId"],
      where: itemScope,
      _count: { _all: true },
      orderBy: { _count: { clerkUserId: "desc" } },
      take: LEADERS,
    }),
    prisma.bid.findFirst({
      where: { status: "WON", ...itemScope },
      orderBy: { amount: "desc" },
      select: { amount: true, clerkUserId: true, item: { select: { title: true } } },
    }),
    // Who's currently leading live items, and by how much.
    prisma.bid.groupBy({
      by: ["clerkUserId"],
      where: { status: "ACTIVE", ...itemScope },
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: "desc" } },
      take: LEADERS,
    }),
    prisma.bid.count({ where: winsWhere }),
  ]);

  // ── The wins feed (paginated) ──
  const wins = await prisma.bid.findMany({
    where: winsWhere,
    orderBy: { placedAt: "desc" },
    skip,
    take: PAGE,
    select: {
      id: true,
      amount: true,
      clerkUserId: true,
      placedAt: true,
      item: {
        select: {
          id: true, title: true, auctionId: true,
          auction: { select: { title: true } },
          photos: { select: { url: true }, orderBy: { isPrimary: "desc" }, take: 1 },
        },
      },
    },
  });

  // Payment state for exactly the items on this page — not the whole table.
  const pageItemIds = wins.map((w) => w.item?.id).filter(Boolean) as string[];
  const pagePayments = pageItemIds.length
    ? await prisma.payment.findMany({
        where: { itemId: { in: pageItemIds } },
        select: { itemId: true, clerkUserId: true, status: true, comped: true },
      })
    : [];
  const payKey = new Map(pagePayments.map((p) => [`${p.itemId}:${p.clerkUserId}`, p]));

  // ── Names for every id we're about to return ──
  const ids = [
    ...new Set([
      ...wins.map((w) => w.clerkUserId),
      ...owedRows.map((o) => o.clerkUserId),
      ...topSpend.map((t) => t.clerkUserId),
      ...topWins.map((t) => t.clerkUserId),
      ...topBids.map((t) => t.clerkUserId),
      ...liveLeaders.map((t) => t.clerkUserId),
      ...(biggestWin ? [biggestWin.clerkUserId] : []),
    ]),
  ];
  const profiles = ids.length
    ? await prisma.bidderProfile.findMany({
        where: { clerkUserId: { in: ids } },
        select: { clerkUserId: true, name: true, email: true, phone: true },
      })
    : [];
  const pmap = new Map(profiles.map((p) => [p.clerkUserId, p]));
  const nameOf = (id: string) => pmap.get(id)?.name || pmap.get(id)?.email || "Bidder";

  const owed = owedRows
    .map((o) => ({
      clerkUserId: o.clerkUserId,
      name: nameOf(o.clerkUserId),
      phone: pmap.get(o.clerkUserId)?.phone ?? "",
      email: pmap.get(o.clerkUserId)?.email ?? "",
      itemCount: o._count,
      amount:
        n(o._sum.amount) + n(o._sum.applicationFeeAmount) + n(o._sum.taxAmount),
    }))
    .sort((a, b) => b.amount - a.amount);

  const feed = wins
    .filter((w) => w.item)
    .map((w) => {
      const p = payKey.get(`${w.item!.id}:${w.clerkUserId}`);
      return {
        id: w.id,
        itemId: w.item!.id,
        title: w.item!.title,
        photo: w.item!.photos[0]?.url ?? null,
        auctionId: w.item!.auctionId,
        auctionTitle: w.item!.auction?.title ?? null,
        amount: n(w.amount),
        wonAt: w.placedAt.toISOString(),
        clerkUserId: w.clerkUserId,
        name: nameOf(w.clerkUserId),
        state: p?.comped ? "comped" : p?.status === "PAID" ? "paid" : "unpaid",
      };
    })
    .filter((f) => (filter === "unpaid" ? f.state === "unpaid" : filter === "paid" ? f.state === "paid" : true));

  return NextResponse.json({
    stats: {
      totalWon: Math.round(n(wonAgg._sum.amount) * 100) / 100,
      winCount: wonAgg._count,
      winnerCount: winnerRows.length,
      avgWin: wonAgg._count > 0 ? Math.round((n(wonAgg._sum.amount) / wonAgg._count) * 100) / 100 : 0,
      owedTotal: Math.round(owed.reduce((s, o) => s + o.amount, 0) * 100) / 100,
      owedPeople: owed.length,
      biggest: biggestWin
        ? { amount: n(biggestWin.amount), title: biggestWin.item?.title ?? "Item", name: nameOf(biggestWin.clerkUserId) }
        : null,
    },
    leaders: {
      spend: topSpend.map((t) => ({ name: nameOf(t.clerkUserId), value: n(t._sum.amount) })),
      wins: topWins.map((t) => ({ name: nameOf(t.clerkUserId), value: t._count._all })),
      bids: topBids.map((t) => ({ name: nameOf(t.clerkUserId), value: t._count._all })),
      live: liveLeaders.map((t) => ({
        name: nameOf(t.clerkUserId),
        value: n(t._sum.amount),
        items: t._count._all,
      })),
    },
    owed: owed.slice(0, 50),
    feed,
    total: totalWins,
    skip,
    page: PAGE,
  });
}
