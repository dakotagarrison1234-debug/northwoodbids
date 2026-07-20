"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteAuctionButton({ auctionId }: { auctionId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  // In-app confirm — native confirm() is silently blocked in the installed/PWA
  // webview, which made this button do nothing at all there.
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/auctions/" + auctionId, { method: "DELETE" });
      if (res.ok) {
        router.push("/admin/auctions");
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to delete auction.");
    } catch {
      setError("Something went wrong.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setAsking(true)}
        disabled={deleting}
        className="bg-white border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 text-base font-semibold px-6 py-3.5 rounded-xl transition-colors"
      >
        {deleting ? "Deleting…" : "Delete Auction"}
      </button>
      {error && <p className="text-red-600 text-base mt-2">{error}</p>}

      {asking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setAsking(false)}>
          <div className="bg-white rounded-2xl border border-[#cdbda3] max-w-sm w-full p-6 shadow-xl text-left" onClick={(e) => e.stopPropagation()}>
            <p className="text-base text-[#241a12]">
              Delete this draft auction? Its items go back to your drafts. This can&apos;t be undone.
            </p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setAsking(false)} className="flex-1 bg-white border border-[#cdbda3] text-[#6f5b46] hover:bg-[#efe3d0] font-semibold text-base py-3 rounded-xl">
                Back
              </button>
              <button
                onClick={() => { setAsking(false); handleDelete(); }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold text-base py-3 rounded-xl"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
