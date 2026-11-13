/**
 * The NB mark for the sign-in / sign-up header band. The logo is dark wood, so on
 * the brown band it disappeared — it sits on a cream tile instead (same look as
 * the tab icon and the home-screen app icon).
 */
export default function AuthLogo({ size = "md" }: { size?: "md" | "lg" }) {
  const tile = size === "lg" ? "w-[104px] h-[84px] rounded-[22px]" : "w-[92px] h-[74px] rounded-[20px]";
  return (
    <div
      className={`${tile} mx-auto mb-4 bg-[#fbf4e6] grid place-items-center ring-1 ring-white/40 shadow-[0_10px_24px_-10px_rgba(36,26,18,0.65)]`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/nb-logo.png" alt="Northwood Bids" width={640} height={442} className="w-[74%] h-auto" />
    </div>
  );
}
