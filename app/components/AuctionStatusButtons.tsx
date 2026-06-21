"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  auctionId: string;
  status: string;
}


export default function AuctionStatusButtons({ auctionId, status }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmMessages: Record<string, string> = {
    OPEN: "Open this auction? All draft items will go live and bidders can start bidding.",
    CLOSING: "Mark this auction as closing soon? Bidders will see a warning banner.",
    SETTLED: "Mark this auction as settled? This indicates all winners have been processed.",
  };

  const updateStatus = async (newStatus: string) => {
    const msg = confirmMessages[newStatus] || `Change auction status to ${newStatus.toLowerCase()}?`;
    if (!confirm(msg)) return;
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
        setError(data.error || "Failed to update status.");
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const closeAuction = async () => {
    if (!confirm("Close this auction? This will mark all winning bids and notify winners via GHL.")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/auctions/${auctionId}/close`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setError(null);
        router.refresh();
      } else {
        setError(data.error || "Failed to close auction.");
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const deleteAuction = async () => {
    if (!confirm("Delete this draft auction? All items will be unlinked (not deleted) and can be re-assigned. This cannot be undone.")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/auctions/${auctionId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        router.push("/admin/auctions");
      } else {
        setError(data.error || "Failed to delete auction.");
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <span className="text-[#6f5b46] text-sm">Updating...</span>;
  }

  return (
    <div>
    <div className="flex items-center gap-2">
      {status === "DRAFT" && (
        <>
          <button
            onClick={() => updateStatus("OPEN")}
            className="bg-[#6c4d39] hover:bg-[#563e2c] text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Open Auction
          </button>
          <button
            onClick={deleteAuction}
            className="bg-transparent hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-300 text-sm px-3 py-2 rounded-lg font-medium transition-colors"
          >
            Delete
          </button>
        </>
      )}
      {status === "OPEN" && (
        <>
          <button
            onClick={() => updateStatus("CLOSING")}
            className="bg-amber-500 hover:bg-amber-400 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Mark Closing Soon
          </button>
          <button
            onClick={closeAuction}
            className="bg-red-500 hover:bg-red-400 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Close Auction
          </button>
        </>
      )}
      {status === "CLOSING" && (
        <button
          onClick={closeAuction}
          className="bg-red-500 hover:bg-red-400 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
        >
          Close Auction
        </button>
      )}
      {status === "CLOSED" && (
        <button
          onClick={() => updateStatus("SETTLED")}
          className="bg-[#4a3a2b] hover:bg-[#241a12] text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
        >
          Mark Settled
        </button>
      )}
    </div>
    {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
    </div>
  );
}
