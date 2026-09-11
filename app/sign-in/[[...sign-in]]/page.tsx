import { SignIn } from "@clerk/nextjs";
import AuthSwitch from "@/app/components/AuthSwitch";
import { IcoBolt, IcoTrophy, IcoTruck, IcoShield } from "@/app/components/BidIcons";

const LOGO_URL =
  "https://assets.cdn.filesafe.space/TwuL7EwKfW8oGIV0Zo5q/media/6a373b261c5d711b35bf4e56.png";

const CHIPS: { Icon: (p: { className?: string }) => React.ReactElement; label: string }[] = [
  { Icon: IcoBolt, label: "Pick up where you left off" },
  { Icon: IcoTrophy, label: "Check your wins" },
  { Icon: IcoTruck, label: "Book a pickup" },
];

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f3ead6] to-[#ece0c9] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white border border-[#e3d6bf] rounded-3xl shadow-[0_24px_60px_-24px_rgba(108,77,57,0.5)] overflow-hidden">
          {/* Warm header band */}
          <div className="relative px-6 pt-7 pb-6 text-center text-white" style={{ background: "linear-gradient(140deg,#6c4d39,#8a5a2f)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_URL} alt="Northwood Bids" className="h-16 w-auto max-w-[200px] object-contain mx-auto mb-3 drop-shadow" />
            <h1 className="font-display text-[1.7rem] leading-tight font-black">Welcome back</h1>
            <p className="text-white/85 text-sm mt-1">Your bids, wins and pickups are right where you left them.</p>
          </div>

          {/* Benefit chips */}
          <div className="px-5 pt-4 flex flex-wrap justify-center gap-1.5">
            {CHIPS.map((c) => (
              <span key={c.label} className="inline-flex items-center gap-1.5 bg-[#faf5ea] border border-[#e3d6bf] text-[#6f5b46] text-xs font-bold px-2.5 py-1.5 rounded-full">
                <c.Icon className="w-3.5 h-3.5 text-[#6c4d39]" /> {c.label}
              </span>
            ))}
          </div>

          {/* Form */}
          <div className="px-5 sm:px-7 pt-5 pb-6">
            <AuthSwitch active="in" />
            <div className="mt-3">
              {/* fallback (not force) so an invite/deep link's redirect_url is honored —
                  e.g. /join?token=… returns here after login instead of being hijacked. */}
              <SignIn
                signUpUrl="/sign-up"
                fallbackRedirectUrl="/register"
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
          Secured by Stripe &amp; Clerk · Owosso &amp; Gladwin, MI
        </p>
      </div>
    </div>
  );
}
