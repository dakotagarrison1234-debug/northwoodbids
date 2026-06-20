import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#faf8f4] text-[#1a1916] flex items-center justify-center px-5">
      <div className="text-center max-w-sm w-full">
        <div className="text-[#09a7ad] font-extrabold text-xl mb-6">Northwood Bids</div>
        <h1 className="text-3xl font-extrabold mb-2">Page not found</h1>
        <p className="text-[#6b6659] text-sm mb-8">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <div className="flex flex-col gap-2.5">
          <Link href="/auctions" className="w-full bg-[#09a7ad] hover:bg-[#0898a0] text-white font-semibold py-3 rounded-xl transition-colors">
            Browse auctions
          </Link>
          <Link href="/" className="w-full border border-[#d4cfc4] hover:border-[#b0a99a] text-[#4a4640] hover:text-[#1a1916] font-medium py-3 rounded-xl transition-colors">
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
