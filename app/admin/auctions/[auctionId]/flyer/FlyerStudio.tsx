"use client";
import { useState } from "react";
import FlyerStage from "./FlyerStage";
import DownloadFlyerButton from "./DownloadFlyerButton";
import FlyerMotion, { type MotionItem } from "./FlyerMotion";

/**
 * Video / Image toggle. Video (the motion graphic) is the default now — motion and
 * video massively outperform a static image on Facebook/Instagram — but the classic
 * still-image flyer is kept one tap away for a quick post.
 *
 * The static flyer is passed in as `children` (server-rendered), so this client
 * wrapper doesn't have to re-implement it.
 */
export default function FlyerStudio({
  items,
  auction,
  logo,
  children,
}: {
  items: MotionItem[];
  auction: { title: string; closes: string };
  logo: string;
  children: React.ReactNode;
}) {
  const [tab, setTab] = useState<"video" | "image">("video");

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(["video", "image"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 rounded-xl text-base font-bold border-2 transition-colors ${
              tab === t
                ? "bg-[#6c4d39] text-white border-[#6c4d39]"
                : "bg-white text-[#4a3a2b] border-[#cdbda3] hover:bg-[#efe3d0]"
            }`}
          >
            {t === "video" ? "Video" : "Image"}
          </button>
        ))}
      </div>

      {tab === "video" ? (
        <div>
          <div className="mb-4 rounded-xl bg-[#f6ecda] border border-[#e3c9a3] px-4 py-3 max-w-md">
            <p className="text-base text-[#4a3a2b] font-semibold">Post it in 3 steps</p>
            <ol className="text-sm text-[#6f5b46] mt-1 list-decimal pl-5 space-y-0.5">
              <li>Open your phone&apos;s screen recorder (Control Center / quick settings).</li>
              <li>Tap <strong>Play &amp; record</strong> below — start the recording as the 3-2-1 counts down.</li>
              <li>Let it run one full loop (the bar fills, a green ✓ appears), stop, trim, post.</li>
            </ol>
            <p className="text-xs text-[#8a7559] mt-2">
              A screen recording is a clean MP4 that uploads perfectly to Facebook &amp; Instagram — nothing to download.
            </p>
          </div>
          {items.length === 0 ? (
            <p className="text-base text-[#8a7559]">This auction has no items with photos yet — add some first.</p>
          ) : (
            <FlyerMotion items={items} auction={auction} logo={logo} />
          )}
        </div>
      ) : (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <DownloadFlyerButton />
            <p className="text-sm text-[#6f5b46]">Top items with live prices, 1080×1080. Download, or screenshot below.</p>
          </div>
          <FlyerStage>{children}</FlyerStage>
        </div>
      )}
    </div>
  );
}
