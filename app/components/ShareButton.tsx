"use client";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { IcoShare } from "./BidIcons";

/**
 * Share this page: the phone's share sheet (Messages, Facebook, Instagram…) or,
 * on a computer, copy the link. A signed-in bidder shares through their invite
 * link (/r/CODE?to=/this/page), so the friend lands right here and, if they join
 * and win, the sharer earns Bid Bucks. The link preview is the page's branded
 * card (opengraph-image), so the text only has to say why to tap.
 */
export default function ShareButton({ title, text, path, className = "" }: { title: string; text: string; path: string; className?: string }) {
  const { isSignedIn } = useUser();
  const [refCode, setRefCode] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Fetched ahead: navigator.share must run inside the tap, with no awaits first.
  useEffect(() => {
    if (!isSignedIn) return;
    let live = true;
    fetch("/api/referral/summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d?.code) setRefCode(String(d.code)); })
      .catch(() => {});
    return () => { live = false; };
  }, [isSignedIn]);

  const share = async () => {
    const url = refCode
      ? `${window.location.origin}/r/${refCode}?to=${encodeURIComponent(path)}`
      : `${window.location.origin}${path}`;
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); } catch { /* cancelled */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setNote("Link copied");
      setTimeout(() => setNote(null), 1800);
    } catch { /* clipboard blocked */ }
  };

  return (
    <button
      type="button"
      onClick={share}
      className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-full border border-[#6c4d39]/25 bg-white/80 text-[#563e2c] text-[13px] font-bold hover:bg-white transition-colors nb-focus ${className}`}
    >
      <IcoShare className="w-4 h-4" />
      {note ?? "Share"}
    </button>
  );
}
