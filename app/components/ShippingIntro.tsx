import Link from "next/link";
import SizeBadge from "./SizeBadge";
import { BOX_PRICES, fmtCents } from "@/lib/shipping/tiers";

/**
 * One line BELOW the lots when an auction has some that can ship. Pickup is the
 * default, so shipping is offered as the option, never the lead.
 */
export default function ShippingIntro({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[16px] text-[#4a3a2b]">
      <span className="inline-flex items-center gap-1">
        <SizeBadge size="S" px={22} />
        <SizeBadge size="M" px={22} />
        <SizeBadge size="L" px={22} />
      </span>
      <span>
        Can&apos;t make it to pickup? <strong className="font-bold text-[#241a12]">{count}</strong> of these lots can also ship, all in one box, from {fmtCents(BOX_PRICES[0].cents[0])}.
      </span>
      <Link href="/help#shipping" className="font-bold text-[#6c4d39] underline underline-offset-2 hover:text-[#241a12]">
        How it works
      </Link>
    </div>
  );
}
