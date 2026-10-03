"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn } from "../../ui";

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
      <div className="flex items-center gap-2 flex-wrap">
        <Btn variant="outline" size="sm" onClick={() => run(false)} disabled={busy}>
          {busy ? "…" : "Un-archive"}
        </Btn>
        {err && <span className="text-xs font-semibold text-[#a1321f]">{err}</span>}
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-[#6f5b46]">Hide from reports &amp; site?</span>
        <Btn tone="red" size="sm" onClick={() => run(true)} disabled={busy}>
          {busy ? "…" : "Archive"}
        </Btn>
        <Btn tone="slate" variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
          Cancel
        </Btn>
        {err && <span className="text-xs font-semibold text-[#a1321f]">{err}</span>}
      </div>
    );
  }

  return (
    <Btn tone="slate" variant="outline" size="sm" onClick={() => setConfirming(true)} title="Hide this test auction from reports and the site">
      Archive
    </Btn>
  );
}
