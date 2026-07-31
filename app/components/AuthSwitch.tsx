import Link from "next/link";

/**
 * A clear two-option switch shown above the Clerk widget so returning customers
 * can jump straight to Sign In instead of hunting for the small link Clerk puts
 * at the bottom of its sign-up form.
 */
export default function AuthSwitch({ active }: { active: "in" | "up" }) {
  const base =
    "flex-1 text-center text-sm font-semibold py-2.5 rounded-lg transition-colors";
  const on = "bg-[#6c4d39] text-white shadow-sm";
  const off = "text-[#6f5b46] hover:text-[#241a12] hover:bg-white/60";

  return (
    <div className="w-full max-w-[400px] mx-auto mb-5">
      <div className="flex gap-1 p-1 rounded-xl bg-[#e7d9c1] border border-[#d8c6a8]">
        <Link href="/sign-in" className={`${base} ${active === "in" ? on : off}`}>
          Sign In
        </Link>
        <Link href="/sign-up" className={`${base} ${active === "up" ? on : off}`}>
          Create Account
        </Link>
      </div>
      <p className="text-center text-xs text-[#8a7559] mt-2">
        {active === "up"
          ? "Already have an account? Tap Sign In."
          : "New to Northwood Bids? Tap Create Account."}
      </p>
    </div>
  );
}
