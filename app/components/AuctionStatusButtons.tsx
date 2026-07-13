"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  auctionId: string;
  status: string;
}

const BTN_BASE =
  "text-base font-semibold px-6 py-3.5 rounded-xl transition-colors whitespace-nowrap disabled:opacity-50 w-full sm:w-auto text-center";

export default function AuctionStatusButtons({ auctionId, status }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<
    { text: string; confirmLabel: string; onConfirm: () => void } | null
  >(null);

  const updateStatus = async (newStatus: string) => {
    setLoading(true);
    setError(null);
    setOk(null);
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

  // Deliberate "auction is live" blast — opening the auction never sends this.
  const sendLive = async () => {
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`/api/auctions/${auctionId}/notify-live`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const n = Number(data.sent) || 0;
        setOk(`“Auction is live” sent to ${n} ${n === 1 ? "bidder" : "bidders"}.`);
      } else {
        setError(data.error || "Could not send the announcement.");
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

  const isLive = status === "OPEN" || status === "CLOSING";

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        {status === "DRAFT" && (
          <button
            onClick={() =>
              setConfirmDialog({
                text: "Open this auction now? Items go live immediately. No text is sent — use “Send live text” when you're ready to announce it.",
                confirmLabel: "Open silently",
                onConfirm: () => updateStatus("OPEN"),
              })
            }
            className={`${BTN_BASE} bg-[#6c4d39] hover:bg-[#563e2c] text-white`}
          >
            Open Auction
          </button>
        )}

        {isLive && (
          <button
            onClick={() =>
              setConfirmDialog({
                text: "Text all your bidders that this auction is live? Only do this when you're ready for traffic.",
                confirmLabel: "Send live text",
                onConfirm: sendLive,
              })
            }
            className={`${BTN_BASE} bg-[#c47b3e] hover:bg-[#a9642c] text-white`}
          >
            Send &ldquo;Auction is Live&rdquo; text
          </button>
        )}

        {status === "OPEN" && (
          <button
            onClick={() => updateStatus("CLOSING")}
            className={`${BTN_BASE} bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] text-[#241a12]`}
          >
            Mark Closing Soon
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
      {ok && <p className="text-[#3f5226] text-base mt-2 font-semibold">{ok}</p>}

      {/* In-app confirmation (native confirm() is blocked in some installed/PWA webviews) */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white rounded-2xl border border-[#cdbda3] max-w-sm w-full p-6 shadow-xl text-left" onClick={(e) => e.stopPropagation()}>
            <p className="text-base text-[#241a12]">{confirmDialog.text}</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-white border border-[#cdbda3] text-[#6f5b46] hover:bg-[#efe3d0] font-semibold text-base py-3 rounded-xl">
                Back
              </button>
              <button
                onClick={() => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); fn(); }}
                className="flex-1 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-semibold text-base py-3 rounded-xl"
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
