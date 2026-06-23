"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import ItemStatusButton from "@/app/components/ItemStatusButton";
import RefundButton from "@/app/components/RefundButton";
import StatusPill from "@/app/components/StatusPill";
import { money } from "@/lib/format";

export type LeaderItem = { id: string; title: string; photo: string | null; amount: number };
export type Leader = {
  clerkUserId: string;
  name: string;
  email: string | null;
  phone: string | null;
  total: number;
  items: LeaderItem[];
};
export type WinItem = {
  id: string;
  title: string;
  photo: string | null;
  amount: number;
  paid: boolean;
  status: string;
  auctionId: string | null;
  paymentId: string | null;
};
export type Winner = {
  clerkUserId: string;
  name: string;
  email: string | null;
  phone: string | null;
  total: number;
  unpaid: number;
  items: WinItem[];
};

const PAGE = 25; // bidders rendered before "show more"
const THUMBS = 6; // tiny previews shown in a collapsed row

function matches(q: string, name: string, email: string | null, phone: string | null, titles: string[]) {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return [name, email, phone, ...titles].filter(Boolean).join(" ").toLowerCase().includes(t);
}

// Tiny preview strip — small on purpose so hundreds of rows stay light.
function Thumbs({ items }: { items: { id: string; title: string; photo: string | null }[] }) {
  const shown = items.slice(0, THUMBS);
  const extra = items.length - shown.length;
  return (
    <div className="flex items-center gap-1.5 mt-2">
      {shown.map((it) => (
        <Link
          key={it.id}
          href={`/admin/items/${it.id}`}
          onClick={(e) => e.stopPropagation()}
          className="relative w-8 h-8 rounded-md overflow-hidden bg-[#efe3d0] border border-[#e3d6bf] shrink-0"
          title={it.title}
        >
          {it.photo ? (
            <Image src={it.photo} alt="" fill sizes="32px" className="object-cover" />
          ) : null}
        </Link>
      ))}
      {extra > 0 && (
        <span className="text-xs text-[#8a7559] font-semibold ml-0.5">+{extra}</span>
      )}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full sm:max-w-sm bg-white border border-[#cdbda3] rounded-xl px-4 py-2.5 text-base text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39] mb-4"
    />
  );
}

function LeadingBids({ leaders }: { leaders: Leader[] }) {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(
    () => leaders.filter((l) => matches(q, l.name, l.email, l.phone, l.items.map((i) => i.title))),
    [leaders, q]
  );
  const shown = filtered.slice(0, limit);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold">Current Leading Bids</h2>
        <span className="text-sm text-[#8a7559]">{leaders.length} bidder{leaders.length !== 1 ? "s" : ""}</span>
      </div>

      {leaders.length === 0 ? (
        <p className="text-base text-[#8a7559]">No active bids yet.</p>
      ) : (
        <>
          <SearchBox value={q} onChange={(v) => { setQ(v); setLimit(PAGE); }} placeholder="Search bidder or item…" />
          <div className="space-y-2">
            {shown.map((l) => (
              <div key={l.clerkUserId} className="bg-white border border-[#e3d6bf] rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-[#241a12] truncate">{l.name}</div>
                  <div className="text-xs text-[#8a7559] truncate">{l.email || l.phone || "—"}</div>
                  <Thumbs items={l.items} />
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-[#6c4d39] leading-none">{money(l.total)}</div>
                  <div className="text-xs text-[#8a7559] mt-1">{l.items.length} item{l.items.length !== 1 ? "s" : ""}</div>
                </div>
              </div>
            ))}
          </div>
          {filtered.length === 0 && <p className="text-base text-[#8a7559] mt-2">No matches.</p>}
          {filtered.length > limit && (
            <button
              onClick={() => setLimit((n) => n + PAGE)}
              className="mt-3 w-full sm:w-auto bg-white border border-[#cdbda3] hover:bg-[#efe3d0] text-[#241a12] font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
            >
              Show more ({filtered.length - limit} left)
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ConfirmedWinners({ winners }: { winners: Winner[] }) {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(
    () => winners.filter((w) => matches(q, w.name, w.email, w.phone, w.items.map((i) => i.title))),
    [winners, q]
  );
  const shown = filtered.slice(0, limit);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold">Confirmed Winners</h2>
        <span className="text-sm text-[#8a7559]">{winners.length} winner{winners.length !== 1 ? "s" : ""}</span>
      </div>

      {winners.length === 0 ? (
        <p className="text-base text-[#8a7559]">No confirmed winners yet — winners are set when an auction closes.</p>
      ) : (
        <>
          <SearchBox value={q} onChange={(v) => { setQ(v); setLimit(PAGE); }} placeholder="Search winner or item…" />
          <div className="space-y-2">
            {shown.map((w) => {
              const open = openId === w.clerkUserId;
              return (
                <div key={w.clerkUserId} className="bg-white border border-[#e3d6bf] rounded-xl overflow-hidden">
                  <button
                    onClick={() => setOpenId(open ? null : w.clerkUserId)}
                    className="w-full px-4 py-3 flex items-start justify-between gap-3 text-left hover:bg-[#efe3d0]/40 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-[#241a12] truncate">{w.name}</div>
                      <div className="text-xs text-[#8a7559] truncate">{w.email || w.phone || "—"}</div>
                      <Thumbs items={w.items} />
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-[#6c4d39] leading-none">{money(w.total)}</div>
                      <div className="mt-1">
                        {w.unpaid > 0 ? (
                          <span className="text-xs font-bold uppercase tracking-wide bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">{w.unpaid} unpaid</span>
                        ) : (
                          <span className="text-xs font-bold uppercase tracking-wide bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">All paid</span>
                        )}
                      </div>
                      <div className="text-xs text-[#8a7559] mt-1">
                        {w.items.length} item{w.items.length !== 1 ? "s" : ""} {open ? "▴" : "▾"}
                      </div>
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-[#e3d6bf] divide-y divide-[#efe3d0]">
                      {w.items.map((it) => (
                        <div key={it.id} className="px-4 py-3 flex items-center gap-3">
                          <Link href={`/admin/items/${it.id}`} className="relative w-12 h-12 rounded-lg overflow-hidden bg-[#efe3d0] border border-[#e3d6bf] shrink-0">
                            {it.photo ? <Image src={it.photo} alt="" fill sizes="48px" className="object-cover" /> : null}
                          </Link>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-[#241a12] truncate">{it.title}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[#6c4d39] font-bold text-sm">{money(it.amount)}</span>
                              <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${it.paid ? "bg-green-100 text-green-700 border-green-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}>
                                {it.paid ? "Paid" : "Unpaid"}
                              </span>
                              <StatusPill status={it.status} />
                            </div>
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-1.5">
                            <ItemStatusButton itemId={it.id} currentStatus={it.status} />
                            {it.paid && it.auctionId && (
                              <Link
                                href={`/invoice/${it.auctionId}?user=${encodeURIComponent(w.clerkUserId)}`}
                                className="text-xs text-[#6c4d39] hover:text-[#c47b3e] font-medium underline"
                              >
                                Receipt
                              </Link>
                            )}
                            {it.paid && it.paymentId && (
                              <RefundButton paymentId={it.paymentId} amount={it.amount} winnerName={w.name} />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {filtered.length === 0 && <p className="text-base text-[#8a7559] mt-2">No matches.</p>}
          {filtered.length > limit && (
            <button
              onClick={() => setLimit((n) => n + PAGE)}
              className="mt-3 w-full sm:w-auto bg-white border border-[#cdbda3] hover:bg-[#efe3d0] text-[#241a12] font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
            >
              Show more ({filtered.length - limit} left)
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function WinnersBoard({ leaders, winners }: { leaders: Leader[]; winners: Winner[] }) {
  return (
    <>
      <ConfirmedWinners winners={winners} />
      <LeadingBids leaders={leaders} />
    </>
  );
}
