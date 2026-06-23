// A small row of item preview thumbnails for an auction card. Fed the auction's
// most-popular items (ordered by bid count, falling back to any items). Server-safe.
import Image from "next/image";

type PreviewItem = {
  id: string;
  photos: { url: string }[];
  _count: { bids: number };
};

export default function AuctionPreviewThumbs({ items }: { items: PreviewItem[] }) {
  const withPhotos = items.filter((i) => i.photos[0]?.url).slice(0, 4);
  if (withPhotos.length === 0) return null;

  return (
    <div className="grid grid-cols-4 gap-1.5 mt-3">
      {withPhotos.map((it, idx) => (
        <div
          key={it.id}
          className="relative aspect-square rounded-lg overflow-hidden bg-[#efe3d0] border border-[#e3d6bf]"
        >
          <Image src={it.photos[0].url} alt="" fill sizes="(max-width:640px) 25vw, 120px" className="object-cover" />
          {idx === 0 && it._count.bids > 0 && (
            <span className="absolute bottom-0.5 left-0.5 right-0.5 text-[10px] font-bold text-white bg-[#6c4d39]/85 rounded px-1 py-0.5 text-center leading-tight">
              {it._count.bids} bid{it._count.bids !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
