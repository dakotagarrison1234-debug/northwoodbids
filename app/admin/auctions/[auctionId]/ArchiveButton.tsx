"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Archive (hide) or un-archive an auction. Archived auctions drop out of reports,
 * winners, the public site and the main admin list — used to get test/junk auctions
 * out of the way without deleting their data.
 */
export default function ArchiveButton({
  auctionId,
  archived,
}: {
  auctionId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (next: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/auctions/${auctionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: next }),
      });
      const data = await res.json();
      if (data.success) {
        setConfirming(false);
        router.refresh();
      } else {
        setErr(data.error || "Could not update.");
      }
    } catch {
      setErr("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (archived) {
    return (
      <div>
        <button
          onClick={() => run(false)}
          disabled={busy}
          className="text-sm font-bold px-4 py-2.5 rounded-xl border border-[#cdbda3] bg-white hover:bg-[#efe3d0] text-[#6c4d39] disabled:opacity-50"
        >
          {busy ? "…" : "Un-archive"}
        </button>
        {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-[#6f5b46]">Hide from reports &amp; site?</span>
        <button onClick={() => run(true)} disabled={busy} className="text-sm font-bold px-3 py-2 rounded-lg bg-[#a32d2d] text-white hover:bg-[#8a2525] disabled:opacity-50">
          {busy ? "…" : "Archive"}
        </button>
        <button onClick={() => setConfirming(false)} disabled={busy} className="text-sm font-bold px-3 py-2 rounded-lg border border-[#cdbda3] text-[#6f5b46]">
          Cancel
        </button>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-sm font-semibold px-4 py-2.5 rounded-xl border border-[#cdbda3] bg-white hover:bg-[#efe3d0] text-[#6f5b46]"
    >
      Archive (hide test auction)
    </button>
  );
}
