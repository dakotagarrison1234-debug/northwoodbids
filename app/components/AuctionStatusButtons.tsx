"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  auctionId: string;
  status: string;
}

const BTN_BASE =
  "text-base font-semibold px-6 py-3.5 rounded-xl transition-colors whitespace-nowrap disabled:opacity-50";

export default function AuctionStatusButtons({ auctionId, status }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmMessages: Record<string, string> = {
    OPEN: "Open this auction now? All draft items will go live and bidders can start bidding.",
    CLOSING: "Let bidders know this auction is closing soon? They'll see a 'closing soon' banner.",
    SETTLED: "Mark this auction as settled? This means all winners have been taken care of.",
  };

  const updateStatus = async (newStatus: string) => {
    const msg = confirmMessages[newStatus] || `Change auction status to ${newStatus.toLowerCase()}?`;
    // Status changes here are non-destructive; only ask before opening/closing.
    if (newStatus === "OPEN" && !confirm(msg)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/auctions/${auctionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        router.refresh();
      } else {
        setError(data.error || "Could not update the auction. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const closeAuction = async () => {
    if (!confirm("Close this auction now? Winners will be set and notified. This can't be undone.")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/auctions/${auctionId}/close`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setError(null);
        router.refresh();
      } else {
        setError(data.error || "Could not close the auction. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <span className="text-[#6f5b46] text-base font-semibold">Working…</span>;
  }

  return (
    <div>
      <div className="flex items-center gap-2 sm:gap-3">
        {status === "DRAFT" && (
          // Delete lives in the Danger Zone below — only one delete path.
          <button
            onClick={() => updateStatus("OPEN")}
            className={`${BTN_BASE} bg-[#6c4d39] hover:bg-[#563e2c] text-white`}
          >
            Open Auction
          </button>
        )}
        {status === "OPEN" && (
          <>
            <button
              onClick={() => updateStatus("CLOSING")}
              className={`${BTN_BASE} bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] text-[#241a12]`}
            >
              Mark Closing Soon
            </button>
            <button
              onClick={closeAuction}
              className={`${BTN_BASE} bg-[#4a3a2b] hover:bg-[#241a12] text-white`}
            >
              Close Auction
            </button>
          </>
        )}
        {status === "CLOSING" && (
          <button
            onClick={closeAuction}
            className={`${BTN_BASE} bg-[#4a3a2b] hover:bg-[#241a12] text-white`}
          >
            Close Auction
          </button>
        )}
        {status === "CLOSED" && (
          <button
            onClick={() => updateStatus("SETTLED")}
            className={`${BTN_BASE} bg-[#6c4d39] hover:bg-[#563e2c] text-white`}
          >
            Mark Settled
          </button>
        )}
      </div>
      {error && <p className="text-red-600 text-base mt-2">{error}</p>}
    </div>
  );
}
