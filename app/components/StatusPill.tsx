"use client";

/* ───────────────────────────────────────────────────────────
   Northwood Bids — canonical status pill
   One source of truth for status colors across auctions, items,
   bids and payments. All rustic palette — no teal/emerald/blue.
   ─────────────────────────────────────────────────────────── */

/** Tailwind class pairs (bg + text) for every status we render. */
export const STATUS_STYLES: Record<string, string> = {
  // ── Auction statuses ──
  DRAFT: "bg-[#e7dcc6] text-[#6f5b46]", // muted brown
  OPEN: "bg-[#5f7a45]/15 text-[#47592f]", // moss
  CLOSING: "bg-[#efe0c9] text-[#8a5a2b]", // amber-brown
  CLOSED: "bg-[#e7dcc6] text-[#6f5b46]",
  SETTLED: "bg-[#6c4d39]/15 text-[#563e2c]", // brown

  // ── Item statuses ──
  ACTIVE: "bg-[#5f7a45]/15 text-[#47592f]", // moss
  SOLD: "bg-[#6c4d39]/15 text-[#563e2c]", // brown
  UNSOLD: "bg-red-50 text-red-600", // muted red
  PENDING_PICKUP: "bg-[#efe0c9] text-[#8a5a2b]", // amber-brown
  PICKED_UP: "bg-[#efe3d0] text-[#4a3a2b]",

  // ── Bid statuses ──
  // ACTIVE shared with item statuses above
  OUTBID: "bg-red-50 text-red-600",
  WON: "bg-[#6c4d39]/15 text-[#563e2c]", // brown
  CANCELLED: "bg-red-50 text-red-600", // muted red

  // ── Payment statuses (used in admin/superadmin tables) ──
  PAID: "bg-[#6c4d39]/15 text-[#563e2c]",
  FAILED: "bg-red-50 text-red-600",
  PENDING: "bg-[#efe0c9] text-[#8a5a2b]",
  REFUNDED: "bg-[#e7dcc6] text-[#6f5b46]",
};

/** Fallback style for any unknown status. */
const FALLBACK_STYLE = "bg-[#e7dcc6] text-[#6f5b46]";

export function statusStyle(status: string): string {
  return STATUS_STYLES[status] ?? FALLBACK_STYLE;
}

interface StatusPillProps {
  status: string;
  /** Override the displayed text (defaults to a humanized status). */
  label?: string;
  className?: string;
}

export default function StatusPill({ status, label, className = "" }: StatusPillProps) {
  const text = label ?? status.replace(/_/g, " ").toLowerCase();
  return (
    <span
      className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusStyle(status)} ${className}`}
    >
      {text}
    </span>
  );
}
