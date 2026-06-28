/* ───────────────────────────────────────────────────────────
   Northwood Bids — canonical status colors (plain module).
   Lives outside the "use client" StatusPill so SERVER components
   can call statusStyle() directly without it becoming a client ref.
   One source of truth for status colors across auctions, items,
   bids and payments. All rustic palette — no teal/emerald/blue.
   ─────────────────────────────────────────────────────────── */

/** Tailwind class pairs (bg + text) for every status we render. */
export const STATUS_STYLES: Record<string, string> = {
  // ── Auction statuses ──
  DRAFT: "bg-[#e7dcc6] text-[#6f5b46]", // muted tan — not started
  OPEN: "bg-[#5f7a45]/18 text-[#3f5226]", // green — live
  CLOSING: "bg-[#efe0c9] text-[#8a5a2b]", // amber — wrapping up
  CLOSED: "bg-[#dcd3c4] text-[#5a4a38]", // neutral slate — done (distinct from DRAFT)
  SETTLED: "bg-[#6c4d39]/15 text-[#563e2c]", // brown — finalized

  // ── Item statuses ──
  ACTIVE: "bg-[#5f7a45]/18 text-[#3f5226]", // green — live
  SOLD: "bg-[#6c4d39]/15 text-[#563e2c]", // brown — sold
  UNSOLD: "bg-red-50 text-red-600", // muted red — no sale
  PENDING_PICKUP: "bg-[#c47b3e]/20 text-[#8a4f1c]", // burnt orange — NEEDS ACTION
  PICKED_UP: "bg-[#3f5226] text-[#eef3e4]", // solid forest — DONE (≠ pending AND ≠ live/paid green tint)

  // ── Bid statuses ──
  // ACTIVE shared with item statuses above
  OUTBID: "bg-red-50 text-red-600",
  WON: "bg-[#6c4d39]/15 text-[#563e2c]", // brown
  CANCELLED: "bg-[#dcd3c4] text-[#7a6a55]", // neutral — not an error, just void

  // ── Payment statuses (used in admin/superadmin tables) ──
  PAID: "bg-[#5f7a45]/18 text-[#3f5226]", // green — money in (≠ SOLD's brown)
  FAILED: "bg-red-100 text-red-700", // deep red — needs attention (≠ UNSOLD)
  PENDING: "bg-[#efe0c9] text-[#8a5a2b]", // amber — awaiting
  REFUNDED: "bg-[#dcd3c4] text-[#5a4a38]", // neutral slate
};

/** Fallback style for any unknown/unexpected status (distinct from DRAFT's tan). */
const FALLBACK_STYLE = "bg-[#ece8e1] text-[#9a8a76]";

export function statusStyle(status: string): string {
  return STATUS_STYLES[status] ?? FALLBACK_STYLE;
}
