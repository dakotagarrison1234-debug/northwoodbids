"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";

interface Props {
  paymentId: string;
  amount: number;
  winnerName: string;
}

// Destructive admin action: refund a paid winner and return the item to unsold.
// Red is reserved for this kind of irreversible action.
export default function RefundButton({ paymentId, amount, winnerName }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (
      !confirm(
        `Refund ${money(amount)} to ${winnerName}? This returns the item to unsold.`
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}/refund`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        router.refresh();
      } else {
        alert("Error: " + (data.error || "Could not process the refund."));
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
      className="text-base font-semibold bg-white border-2 border-red-500/30 text-red-600 hover:bg-red-50 disabled:opacity-50 px-5 py-2.5 rounded-xl transition-colors whitespace-nowrap"
    >
      {loading ? "Refunding…" : "Refund"}
    </button>
  );
}
