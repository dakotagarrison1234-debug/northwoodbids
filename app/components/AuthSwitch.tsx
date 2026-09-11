import Link from "next/link";

/**
 * Two-option switch shown above the Clerk widget so returning bidders can jump
 * straight to Sign In instead of hunting for the small link Clerk tucks under
 * its form. Sits inside the auth card, so it stays quiet: cream track, leather
 * thumb, one helper line.
 */
export default function AuthSwitch({ active }: { active: "in" | "up" }) {
  const base =
    "flex-1 text-center text-sm font-bold py-2.5 rounded-lg transition-colors nb-focus";
  const on = "bg-[#6c4d39] text-white shadow-sm";
  const off = "text-[#6f5b46] hover:text-[#241a12] hover:bg-white";

  return (
    <div className="w-full">
      <div
        role="tablist"
        aria-label="Sign in or create an account"
        className="flex gap-1 p-1 rounded-xl bg-[#f1e7d5] border border-[#e3d6bf]"
      >
        <Link
          href="/sign-in"
          role="tab"
          aria-selected={active === "in"}
          className={`${base} ${active === "in" ? on : off}`}
        >
          Sign in
        </Link>
        <Link
          href="/sign-up"
          role="tab"
          aria-selected={active === "up"}
          className={`${base} ${active === "up" ? on : off}`}
        >
          Create account
        </Link>
      </div>
      <p className="text-center text-xs text-[#8a7559] mt-2">
        {active === "up"
          ? "Already bid with us? Sign in instead."
          : "First time at Northwood? Create a free account."}
      </p>
    </div>
  );
}
