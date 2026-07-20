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
//
// The confirmation is an in-app modal, NOT native confirm() — that's silently
// blocked in the installed/PWA webview, which meant this button did nothing there.
// A refund button that appears to do nothing is the worst possible failure mode:
// staff tap it repeatedly, assume it's broken, and refund by hand in Stripe instead.
export default function RefundButton({ paymentId, amount, winnerName }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doRefund = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}/refund`, { method: "POST" });
      const data = await res.json();
      if (data.success) router.refresh();
      else setError(data.error || "Could not process the refund.");
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setAsking(true)}
        disabled={loading}
        className="text-base font-semibold bg-white border-2 border-red-500/30 text-red-600 hover:bg-red-50 disabled:opacity-50 px-5 py-2.5 rounded-xl transition-colors whitespace-nowrap"
      >
        {loading ? "Refunding…" : "Refund"}
      </button>
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}

      {asking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setAsking(false)}>
          <div className="bg-white rounded-2xl border border-[#cdbda3] max-w-sm w-full p-6 shadow-xl text-left" onClick={(e) => e.stopPropagation()}>
            <p className="text-base text-[#241a12]">
              Refund this item to <strong>{winnerName}</strong>?
            </p>
            <p className="text-sm text-[#6f5b46] mt-2 leading-snug">
              They get back everything they paid for it — the {money(amount)} winning bid plus its
              buyer&apos;s premium and tax (minus any Bid Bucks). Only this item is refunded; their
              other items in the same auction are untouched. The item goes back to unsold.
            </p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setAsking(false)} className="flex-1 bg-white border border-[#cdbda3] text-[#6f5b46] hover:bg-[#efe3d0] font-semibold text-base py-3 rounded-xl">
                Back
              </button>
              <button
                onClick={() => { setAsking(false); doRefund(); }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold text-base py-3 rounded-xl"
              >
                Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
