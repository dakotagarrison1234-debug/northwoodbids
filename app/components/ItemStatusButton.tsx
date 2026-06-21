"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  itemId: string;
  currentStatus: string;
}

const transitions: Record<string, { label: string; next: string; color: string }> = {
  SOLD: { label: "Ready for Pickup", next: "PENDING_PICKUP", color: "bg-[#6c4d39] hover:bg-[#563e2c] text-white" },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PENDING_PICKUP: { label: "Mark Picked Up", next: "PICKED_UP" as any, color: "bg-[#4a3a2b] hover:bg-[#241a12] text-white" },
};

export default function ItemStatusButton({ itemId, currentStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const transition = transitions[currentStatus];

  if (!transition) return null;

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/items/${itemId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: transition.next }),
      });
      const data = await res.json();
      if (data.success) {
        router.refresh();
      } else {
        alert("Error: " + data.error);
      }
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
      className={`text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 whitespace-nowrap transition-colors ${transition.color}`}
    >
      {loading ? "..." : transition.label}
    </button>
  );
}
