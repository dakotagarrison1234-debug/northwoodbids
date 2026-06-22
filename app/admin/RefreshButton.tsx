"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Lightweight "refresh data" control for admin screens. In the installed
// standalone app there's no browser refresh / pull-to-refresh, so this lets
// staff re-pull server data via router.refresh() without a full page reload.
export default function RefreshButton({ label = "Refresh" }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [spinning, setSpinning] = useState(false);

  const refresh = () => {
    setSpinning(true);
    startTransition(() => router.refresh());
    // let the spin animation read as a deliberate action even when data is cached
    setTimeout(() => setSpinning(false), 600);
  };

  const busy = pending || spinning;

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={busy}
      aria-label="Refresh data"
      className="inline-flex items-center gap-1.5 min-h-[44px] text-[#6f5b46] hover:text-[#241a12] hover:bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-3.5 py-2 text-base font-semibold transition-colors disabled:opacity-60"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={busy ? "animate-spin" : ""}
      >
        <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
        <path d="M13.5 2v3h-3" />
      </svg>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
