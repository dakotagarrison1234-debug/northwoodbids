import { prisma } from "@/lib/prisma";
import type { LItem, LabelOpts, LabelState, Row } from "@/lib/labelPdf";

/**
 * The ship-box pull list (label `type=bundle`): the lots in one buyer's box,
 * grouped by warehouse + shelf while they still need pulling, flat once
 * they're all gathered. Shared by GET /api/admin/label?type=bundle (one box)
 * and GET /api/admin/shipping/pull-list.pdf?ids= (a stack of them).
 *
 * Returns one LabelOpts per id, in the order given; ids that aren't this
 * org's boxes are left out.
 */
const fmtDate = (d: Date | null | undefined) =>
  d ? d.toLocaleString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric", year: "numeric" }) : "";

export async function bundlePullLists(ids: string[], orgId: string): Promise<LabelOpts[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.shippingBundle.findMany({
    where: { id: { in: ids }, organizationId: orgId },
    select: {
      id: true, clerkUserId: true, shipName: true, shipCity: true, shipState: true, weightOz: true, boxCode: true,
      packedWeightOz: true, packedBoxCode: true, closedAt: true, closesAt: true, status: true,
      items: {
        select: { title: true, itemCode: true, grabbedAt: true, storageLocation: true, location: { select: { name: true } } },
        orderBy: { itemCode: "asc" },
      },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const userIds = [...new Set(rows.map((r) => r.clerkUserId))];
  const profiles = userIds.length
    ? await prisma.bidderProfile.findMany({ where: { clerkUserId: { in: userIds } }, select: { clerkUserId: true, name: true, email: true } })
    : [];
  const profileOf = new Map(profiles.map((p) => [p.clerkUserId, p]));

  const out: LabelOpts[] = [];
  for (const id of ids) {
    const b = byId.get(id);
    if (!b) continue;
    const profile = profileOf.get(b.clerkUserId);
    const allGathered = b.items.length > 0 && b.items.every((i) => i.grabbedAt != null);
    const state: LabelState = allGathered || b.status === "SHIPPED" || b.status === "DELIVERED" ? "GATHERED" : "TO GATHER";
    const oz = b.packedWeightOz ?? b.weightOz;
    const rows: Row[] = [
      { label: "Ship to", value: `${b.shipCity}, ${b.shipState}` },
      { label: "Box", value: b.packedBoxCode ?? b.boxCode ?? "-" },
      { label: "Weight", value: `${Math.floor(oz / 16)} lb ${oz % 16} oz` },
      { label: "Closed", value: fmtDate(b.closedAt ?? b.closesAt) },
    ];
    const items: LItem[] = b.items.map((i) => ({ code: i.itemCode, title: i.title, shelf: i.storageLocation, warehouse: i.location?.name, gathered: i.grabbedAt != null }));
    out.push({
      type: "SHIP", state, name: profile?.name ?? b.shipName ?? "Bidder", email: profile?.email, rows, count: b.items.length, items,
    });
  }
  return out;
}
