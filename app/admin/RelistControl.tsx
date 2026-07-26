"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface RelistTarget {
  id: string;
  title: string;
  status: string; // DRAFT | OPEN | CLOSING
}

/**
 * Relist an unsold item. Pick a destination auction (or "Save to drafts") and hit
 * Relist — the item's price/bids reset and it moves. On success we refresh the
 * server data so the row drops off the unsold list. Shared by the closed-auction
 * results screen and the dedicated /admin/unsold page.
 */
export default function RelistControl({
  itemId,
  targets,
  compact = false,
}: {
  itemId: string;
  targets: RelistTarget[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [dest, setDest] = useState<string>(""); // "" = save to drafts
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const relist = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/items/${itemId}/relist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auctionId: dest || null }),
      });
      const data = await res.json();
      if (data.success) {
        setDone(data.auctionName ? `Relisted to ${data.auctionName}` : "Moved to drafts");
        router.refresh();
      } else {
        setErr(data.error || "Could not relist.");
        setBusy(false);
      }
    } catch {
      setErr("Something went wrong.");
      setBusy(false);
    }
  };

  if (done) {
    return <span className="text-xs font-bold text-green-700 shrink-0">{done} ✓</span>;
  }

  return (
    <div className={`flex items-center gap-1.5 shrink-0 ${compact ? "" : "flex-wrap"}`}>
      <select
        value={dest}
        onChange={(e) => setDest(e.target.value)}
        disabled={busy}
        className="min-w-0 max-w-[9rem] bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#6c4d39] disabled:opacity-50"
      >
        <option value="">Save to drafts</option>
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.status === "OPEN" || t.status === "CLOSING" ? "▶ " : ""}
            {t.title}
          </option>
        ))}
      </select>
      <button
        onClick={relist}
        disabled={busy}
        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#6c4d39] text-white hover:bg-[#563e2c] disabled:opacity-50 shrink-0"
      >
        {busy ? "…" : "Relist"}
      </button>
      {err && <span className="text-xs text-red-600 w-full">{err}</span>}
    </div>
  );
}
