"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { IcoCheck } from "@/app/components/BidIcons";

interface Props {
  auctionId: string;
  status: string;
  /** ISO date the "auction is live" blast was sent, or null if it hasn't been. */
  liveNotifiedAtISO?: string | null;
  /**
   * Which buttons to render. "primary" = Open now / Send live text (the daily
   * ones); "more" = Mark closing soon / Un-open (rare, lives under More).
   * Default renders all of them.
   */
  show?: "all" | "primary" | "more";
  /** Let the primary buttons stretch to fill a row of big buttons. */
  className?: string;
}

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors whitespace-nowrap min-h-[50px] px-5 text-[17px] disabled:opacity-50 w-full sm:w-auto";

export default function AuctionStatusButtons({ auctionId, status, liveNotifiedAtISO = null, show = "all", className = "" }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  // Once the blast has gone out for this auction, the button is spent — locally as
  // soon as it succeeds, and from the DB on every load after that.
  const [liveSent, setLiveSent] = useState(!!liveNotifiedAtISO);
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
        setLiveSent(true);
        setOk(`Live text sent to ${n} ${n === 1 ? "bidder" : "bidders"}.`);
        router.refresh();
      } else {
        // 409 = the server says it already went out. Believe it and lock the button.
        if (res.status === 409) setLiveSent(true);
        setError(data.error || "Could not send the announcement.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isLive = status === "OPEN" || status === "CLOSING";
  const primary = show === "all" || show === "primary";
  const more = show === "all" || show === "more";

  if (loading) {
    return <span className={`inline-flex items-center min-h-[50px] text-[#6f5b46] font-semibold ${className}`}>Working…</span>;
  }

  return (
    <div className={className}>
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
        {primary && status === "DRAFT" && (
          <button
            onClick={() =>
              setConfirmDialog({
                text: "Open this auction now? Lots go live immediately. No text is sent — use Send live text when you're ready to announce it.",
                confirmLabel: "Open now",
                onConfirm: () => updateStatus("OPEN"),
              })
            }
            className={`${BTN_BASE} bg-[#6c4d39] hover:bg-[#563e2c] text-white shadow-sm`}
          >
            Open now
          </button>
        )}

        {primary && isLive && (
          liveSent ? (
            <span
              title={liveNotifiedAtISO ? `Sent ${new Date(liveNotifiedAtISO).toLocaleString()}` : "Already sent"}
              className={`${BTN_BASE} bg-[#efe3d0] border border-[#cdbda3] text-[#8a7559] cursor-not-allowed`}
            >
              <IcoCheck className="w-4 h-4" />
              Live text sent
            </span>
          ) : (
            <button
              onClick={() =>
                setConfirmDialog({
                  text: "Text all your bidders that this auction is live? This can only be sent once, so only do it when you're ready for traffic.",
                  confirmLabel: "Send live text",
                  onConfirm: sendLive,
                })
              }
              className={`${BTN_BASE} bg-[#c47b3e] hover:bg-[#a85f28] text-white shadow-sm`}
            >
              Send live text
            </button>
          )
        )}

        {more && status === "OPEN" && (
          <button
            onClick={() => updateStatus("CLOSING")}
            className={`${BTN_BASE} bg-white border-2 border-[#eed3ab] text-[#8a4f1c] hover:bg-[#faf5ea]`}
          >
            Mark closing soon
          </button>
        )}

        {/* Undo an accidental open. Not a close — no winners, no charges, bids kept. */}
        {more && isLive && (
          <button
            onClick={() =>
              setConfirmDialog({
                text:
                  "Un-open this auction and put it back to draft? Lots are hidden from bidders again. Nothing is closed or charged, and any bids already placed are kept — reopen and it picks up right where it left off. Set the new start time under Details.",
                confirmLabel: "Un-open it",
                onConfirm: () => updateStatus("DRAFT"),
              })
            }
            className={`${BTN_BASE} bg-white border-2 border-[#e6dac6] text-[#6f5b46] hover:bg-[#faf5ea]`}
          >
            Un-open
          </button>
        )}

        {/* No "Mark Settled" — an auction fully closes and charges winners on its own
            when it ends (the CLOSED state). There's no separate manual settle step. */}
      </div>

      {error && <p className="text-[#a1321f] text-[15px] font-semibold mt-2">{error}</p>}
      {ok && <p className="text-[#2f5d3a] text-[15px] font-semibold mt-2">{ok}</p>}

      {/* In-app confirmation (native confirm() is blocked in some installed/PWA webviews) */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white rounded-2xl border border-[#cdbda3] max-w-sm w-full p-6 shadow-xl text-left" onClick={(e) => e.stopPropagation()}>
            <p className="text-[#241a12]">{confirmDialog.text}</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 min-h-[50px] bg-white border-2 border-[#e6dac6] text-[#6f5b46] hover:bg-[#faf5ea] font-bold rounded-xl">
                Back
              </button>
              <button
                onClick={() => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); fn(); }}
                className="flex-1 min-h-[50px] bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold rounded-xl"
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
