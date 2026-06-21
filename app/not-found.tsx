import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12] flex items-center justify-center px-5">
      <div className="text-center max-w-sm w-full">
        <div className="text-[#a4592a] font-extrabold text-xl mb-6">Northwood Bids</div>
        <h1 className="text-3xl font-extrabold mb-2">Page not found</h1>
        <p className="text-[#6f5b46] text-sm mb-8">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <div className="flex flex-col gap-2.5">
          <Link href="/auctions" className="w-full bg-[#a4592a] hover:bg-[#843f1c] text-white font-semibold py-3 rounded-xl transition-colors">
            Browse auctions
          </Link>
          <Link href="/" className="w-full border border-[#cdbda3] hover:border-[#b3a085] text-[#4a3a2b] hover:text-[#241a12] font-medium py-3 rounded-xl transition-colors">
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
