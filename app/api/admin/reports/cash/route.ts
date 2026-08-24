export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

// Cash-payments report: every in-person cash payment an admin recorded, grouped by
// customer — who paid, how much, which items/auctions, when, and who took it.
// Scoped to the org through the item; archived (test) auctions excluded. Dated by
// paidAt (when the cash was recorded).

const num = (d: unknown) => (d == null ? 0 : Number(d));
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(req: NextRequest) {
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership.organizationId;

  const range = req.nextUrl.searchParams.get("range") || "90d";
  const now = new Date();
  let from: Date | null = null;
  if (range === "7d") from = new Date(now.getTime() - 7 * 864e5);
  else if (range === "30d") from = new Date(now.getTime() - 30 * 864e5);
  else if (range === "90d") from = new Date(now.getTime() - 90 * 864e5);
  else if (range === "ytd") from = new Date(now.getFullYear(), 0, 1);

  const rows = await prisma.payment.findMany({
    where: {
      paidInCash: true,
      status: "PAID",
      item: { organizationId: orgId, OR: [{ auction: { archived: false } }, { auctionId: null }] },
      ...(from ? { paidAt: { gte: from } } : {}),
    },
    select: {
      clerkUserId: true,
      amount: true,
      applicationFeeAmount: true,
      taxAmount: true,
      paidAt: true,
      createdAt: true,
      cashNote: true,
      item: { select: { id: true, title: true, itemCode: true, auction: { select: { title: true } } } },
    },
    orderBy: { paidAt: "desc" },
    take: 5000,
  });

  type Line = {
    itemId: string; title: string; itemCode: string | null; auctionTitle: string | null;
    hammer: number; premium: number; tax: number; total: number; when: string | null; note: string | null;
  };
  type Group = {
    clerkUserId: string; name: string; email: string; phone: string;
    collected: number; items: number; lastPaidAt: string | null; lines: Line[];
  };

  const byUser = new Map<string, Group>();
  let grandCollected = 0;
  let grandItems = 0;

  for (const p of rows) {
    const hammer = num(p.amount);
    const premium = num(p.applicationFeeAmount);
    const tax = num(p.taxAmount);
    const total = hammer + premium + tax;
    grandCollected += total;
    grandItems += 1;

    let g = byUser.get(p.clerkUserId);
    if (!g) {
      g = { clerkUserId: p.clerkUserId, name: "Bidder", email: "", phone: "", collected: 0, items: 0, lastPaidAt: null, lines: [] };
      byUser.set(p.clerkUserId, g);
    }
    const when = (p.paidAt ?? p.createdAt)?.toISOString() ?? null;
    g.collected += total;
    g.items += 1;
    if (when && (!g.lastPaidAt || when > g.lastPaidAt)) g.lastPaidAt = when;
    g.lines.push({
      itemId: p.item.id,
      title: p.item.title,
      itemCode: p.item.itemCode,
      auctionTitle: p.item.auction?.title ?? null,
      hammer: r2(hammer), premium: r2(premium), tax: r2(tax), total: r2(total),
      when, note: p.cashNote,
    });
  }

  // Attach names.
  const ids = [...byUser.keys()];
  if (ids.length) {
    const profiles = await prisma.bidderProfile.findMany({
      where: { clerkUserId: { in: ids } },
      select: { clerkUserId: true, name: true, email: true, phone: true },
    });
    for (const pr of profiles) {
      const g = byUser.get(pr.clerkUserId);
      if (g) {
        g.name = pr.name || pr.email || "Bidder";
        g.email = pr.email ?? "";
        g.phone = pr.phone ?? "";
      }
    }
  }

  const groups = [...byUser.values()]
    .map((g) => ({ ...g, collected: r2(g.collected) }))
    .sort((a, b) => b.collected - a.collected);

  return NextResponse.json({
    range,
    totals: { collected: r2(grandCollected), items: grandItems, people: groups.length },
    rows: groups,
  });
}
