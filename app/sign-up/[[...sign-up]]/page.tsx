import { SignUp } from "@clerk/nextjs";
import AuthSwitch from "@/app/components/AuthSwitch";
import SignUpHeader, { type PromoHint } from "@/app/components/PromoBanner";
import { IcoShield } from "@/app/components/BidIcons";

type SP = Record<string, string | string[] | undefined>;

export default async function SignUpPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const rawCode = typeof sp.promo === "string" ? sp.promo : "";
  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  const amt = Number(typeof sp.amt === "string" ? sp.amt : "") || 5;
  const initialPromo: PromoHint = code ? { code, amount: amt } : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f3ead6] to-[#ece0c9] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white border border-[#e3d6bf] rounded-3xl shadow-[0_24px_60px_-24px_rgba(108,77,57,0.5)] overflow-hidden">
          {/* Header band (+ benefit chips when not arriving from a welcome QR) */}
          <SignUpHeader initialPromo={initialPromo} />

          {/* Form */}
          <div className="px-5 sm:px-7 pt-5 pb-6">
            <AuthSwitch active="up" />
            <div className="mt-3">
              <SignUp
                forceRedirectUrl="/register"
                signInUrl="/sign-in"
                appearance={{
                  variables: {
                    colorPrimary: "#6c4d39",
                    colorBackground: "#ffffff",
                    borderRadius: "12px",
                    fontFamily: "inherit",
                    fontSize: "15px",
                  },
                  elements: {
                    rootBox: "w-full",
                    cardBox: "w-full shadow-none",
                    card: "shadow-none border-0 p-0 bg-transparent w-full",
                    header: "hidden",
                    formButtonPrimary:
                      "bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold normal-case text-base py-3 rounded-xl shadow-none",
                    formFieldInput:
                      "bg-[#faf5ea] border border-[#cdbda3] rounded-xl py-3 text-[#241a12] focus:border-[#6c4d39]",
                    formFieldLabel: "text-[#6f5b46] font-semibold",
                    socialButtonsBlockButton:
                      "border border-[#cdbda3] rounded-xl py-3 hover:bg-[#faf5ea] text-[#241a12] normal-case font-semibold",
                    dividerLine: "bg-[#e3d6bf]",
                    dividerText: "text-[#8a7559]",
                    footer: "hidden",
                    footerAction: "hidden",
                  },
                }}
              />
            </div>
          </div>
        </div>

        <p className="text-[#8a7559] text-xs mt-4 text-center flex items-center justify-center gap-1.5">
          <IcoShield className="w-3.5 h-3.5" />
          Secured by Stripe &amp; Clerk · Corunna &amp; Gladwin, MI
        </p>
      </div>
    </div>
  );
}
