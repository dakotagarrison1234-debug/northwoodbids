// 8-lot photo preview for an auction card — just the photos, on a clean cream
// grid. The "+N" tile on the last square honestly signals the auction has depth
// beyond the 8 shown. Server-safe.
import Image from "next/image";

export type PreviewItem = {
  id: string;
  photos: { url: string }[];
  _count?: { bids: number };
};

export default function AuctionPreviewThumbs({
  items,
  totalItems,
}: {
  items: PreviewItem[];
  totalItems?: number;
}) {
  const withPhotos = items.filter((i) => i.photos[0]?.url);
  if (withPhotos.length === 0) return null;

  const shown = withPhotos.slice(0, 8);
  const remaining = Math.max(0, (totalItems ?? withPhotos.length) - shown.length);
  const lastIdx = shown.length - 1;

  return (
    <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-[#faf5ea] p-1.5 border border-[#efe3d0]">
      {shown.map((it, idx) => {
        const isMoreTile = idx === lastIdx && remaining > 0;
        return (
          <div
            key={it.id}
            className="relative aspect-square rounded-lg overflow-hidden bg-white ring-1 ring-[#e9dcc6]"
          >
            {/* contain, not cover — small thumbs crop product shots the hardest.
                White tile + a little padding letterboxes cleanly. */}
            <Image
              src={it.photos[0].url}
              alt=""
              fill
              sizes="(max-width:640px) 22vw, 90px"
              className="object-contain p-1"
            />
            {isMoreTile && (
              <div className="absolute inset-0 bg-[#241a12]/70 flex flex-col items-center justify-center leading-none">
                <span className="text-[#f6ecda] font-display font-black text-base">+{remaining}</span>
                <span className="text-[#e3d6bf] text-[9px] font-bold uppercase tracking-wider mt-0.5">more</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
