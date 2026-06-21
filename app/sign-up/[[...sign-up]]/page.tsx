import { SignUp } from "@clerk/nextjs";

const LOGO_URL =
  "https://assets.cdn.filesafe.space/TwuL7EwKfW8oGIV0Zo5q/media/6a373b261c5d711b35bf4e56.png";

function ValueRow({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="w-9 h-9 rounded-xl bg-[#6c4d39]/10 border border-[#6c4d39]/20 text-[#6c4d39] flex items-center justify-center shrink-0">
        {children}
      </span>
      <div>
        <p className="font-semibold text-[#241a12] text-sm">{title}</p>
        <p className="text-sm text-[#6f5b46] leading-relaxed">{desc}</p>
      </div>
    </li>
  );
}

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#f1e7d5] text-[#241a12] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl grid gap-10 lg:grid-cols-2 items-center">
        {/* Value prop */}
        <div className="text-center lg:text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LOGO_URL}
            alt="Northwood Bids"
            className="h-28 sm:h-32 w-auto max-w-[280px] object-contain mx-auto lg:mx-0 mb-5 drop-shadow-sm"
          />
          <h1 className="font-display text-3xl sm:text-4xl font-black leading-tight mb-3">
            Create your free account
          </h1>
          <p className="text-[#6f5b46] text-base leading-relaxed mb-7 max-w-md mx-auto lg:mx-0">
            Bid in real time, get outbid the moment it happens, and check out
            securely when you win — with a handshake feel.
          </p>
          <ul className="space-y-4 max-w-md mx-auto lg:mx-0 text-left">
            <ValueRow title="Bid in real time" desc="Place bids or set a max bid and we'll auto-bid for you.">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 7l4 4-8 8H5v-4l8-8z" /><path d="m18.5 2.5 3 3" />
              </svg>
            </ValueRow>
            <ValueRow title="Never miss a win" desc="Get instant outbid and win alerts by text and email.">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </ValueRow>
            <ValueRow title="Secure checkout" desc="Your card is stored safely with Stripe and only charged if you win.">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
              </svg>
            </ValueRow>
          </ul>
        </div>

        {/* Clerk sign-up */}
        <div className="flex justify-center lg:justify-end">
          <SignUp forceRedirectUrl="/register" signInUrl="/sign-in" />
        </div>
      </div>
    </div>
  );
}
