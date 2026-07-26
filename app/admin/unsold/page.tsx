export const dynamic = "force-dynamic";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { requireUserOrg } from "@/lib/auth";
import RelistControl from "../RelistControl";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default async function UnsoldPage() {
  const membership = await requireUserOrg();
  const orgId = membership.organization.id;

  const [items, relistTargets] = await Promise.all([
    prisma.item.findMany({
      where: { organizationId: orgId, status: "UNSOLD" },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        currentBid: true,
        storageLocation: true,
        photos: { orderBy: [{ isPrimary: "desc" }, { order: "asc" }], take: 1, select: { url: true } },
        location: { select: { name: true } },
        auction: { select: { id: true, title: true } },
      },
    }),
    prisma.auction.findMany({
      where: { organizationId: orgId, status: { in: ["DRAFT", "OPEN", "CLOSING"] } },
      orderBy: [{ startAt: "asc" }],
      select: { id: true, title: true, status: true },
    }),
  ]);

  // Group by the auction the item didn't sell in.
  const groups = new Map<string, { title: string; auctionId: string | null; items: typeof items }>();
  for (const it of items) {
    const key = it.auction?.id ?? "none";
    const g = groups.get(key) ?? { title: it.auction?.title ?? "No auction", auctionId: it.auction?.id ?? null, items: [] };
    g.items.push(it);
    groups.set(key, g);
  }
  const grouped = [...groups.values()];

  return (
    <>
      <header className="border-b border-slate-200 bg-white px-4 sm:px-8 py-3.5">
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">Unsold items</h1>
        <p className="text-sm text-slate-500 mt-1">
          Everything that didn&apos;t sell. Relist an item straight into another auction, or save it to drafts for later.
        </p>
      </header>

      <div className="px-4 sm:px-8 py-5 space-y-5 max-w-3xl w-full">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            Nothing unsold right now — every item found a buyer. 🎉
          </div>
        ) : (
          grouped.map((g) => (
            <div key={g.auctionId ?? "none"} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-slate-900 truncate">
                  {g.title} <span className="text-slate-400 font-semibold">({g.items.length})</span>
                </h2>
                {g.auctionId && (
                  <Link href={`/admin/auctions/${g.auctionId}`} className="text-xs font-bold text-[#6c4d39] hover:underline shrink-0">
                    Manage auction →
                  </Link>
                )}
              </div>
              <ul className="divide-y divide-slate-100">
                {g.items.map((u) => {
                  const photo = u.photos[0]?.url ?? null;
                  const warehouse = u.location?.name ?? null;
                  const high = Number(u.currentBid);
                  return (
                    <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                      {photo ? (
                        <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-white ring-1 ring-slate-200">
                          <Image src={photo} alt="" fill sizes="44px" className="object-contain p-0.5" />
                        </div>
                      ) : (
                        <div className="w-11 h-11 rounded-lg bg-slate-100 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900 truncate">{u.title}</div>
                        <div className="text-xs text-slate-400 truncate">
                          {(warehouse || u.storageLocation)
                            ? `📍 ${[warehouse, u.storageLocation].filter(Boolean).join(" · ")}`
                            : "No location set"}
                          {high > 0 ? ` · high bid ${money(high)}` : ""}
                        </div>
                      </div>
                      <RelistControl itemId={u.id} targets={relistTargets} />
                      <Link href={`/admin/items/${u.id}`} className="shrink-0 text-xs font-bold text-[#6c4d39] px-1">
                        Edit
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </>
  );
}
