"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteAuctionButton({ auctionId }: { auctionId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Delete this draft auction? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/auctions/" + auctionId, { method: "DELETE" });
      if (res.ok) {
        router.push("/admin/auctions");
        return;
      }
      const data = await res.json().catch(() => ({}));
      alert("Error: " + (data.error || "Failed to delete auction"));
    } catch {
      alert("Something went wrong.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="bg-white border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 text-base font-semibold px-6 py-3.5 rounded-xl transition-colors"
    >
      {deleting ? "Deleting..." : "Delete Auction"}
    </button>
  );
}
