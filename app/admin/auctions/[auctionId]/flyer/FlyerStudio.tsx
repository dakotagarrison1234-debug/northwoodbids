"use client";
import { useState } from "react";
import FlyerStage from "./FlyerStage";
import DownloadFlyerButton from "./DownloadFlyerButton";
import FlyerMotion, { type MotionItem } from "./FlyerMotion";
import { Segmented, Empty } from "../../../ui";

/**
 * Video / Image toggle. Video (the motion graphic) is the default — motion
 * outperforms a still on Facebook/Instagram — but the still flyer is one tap away.
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
    <div className="space-y-4">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "video", label: "Video" },
          { value: "image", label: "Image" },
        ]}
      />

      {tab === "video" ? (
        items.length === 0 ? (
          <div className="bg-white border border-[#e6dac6] rounded-2xl">
            <Empty text="No lots with photos yet." />
          </div>
        ) : (
          <FlyerMotion items={items} auction={auction} logo={logo} />
        )
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <DownloadFlyerButton />
            <p className="text-[15px] text-[#6f5b46]">1080×1080. Download, or screenshot below.</p>
          </div>
          <FlyerStage>{children}</FlyerStage>
        </div>
      )}
    </div>
  );
}
