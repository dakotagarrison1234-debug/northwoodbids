import { SignUp } from "@clerk/nextjs";
import AuthSwitch from "@/app/components/AuthSwitch";
import { IcoNew, IcoMagnifier, IcoCoin, IcoTruck, IcoGift, IcoShield, IcoBolt } from "@/app/components/BidIcons";

const LOGO_URL =
  "https://assets.cdn.filesafe.space/TwuL7EwKfW8oGIV0Zo5q/media/6a373b261c5d711b35bf4e56.png";

const VALUE_PROPS: { Icon: (p: { className?: string }) => React.ReactElement; title: string; desc: string }[] = [
  { Icon: IcoNew, title: "99% brand-new", desc: "Overstock & shelf-pulls — not broken junk." },
  { Icon: IcoMagnifier, title: "No condition tricks", desc: "Every lot's real condition, stated plain. No sneaky “Unknown.”" },
  { Icon: IcoCoin, title: "Bidding starts at $2", desc: "Every single lot opens at just two bucks." },
  { Icon: IcoTruck, title: "Free transfers", desc: "Won it at the other barn? We bring it to your pickup — free." },
  { Icon: IcoGift, title: "Free money: Bid Bucks", desc: "Earn $5 when a friend wins — up to $25 off your bills." },
  { Icon: IcoShield, title: "Only charged if you win", desc: "Card saved safely with Stripe. No win, no charge." },
];

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f3ead6] via-[#f1e7d5] to-[#ece0c9] text-[#241a12] px-4 py-8 sm:py-12">
      <div className="w-full max-w-5xl mx-auto grid gap-8 lg:gap-12 lg:grid-cols-2 items-center">
        {/* ── Pitch ─────────────────────────────────────────────────────────── */}
        <div className="text-center lg:text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LOGO_URL}
            alt="Northwood Bids"
            className="h-24 sm:h-28 w-auto max-w-[260px] object-contain mx-auto lg:mx-0 mb-4 drop-shadow-sm"
          />

          <span className="inline-flex items-center gap-1.5 bg-[#4a7c59] text-white text-[11px] font-black uppercase tracking-[0.16em] px-3 py-1 rounded-full mb-3">
            <IcoBolt className="w-3.5 h-3.5" /> Free to join · 30 seconds
          </span>

          <h1 className="font-display text-[2.3rem] sm:text-5xl font-black leading-[0.95] mb-3">
            Real deals.
            <br />
            <span className="text-[#6c4d39]">Real conditions.</span>
            <br />
            Actual steals.
          </h1>
          <p className="text-[#6f5b46] text-base sm:text-lg leading-relaxed mb-6 max-w-md mx-auto lg:mx-0">
            Brand-name overstock auctioned honest — bidding opens at <strong className="text-[#241a12]">$2</strong>,
            conditions stated straight, and your card&apos;s only touched if you win.
          </p>

          {/* Value grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl mx-auto lg:mx-0 text-left">
            {VALUE_PROPS.map((v) => (
              <div key={v.title} className="flex items-start gap-3 bg-white/70 border border-[#e3d6bf] rounded-2xl px-3.5 py-3">
                <span className="w-9 h-9 rounded-xl bg-[#6c4d39]/10 text-[#6c4d39] flex items-center justify-center shrink-0">
                  <v.Icon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-black text-[#241a12] text-sm leading-tight">{v.title}</p>
                  <p className="text-[#6f5b46] text-xs leading-snug mt-0.5">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[#8a7559] text-xs mt-5">
            Local pickup in Owosso &amp; Gladwin, Michigan.
          </p>
        </div>

        {/* ── Sign-up form ──────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center w-full">
          <div className="w-full max-w-md bg-white border border-[#e3d6bf] rounded-3xl shadow-[0_24px_60px_-24px_rgba(108,77,57,0.5)] p-5 sm:p-7">
            <div className="text-center mb-4">
              <h2 className="font-display text-2xl font-black text-[#241a12]">Create your free account</h2>
              <p className="text-sm text-[#6f5b46] mt-1">Start bidding in under a minute.</p>
            </div>

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

          <p className="text-[#8a7559] text-xs mt-4 text-center flex items-center justify-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
            Secured by Stripe &amp; Clerk · we never sell your info
          </p>
        </div>
      </div>
    </div>
  );
}
