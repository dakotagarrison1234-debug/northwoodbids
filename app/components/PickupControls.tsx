"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  itemIds: string[];
  mode: "single" | "all";
  currentStatus?: string;
}

export default function PickupControls({ itemIds, mode, currentStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (itemIds.length === 0) return null;

  // single: SOLD → PENDING_PICKUP, PENDING_PICKUP → PICKED_UP
  // all: jump straight to PICKED_UP
  const targetStatus =
    mode === "all" ? "PICKED_UP" : currentStatus === "SOLD" ? "PENDING_PICKUP" : "PICKED_UP";

  const label =
    mode === "all"
      ? `Mark All Picked Up (${itemIds.length})`
      : currentStatus === "SOLD"
      ? "Stage for Pickup →"
      : "Mark Picked Up";

  const handleClick = async () => {
    if (targetStatus === "PICKED_UP") {
      const confirmMsg = mode === "all"
        ? `Mark all ${itemIds.length} item(s) as picked up? This cannot be undone.`
        : "Mark this item as picked up? This cannot be undone.";
      if (!confirm(confirmMsg)) return;
    }
    setLoading(true);
    try {
      await Promise.all(
        itemIds.map((id) =>
          fetch(`/api/items/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: targetStatus }),
          })
        )
      );
      router.refresh();
    } catch {
      alert("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 whitespace-nowrap transition-colors ${
        mode === "all"
          ? "bg-[#6c4d39] hover:bg-[#563e2c] text-white"
          : currentStatus === "SOLD"
          ? "bg-[#8a5a2b] hover:bg-[#74491f] text-white"
          : "bg-[#5f7a45] hover:bg-[#4d6438] text-white"
      }`}
    >
      {loading ? "..." : label}
    </button>
  );
}
