"use client";
import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12] flex items-center justify-center px-5">
      <div className="text-center max-w-sm w-full">
        <div className="text-[#a4592a] font-extrabold text-xl mb-6">Northwood Bids</div>
        <h1 className="text-2xl font-extrabold mb-2">Something went wrong</h1>
        <p className="text-[#6f5b46] text-sm mb-8">
          We hit a snag loading this page. Try again, or head back.
        </p>
        <div className="flex flex-col gap-2.5">
          <button
            onClick={reset}
            className="w-full bg-[#a4592a] hover:bg-[#843f1c] text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Try again
          </button>
          <Link href="/auctions" className="w-full border border-[#cdbda3] hover:border-[#b3a085] text-[#4a3a2b] hover:text-[#241a12] font-medium py-3 rounded-xl transition-colors">
            Browse auctions
          </Link>
        </div>
      </div>
    </main>
  );
}
