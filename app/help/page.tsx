import Link from "next/link";
import { PineRidge, BranchDivider, PineMark } from "@/app/components/Illustrations";
import {
  IcoGavel, IcoBolt, IcoCoin, IcoTruck, IcoGift, IcoShield, IcoUsers, IcoMegaphone,
} from "@/app/components/BidIcons";

export const metadata = {
  title: "Help & FAQ | Northwood Bids",
  description:
    "How bidding works at Northwood Bids: $2 starts, max bids, buyer's premium and tax, pickup in Owosso and Gladwin, free transfers, Bid Bucks and when your card is charged.",
};

/* ── Building blocks ──────────────────────────────────────────────────────── */

type Icon = (p: { className?: string }) => React.ReactElement;

/** One collapsible question. Native <details> so it works with no JS and the
    browser handles keyboard + a11y. `open` pre-expands the essentials. */
function Q({ q, children, open = false }: { q: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-[#efe3d0] last:border-0">
      <summary className="flex items-center justify-between gap-4 py-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-[15px] text-[#241a12] leading-snug">{q}</span>
        <span className="w-7 h-7 rounded-full border border-[#e3d6bf] bg-[#fbf4e6] text-[#6c4d39] grid place-items-center shrink-0 transition-transform duration-200 group-open:rotate-45 group-open:bg-[#6c4d39] group-open:text-white group-open:border-[#6c4d39]">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9" /></svg>
        </span>
      </summary>
      <div className="pb-4 pr-2 text-sm text-[#4a3a2b] leading-relaxed space-y-2.5 [&_strong]:text-[#241a12] [&_a]:text-[#6c4d39] [&_a]:font-semibold [&_a:hover]:underline">
        {children}
      </div>
    </details>
  );
}

/** A topic card: icon, slab-serif title, and its stack of questions. */
function Topic({ id, Icon, title, blurb, children }: { id: string; Icon: Icon; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 pt-5 pb-3.5 border-b border-[#efe3d0] bg-[#fbf4e6]/60">
        <span className="w-10 h-10 rounded-xl bg-[#6c4d39] text-[#f6ecda] grid place-items-center shrink-0 shadow-[0_4px_0_#3f2c1f]">
          <Icon className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-[#241a12] leading-tight">{title}</h2>
          <p className="text-xs text-[#8a7559] mt-0.5">{blurb}</p>
        </div>
      </div>
      <div className="px-5">{children}</div>
    </section>
  );
}

const TOPICS: { id: string; label: string; Icon: Icon }[] = [
  { id: "bidding", label: "Bidding", Icon: IcoGavel },
  { id: "max-bid", label: "Max bids", Icon: IcoBolt },
  { id: "money", label: "What you pay", Icon: IcoCoin },
  { id: "pickup", label: "Pickup & transfers", Icon: IcoTruck },
  { id: "bid-bucks", label: "Bid Bucks", Icon: IcoGift },
  { id: "account", label: "Your account", Icon: IcoUsers },
];

const INCREMENTS: [string, string][] = [
  ["$0 – $11", "$1"],
  ["$12 – $99", "$2"],
  ["$100 – $499", "$5"],
  ["$500 – $999", "$10"],
  ["$1,000 – $4,999", "$25"],
  ["$5,000 +", "$50"],
];

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-[#e3d6bf]" style={{ background: "linear-gradient(160deg,#241a12 0%,#3a2a1b 60%,#4a3524 100%)" }}>
        <PineRidge className="absolute inset-x-0 bottom-0 w-full h-28 opacity-25 pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-6 sm:px-8 pt-12 pb-24 sm:pt-16 sm:pb-28 text-[#f6ecda]">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#f0a35a] mb-2">Help &amp; FAQ</p>
          <h1 className="font-display text-3xl sm:text-5xl font-black leading-[1.05] max-w-2xl">
            Straight answers, no fine-print runaround.
          </h1>
          <p className="text-[#f6ecda]/80 text-base sm:text-lg mt-3 max-w-xl leading-relaxed">
            How bidding works, what you actually pay, and how to get your winnings home to Owosso or Gladwin.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {TOPICS.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/15 text-[#f6ecda] text-xs font-bold px-3 py-1.5 rounded-full transition-colors"
              >
                <t.Icon className="w-3.5 h-3.5 text-[#f0a35a]" /> {t.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 sm:px-8 py-10">
        {/* The three things every new bidder asks first. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10 -mt-24 sm:-mt-28 relative">
          {[
            { Icon: IcoGavel, k: "Every lot starts at $2", v: "Brand-name overstock, no reserves. Where it lands is up to the room." },
            { Icon: IcoShield, k: "Charged only if you win", v: "A card on file is required to bid. It's untouched unless the hammer falls your way." },
            { Icon: IcoTruck, k: "Pick up in Owosso or Gladwin", v: "Win anywhere, collect at your spot. Transfers between the two are free." },
          ].map((c) => (
            <div key={c.k} className="bg-white border border-[#e3d6bf] rounded-2xl p-4 shadow-[0_14px_30px_-20px_rgba(36,26,18,0.45)]">
              <c.Icon className="w-5 h-5 text-[#c47b3e] mb-2" />
              <div className="font-display font-bold text-[15px] leading-tight">{c.k}</div>
              <p className="text-xs text-[#6f5b46] mt-1 leading-relaxed">{c.v}</p>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          {/* ── Bidding ── */}
          <Topic id="bidding" Icon={IcoGavel} title="Bidding" blurb="The basics: how a lot goes from $2 to sold.">
            <Q q="How does an auction here work?" open>
              <p>Every lot opens at <strong>$2</strong> and runs until its posted end time. The highest bid when the clock hits zero wins. The page updates live, so you never have to refresh to see where things stand.</p>
              <p>Two ways to bid on any lot: tap <strong>Bid</strong> in the bar at the bottom of the screen to go one step above the current price (tap once to arm, tap again to confirm), or set a <strong>max bid</strong> and let us do the bidding for you.</p>
            </Q>
            <Q q="What is the minimum I can raise a bid by?">
              <p>Increments scale with the price so small lots stay small and big lots move.</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 max-w-xs text-[13px] tabular-nums bg-[#fbf4e6] border border-[#efe3d0] rounded-xl px-4 py-3">
                {INCREMENTS.map(([range, step]) => (
                  <div key={range} className="contents">
                    <span className="text-[#6f5b46]">{range}</span>
                    <span className="font-bold text-[#241a12] text-right">+{step}</span>
                  </div>
                ))}
              </div>
            </Q>
            <Q q="Why does the clock sometimes add time at the end?">
              <p>A bid inside the last <strong>two minutes</strong> pushes that lot&apos;s end time out by two more, so nobody gets sniped at the buzzer. It keeps things fair for the person who was leading and the person who just bid. The new end time shows on the page the moment it changes.</p>
            </Q>
            <Q q="Can I take a bid back?">
              <p>No. A bid is a handshake. Once it&apos;s placed it stands, so bid what you&apos;re comfortable paying. If you&apos;re unsure, set a max bid instead of tapping through increments.</p>
            </Q>
            <Q q="How will I know if I've been outbid?">
              <p>We text you, and the lot page shows a red <strong>You&apos;ve been outbid</strong> banner until you&apos;re back in front. Your <Link href="/dashboard">dashboard</Link> lists everything you&apos;re winning and losing at a glance.</p>
            </Q>
            <Q q="Can other bidders see who I am?">
              <p>No. On the lot page you appear as an anonymous bidder, and your max bid is never shown to anyone.</p>
            </Q>
          </Topic>

          {/* ── Max bids ── */}
          <Topic id="max-bid" Icon={IcoBolt} title="Max bids" blurb="Set it once. We hold the line while you get on with your day.">
            <Q q="What is a max bid?" open>
              <p>The most you&apos;d pay for a lot. You enter it once; from then on we place the smallest bid needed to keep you in front, every time someone else bids, instantly, right up to your number and never past it.</p>
              <p>If nobody pushes you, you win for less than your max. If someone sets a higher max than yours, you&apos;re outbid and we text you so you can decide whether to go higher.</p>
            </Q>
            <Q q="Show me an example.">
              <p>The lot sits at $20. You set a max of <strong>$85</strong>. We bid $22 for you. Someone else bids $25; we answer with $27. Nobody else shows up, so the lot closes at <strong>$27</strong>. Your other $58 stays in your pocket.</p>
            </Q>
            <Q q="Is my max bid private?">
              <p>Completely. Other bidders only ever see the current price. Your ceiling is between you and us.</p>
            </Q>
            <Q q="Can I change or cancel a max bid?">
              <p>Yes, from the lot page. Raise it any time. Cancelling stops future auto-bids, but any bids already placed for you still stand.</p>
            </Q>
          </Topic>

          {/* ── What you pay ── */}
          <Topic id="money" Icon={IcoCoin} title="What you pay" blurb="No surprises at checkout. Here's the whole bill.">
            <Q q="When is my card charged?" open>
              <p>Only if you win, and only when the auction closes. Placing a bid does not charge you. Losing does not charge you. The lot page shows a <strong>Total if you win</strong> figure before you commit, so the number you see is the number you pay.</p>
            </Q>
            <Q q="Is there a buyer's premium or tax?">
              <p>The lot page breaks it down for you: your winning bid, plus the buyer&apos;s premium and Michigan sales tax where they apply. Tap <strong>Total if you win</strong> on any lot to see the exact split for that item.</p>
            </Q>
            <Q q="Why do I need a card on file before I can bid?">
              <p>It keeps the room honest. Everyone who bids can pay, so winners are real and lots don&apos;t get tied up. Cards are stored by Stripe; we never see or keep your card number.</p>
            </Q>
            <Q q="What if a charge fails?">
              <p>You&apos;ll get a text, and your <Link href="/dashboard">dashboard</Link> shows a retry button so you can use the card on file or add a new one. Lots that go unpaid for too long may be offered to the next bidder.</p>
            </Q>
            <Q q="Are refunds a thing?">
              <p>All sales are final. Lots are brand-name overstock sold as described and photographed. If something is genuinely not as listed, call us at <a href="tel:+18108181772">(810) 818-1772</a> and we&apos;ll make it right.</p>
            </Q>
          </Topic>

          {/* ── Pickup ── */}
          <Topic id="pickup" Icon={IcoTruck} title="Pickup & transfers" blurb="Two spots, one appointment, no waiting on a phone call.">
            <Q q="Where do I pick up what I've won?" open>
              <p>At either of our two locations: <strong>Owosso</strong> or <strong>Gladwin</strong>. Pick your usual spot on the <Link href="/pickup">Pickup</Link> page and book a time that suits you. Everything you win before that appointment rides along on it automatically.</p>
            </Q>
            <Q q="What if a lot is stored at the other location?">
              <p>We move it to your spot for free. Transfers usually take about five to six days, and we text you the moment it lands so you can book your pickup. A lot marked <strong>Pickup here only</strong> stays where it is; plan to collect those in person.</p>
            </Q>
            <Q q="Can you ship it?">
              <p>Not right now. Everything is local pickup, which is a big part of how the prices stay where they are.</p>
            </Q>
            <Q q="How long do I have to collect?">
              <p>Book your pickup as soon as you can after the win; we&apos;ll remind you by text. If life gets in the way, call us at <a href="tel:+18108181772">(810) 818-1772</a> and we&apos;ll work something out.</p>
            </Q>
          </Topic>

          {/* ── Bid Bucks ── */}
          <Topic id="bid-bucks" Icon={IcoGift} title="Bid Bucks" blurb="Bring a friend, knock $5 off your next bill.">
            <Q q="How do Bid Bucks work?" open>
              <p>Share your invite link from the <Link href="/refer">Bid Bucks</Link> page. When a friend signs up through it, wins a lot, and their payment goes through, you earn a <strong>$5</strong> coupon. It comes off your <strong>next</strong> winning bill automatically, nothing to type in.</p>
            </Q>
            <Q q="Is there a limit?">
              <p>Up to five friends, so up to $25. One coupon per bill, on bills of $5 or more.</p>
            </Q>
            <Q q="What doesn't count?">
              <p>Inviting yourself, or accounts that share your phone number or card. Bid Bucks have no cash value and can&apos;t be transferred.</p>
            </Q>
          </Topic>

          {/* ── Account ── */}
          <Topic id="account" Icon={IcoUsers} title="Your account" blurb="Profile, notifications and the password reset you'll forget you needed.">
            <Q q="How do I update my phone number or card?">
              <p>Head to <Link href="/account">Account</Link>. Keep your phone number current: outbid alerts, transfer arrivals and pickup reminders all go by text.</p>
            </Q>
            <Q q="I forgot my password.">
              <p>On the <Link href="/sign-in">sign-in</Link> page tap <strong>Forgot password?</strong>, enter your email, and follow the link we send. It expires after an hour, so check spam if it doesn&apos;t show up.</p>
            </Q>
            <Q q="Where is everything I've bid on?">
              <p>Your <Link href="/dashboard">dashboard</Link>: active bids, wins, payment status and pickup details, all in one place. Lots you&apos;ve starred live on your <Link href="/watchlist">watchlist</Link>.</p>
            </Q>
            <Q q="Can I bid without an account?">
              <p>No. An account and a card on file are what make every bid in the room real. Signing up takes about a minute.</p>
            </Q>
          </Topic>
        </div>

        <BranchDivider className="w-56 h-6 mx-auto my-10 opacity-80" />

        {/* Still stuck */}
        <div className="relative overflow-hidden bg-white border border-[#e3d6bf] rounded-2xl p-6 sm:p-8 text-center">
          <PineMark className="absolute -left-4 -bottom-4 w-24 h-24 opacity-[0.06] pointer-events-none" />
          <PineMark className="absolute -right-4 -top-4 w-24 h-24 opacity-[0.06] pointer-events-none" />
          <IcoMegaphone className="w-6 h-6 text-[#c47b3e] mx-auto mb-2" />
          <h2 className="font-display text-xl font-bold">Still stuck?</h2>
          <p className="text-sm text-[#6f5b46] mt-1 max-w-md mx-auto leading-relaxed">
            A real person picks up. Call or text <a href="tel:+18108181772" className="text-[#6c4d39] font-bold hover:underline">(810) 818-1772</a> and we&apos;ll sort it out.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            <Link href="/auctions" className="inline-flex items-center gap-2 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors">
              <IcoGavel className="w-4 h-4" /> See what&apos;s on the block
            </Link>
            <Link href="/terms" className="inline-flex items-center border border-[#cdbda3] hover:border-[#6c4d39] text-[#4a3a2b] font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors">
              Terms of service
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
