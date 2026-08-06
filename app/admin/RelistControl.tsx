"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface RelistTarget {
  id: string;
  title: string;
  status: string; // DRAFT | OPEN | CLOSING
}
export interface RelistLocation {
  id: string;
  name: string;
}

/**
 * Relist an unsold item in one clear step: tap Relist → pick the auction → pick the
 * warehouse → confirm. The item's price/bids reset and it moves (goes live if the
 * auction is already open, else a draft). Shared by the closed-auction results
 * screen and the /admin/unsold page.
 */
export default function RelistControl({
  itemId,
  targets,
  locations = [],
}: {
  itemId: string;
  targets: RelistTarget[];
  locations?: RelistLocation[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dest, setDest] = useState<string>(""); // "" = save to drafts
  const [loc, setLoc] = useState<string>("");   // "" = keep current location
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
        body: JSON.stringify({ auctionId: dest || null, locationId: loc || null }),
      });
      const data = await res.json();
      if (data.success) {
        setDone(data.auctionName ? `Relisted to ${data.auctionName}` : "Saved to drafts");
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

  // Collapsed: a single, obvious button.
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#6c4d39] text-white hover:bg-[#563e2c] shrink-0"
      >
        Relist
      </button>
    );
  }

  const selectCls =
    "w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#6c4d39]";

  // Expanded: pick auction → pick location → confirm.
  return (
    <div className="w-full sm:w-64 bg-white border border-[#e3d6bf] rounded-xl p-3 shadow-sm space-y-2.5">
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
          List into
        </label>
        <select value={dest} onChange={(e) => setDest(e.target.value)} disabled={busy} className={selectCls}>
          <option value="">Save to drafts (place later)</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.status === "OPEN" || t.status === "CLOSING" ? "● Live — " : ""}
              {t.title}
            </option>
          ))}
        </select>
        {(dest && (targets.find((t) => t.id === dest)?.status === "OPEN" || targets.find((t) => t.id === dest)?.status === "CLOSING")) && (
          <p className="text-[11px] text-green-700 font-semibold mt-1">Goes live immediately in this auction.</p>
        )}
      </div>

      {locations.length > 0 && (
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
            Warehouse
          </label>
          <select value={loc} onChange={(e) => setLoc(e.target.value)} disabled={busy} className={selectCls}>
            <option value="">Keep current location</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                Move to {l.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {err && <p className="text-xs text-red-600">{err}</p>}

      <div className="flex items-center gap-2 pt-0.5">
        <button
          onClick={relist}
          disabled={busy}
          className="flex-1 text-sm font-bold px-3 py-2 rounded-lg bg-[#6c4d39] text-white hover:bg-[#563e2c] disabled:opacity-50"
        >
          {busy ? "Relisting…" : "Relist"}
        </button>
        <button
          onClick={() => { setOpen(false); setErr(null); }}
          disabled={busy}
          className="text-sm font-semibold px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
