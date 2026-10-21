import Link from "next/link";
import SizeBadge from "./SizeBadge";
import { TIERS, fmtCents } from "@/lib/shipping/tiers";

/**
 * One slim line above the grid when an auction has lots that ship: the three
 * badges, nine words, a link. The Help page carries the explanation.
 */
export default function ShippingIntro({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px] text-[#4a3a2b]">
      <span className="inline-flex items-center gap-1">
        <SizeBadge size="S" px={22} />
        <SizeBadge size="M" px={22} />
        <SizeBadge size="L" px={22} />
      </span>
      <span>
        <strong className="font-bold text-[#241a12]">{count}</strong> lots ship. One box per auction, from {fmtCents(TIERS[0].cents[0])}.
      </span>
      <Link href="/help#shipping" className="font-bold text-[#6c4d39] underline underline-offset-2 hover:text-[#241a12]">
        How it works
      </Link>
    </div>
  );
}
