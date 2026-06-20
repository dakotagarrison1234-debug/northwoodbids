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
    <main className="min-h-screen bg-[#faf8f4] text-[#1a1916] flex items-center justify-center px-5">
      <div className="text-center max-w-sm w-full">
        <div className="text-[#09a7ad] font-extrabold text-xl mb-6">Northwood Bids</div>
        <h1 className="text-2xl font-extrabold mb-2">Something went wrong</h1>
        <p className="text-[#6b6659] text-sm mb-8">
          We hit a snag loading this page. Try again, or head back.
        </p>
        <div className="flex flex-col gap-2.5">
          <button
            onClick={reset}
            className="w-full bg-[#09a7ad] hover:bg-[#0898a0] text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Try again
          </button>
          <Link href="/auctions" className="w-full border border-[#d4cfc4] hover:border-[#b0a99a] text-[#4a4640] hover:text-[#1a1916] font-medium py-3 rounded-xl transition-colors">
            Browse auctions
          </Link>
        </div>
      </div>
    </main>
  );
}
