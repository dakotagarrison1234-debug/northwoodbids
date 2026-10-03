"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn } from "../../ui";

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
      <Btn tone="red" variant="outline" onClick={() => setAsking(true)} disabled={deleting}>
        {deleting ? "Deleting…" : "Delete Auction"}
      </Btn>
      {error && <p className="text-sm font-semibold text-[#a1321f] mt-2">{error}</p>}

      {asking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setAsking(false)}>
          <div className="bg-white rounded-2xl border border-[#e6dac6] max-w-sm w-full p-6 shadow-xl text-left" onClick={(e) => e.stopPropagation()}>
            <p className="text-base text-[#241a12]">
              Delete this draft auction? Its items go back to your drafts. This can&apos;t be undone.
            </p>
            <div className="mt-5 flex gap-3">
              <Btn tone="slate" variant="outline" full onClick={() => setAsking(false)}>
                Back
              </Btn>
              <Btn tone="red" full onClick={() => { setAsking(false); handleDelete(); }}>
                Delete
              </Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
