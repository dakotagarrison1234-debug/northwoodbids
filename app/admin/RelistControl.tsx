"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IcoCheck } from "@/app/components/BidIcons";
import { Btn, Eyebrow } from "./ui";

export interface RelistTarget {
  id: string;
  title: string;
  status: string; // DRAFT | OPEN | CLOSING
}
export interface RelistLocation {
  id: string;
  name: string;
}

const SELECT =
  "w-full min-h-[44px] bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-3 text-sm text-[#241a12] outline-none transition disabled:opacity-50";

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
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-[#2f5d3a] shrink-0">
        <IcoCheck className="w-3.5 h-3.5" /> {done}
      </span>
    );
  }

  // Collapsed: a single, obvious button.
  if (!open) {
    return (
      <Btn size="sm" onClick={() => setOpen(true)} className="shrink-0">
        Relist
      </Btn>
    );
  }

  const destIsLive = !!dest && (targets.find((t) => t.id === dest)?.status === "OPEN" || targets.find((t) => t.id === dest)?.status === "CLOSING");

  // Expanded: pick auction → pick location → confirm.
  return (
    <div className="w-full sm:w-72 bg-[#faf5ea] border border-[#e6dac6] rounded-xl p-3 space-y-3">
      <div>
        <Eyebrow className="mb-1">List into</Eyebrow>
        <select value={dest} onChange={(e) => setDest(e.target.value)} disabled={busy} className={SELECT}>
          <option value="">Save to drafts (place later)</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.status === "OPEN" || t.status === "CLOSING" ? "Live — " : ""}
              {t.title}
            </option>
          ))}
        </select>
        {destIsLive && (
          <p className="text-[11px] text-[#2f5d3a] font-semibold mt-1">Goes live immediately in this auction.</p>
        )}
      </div>

      {locations.length > 0 && (
        <div>
          <Eyebrow className="mb-1">Warehouse</Eyebrow>
          <select value={loc} onChange={(e) => setLoc(e.target.value)} disabled={busy} className={SELECT}>
            <option value="">Keep current location</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                Move to {l.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {err && <p className="text-xs font-semibold text-[#a1321f]">{err}</p>}

      <div className="flex items-center gap-2 pt-0.5">
        <Btn size="sm" onClick={relist} disabled={busy} className="flex-1">
          {busy ? "Relisting…" : "Relist"}
        </Btn>
        <Btn size="sm" tone="slate" variant="outline" onClick={() => { setOpen(false); setErr(null); }} disabled={busy}>
          Cancel
        </Btn>
      </div>
    </div>
  );
}
