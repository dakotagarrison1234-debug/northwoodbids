import Link from "next/link";

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ id, title, icon, children }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-[#6c4d39]/10 border border-[#6c4d39]/20 flex items-center justify-center text-[#6c4d39] shrink-0">
          {icon}
        </div>
        <h2 className="text-xl font-bold text-[#241a12]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// ── Callout box ────────────────────────────────────────────────────────────────
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#6c4d39]/8 border border-[#6c4d39]/20 rounded-xl p-4 text-sm text-[#241a12] leading-relaxed my-4">
      <span className="font-semibold text-[#6c4d39]">Tip: </span>{children}
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-[#241a12] leading-relaxed my-4">
      <span className="font-semibold text-amber-600">Note: </span>{children}
    </div>
  );
}

// ── FAQ item ───────────────────────────────────────────────────────────────────
function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#e3d6bf] pb-5 mb-5 last:border-0 last:mb-0 last:pb-0">
      <p className="font-semibold text-[#241a12] mb-2">{q}</p>
      <p className="text-sm text-[#6f5b46] leading-relaxed">{children}</p>
    </div>
  );
}

// ── TOC Link ───────────────────────────────────────────────────────────────────
function TocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="block text-sm text-[#6c4d39] hover:text-[#563e2c] hover:underline py-0.5 transition-colors">
      {children}
    </a>
  );
}

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-[#f6efe1]">
      <div className="max-w-4xl mx-auto px-6 sm:px-8 py-10">

        {/* Hero */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#241a12] mb-3">Info & Help</h1>
          <p className="text-[#6f5b46] text-lg leading-relaxed max-w-2xl">
            Everything you need to bid with confidence — how bidding works, increment tables, Max Bid strategy, payments, and more.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">

          {/* Sticky TOC (desktop) */}
          <aside className="hidden lg:block w-52 shrink-0">
            <div className="sticky top-24 bg-white border border-[#e3d6bf] rounded-2xl p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-[#b3a085] mb-3">On This Page</p>
              <nav className="space-y-0.5">
                <TocLink href="#how-bidding-works">How Bidding Works</TocLink>
                <TocLink href="#max-bid">Max Bid (Proxy)</TocLink>
                <TocLink href="#bid-table">Bid Increment Table</TocLink>
                <TocLink href="#winning">Winning an Item</TocLink>
                <TocLink href="#payment">Payment</TocLink>
                <TocLink href="#bid-bucks">Bid Bucks (Referrals)</TocLink>
                <TocLink href="#account">Your Account</TocLink>
                <TocLink href="#password">Password Reset</TocLink>
                <TocLink href="#faq">FAQ</TocLink>
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 space-y-12">

            {/* ── How Bidding Works ── */}
            <Section id="how-bidding-works" title="How Bidding Works" icon={
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 3L10 7l5 5 4-4-5-5zM3 21l7-7"/>
              </svg>
            }>
              <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 space-y-4 text-sm text-[#4a3a2b] leading-relaxed">
                <p>
                  Northwood Bids uses a <strong className="text-[#241a12]">live online auction</strong> format. Items are listed with a starting bid, and the highest bid when time runs out wins.
                </p>
                <ol className="space-y-3 list-none">
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#6c4d39] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <span><strong className="text-[#241a12]">Find an item</strong> — Browse open auctions, click an item you want, and see the current bid.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#6c4d39] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <span><strong className="text-[#241a12]">Add a card</strong> — You'll be prompted to add a payment card before your first bid. This card is only charged if you win.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#6c4d39] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <span><strong className="text-[#241a12]">Place your bid</strong> — Enter an amount at or above the minimum and tap "Place Bid." You'll see a confirmation instantly.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#6c4d39] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">4</span>
                    <span><strong className="text-[#241a12]">Watch for outbids</strong> — If someone tops your bid, you'll be notified. You can come back and bid again.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#6c4d39] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">5</span>
                    <span><strong className="text-[#241a12]">Win & pay</strong> — When the auction ends, winners are charged automatically. You can also pay manually from your dashboard.</span>
                  </li>
                </ol>
                <Tip>The item page updates in real time — you don't need to refresh to see new bids.</Tip>
              </div>
            </Section>

            {/* ── Max Bid ── */}
            <Section id="max-bid" title="Max Bid (Proxy Bidding)" icon={
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
              </svg>
            }>
              <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 space-y-5 text-sm text-[#4a3a2b] leading-relaxed">
                <p>
                  <strong className="text-[#241a12]">Max Bid</strong> lets the system bid for you automatically — up to a limit you set. You don't have to watch the auction constantly.
                </p>

                <div>
                  <p className="font-semibold text-[#241a12] mb-2">How it works:</p>
                  <ul className="space-y-2">
                    <li className="flex gap-2"><span className="text-[#6c4d39] font-bold mt-0.5">→</span><span>You set the <strong className="text-[#241a12]">most you're willing to pay</strong> — your Max Bid amount.</span></li>
                    <li className="flex gap-2"><span className="text-[#6c4d39] font-bold mt-0.5">→</span><span>The system automatically places the <strong className="text-[#241a12]">smallest bid needed</strong> to keep you in the lead.</span></li>
                    <li className="flex gap-2"><span className="text-[#6c4d39] font-bold mt-0.5">→</span><span>If someone outbids you, the system counter-bids <strong className="text-[#241a12]">instantly</strong> — up to your max.</span></li>
                    <li className="flex gap-2"><span className="text-[#6c4d39] font-bold mt-0.5">→</span><span>If someone's max is higher than yours, you'll be outbid. The system will notify you so you can decide whether to raise your max.</span></li>
                    <li className="flex gap-2"><span className="text-[#6c4d39] font-bold mt-0.5">→</span><span>You <strong className="text-[#241a12]">only pay what's needed to win</strong> — not necessarily your full max amount.</span></li>
                  </ul>
                </div>

                <div className="bg-[#efe3d0] rounded-xl p-4 space-y-3">
                  <p className="font-semibold text-[#241a12] text-xs uppercase tracking-wider">Example</p>
                  <p>Current bid is <strong>$50</strong>. You set a Max Bid of <strong>$200</strong>.</p>
                  <p>The system immediately bids <strong>$55</strong> (the next valid increment) to put you in the lead. Another bidder comes in at $100 — the system auto-bids <strong>$110</strong> for you. Another bidder sets their max at $250 — they beat your $200 limit and you're notified to decide if you want to raise your max.</p>
                  <p>If no one exceeds your max, <strong>you win at the lowest price needed</strong> to beat the competition.</p>
                </div>

                <Tip>Set your Max Bid to the true most you'd pay for the item. The system won't go over it, and you'll often pay less than that amount.</Tip>
                <Warn>Your Max Bid amount is private — other bidders can't see it. They only see the current displayed bid.</Warn>
              </div>
            </Section>

            {/* ── Bid Increment Table ── */}
            <Section id="bid-table" title="Bid Increment Table" icon={
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
              </svg>
            }>
              <div className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden text-sm">
                <div className="px-6 py-4 border-b border-[#e3d6bf]">
                  <p className="text-[#4a3a2b] leading-relaxed">
                    Bid increments are the <strong className="text-[#241a12]">minimum amount</strong> each new bid must increase over the current bid. They scale with the item's value.
                  </p>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full min-w-[440px]">
                  <thead>
                    <tr className="bg-[#efe3d0]">
                      <th className="text-left px-6 py-3 text-xs font-bold uppercase tracking-wider text-[#8a7559]">Current Bid</th>
                      <th className="text-left px-6 py-3 text-xs font-bold uppercase tracking-wider text-[#8a7559]">Min. Increment</th>
                      <th className="text-left px-6 py-3 text-xs font-bold uppercase tracking-wider text-[#8a7559]">Example</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e3d6bf]">
                    <tr className="hover:bg-[#f6efe1] transition-colors">
                      <td className="px-6 py-3.5 font-medium text-[#241a12]">$0 – $9.99</td>
                      <td className="px-6 py-3.5"><span className="bg-[#6c4d39]/10 text-[#6c4d39] font-bold px-2 py-0.5 rounded-lg">$1</span></td>
                      <td className="px-6 py-3.5 text-[#6f5b46]">$5 → next min. $6</td>
                    </tr>
                    <tr className="hover:bg-[#f6efe1] transition-colors">
                      <td className="px-6 py-3.5 font-medium text-[#241a12]">$10 – $29.99</td>
                      <td className="px-6 py-3.5"><span className="bg-[#6c4d39]/10 text-[#6c4d39] font-bold px-2 py-0.5 rounded-lg">$2</span></td>
                      <td className="px-6 py-3.5 text-[#6f5b46]">$20 → next min. $22</td>
                    </tr>
                    <tr className="hover:bg-[#f6efe1] transition-colors">
                      <td className="px-6 py-3.5 font-medium text-[#241a12]">$30 – $99.99</td>
                      <td className="px-6 py-3.5"><span className="bg-[#6c4d39]/10 text-[#6c4d39] font-bold px-2 py-0.5 rounded-lg">$5</span></td>
                      <td className="px-6 py-3.5 text-[#6f5b46]">$75 → next min. $80</td>
                    </tr>
                    <tr className="hover:bg-[#f6efe1] transition-colors">
                      <td className="px-6 py-3.5 font-medium text-[#241a12]">$100 – $499.99</td>
                      <td className="px-6 py-3.5"><span className="bg-[#6c4d39]/10 text-[#6c4d39] font-bold px-2 py-0.5 rounded-lg">$10</span></td>
                      <td className="px-6 py-3.5 text-[#6f5b46]">$250 → next min. $260</td>
                    </tr>
                    <tr className="hover:bg-[#f6efe1] transition-colors">
                      <td className="px-6 py-3.5 font-medium text-[#241a12]">$500 – $999.99</td>
                      <td className="px-6 py-3.5"><span className="bg-[#6c4d39]/10 text-[#6c4d39] font-bold px-2 py-0.5 rounded-lg">$25</span></td>
                      <td className="px-6 py-3.5 text-[#6f5b46]">$600 → next min. $625</td>
                    </tr>
                    <tr className="hover:bg-[#f6efe1] transition-colors">
                      <td className="px-6 py-3.5 font-medium text-[#241a12]">$1,000+</td>
                      <td className="px-6 py-3.5"><span className="bg-[#6c4d39]/10 text-[#6c4d39] font-bold px-2 py-0.5 rounded-lg">$50</span></td>
                      <td className="px-6 py-3.5 text-[#6f5b46]">$1,500 → next min. $1,550</td>
                    </tr>
                  </tbody>
                </table>
                </div>
                <div className="px-6 py-4 border-t border-[#e3d6bf] bg-[#f6efe1]">
                  <Tip>When using Max Bid, the system always uses the <strong>minimum valid increment</strong> — so you never overbid by accident.</Tip>
                </div>
              </div>
            </Section>

            {/* ── Winning ── */}
            <Section id="winning" title="Winning an Item" icon={
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15c4.41 0 8-1.79 8-4V7c0-2.21-3.59-4-8-4S4 4.79 4 7v4c0 2.21 3.59 4 8 4z"/>
                <path d="M4 11c0 2.21 3.59 4 8 4s8-1.79 8-4"/>
                <path d="M4 15c0 2.21 3.59 4 8 4s8-1.79 8-4"/>
              </svg>
            }>
              <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 space-y-4 text-sm text-[#4a3a2b] leading-relaxed">
                <p>When an auction closes, the highest bidder on each item wins. Here's what happens next:</p>
                <ul className="space-y-3">
                  <li className="flex gap-2"><span className="text-[#6c4d39] font-bold">→</span><span><strong className="text-[#241a12]">Automatic charge:</strong> Your saved card is charged for your winning amount automatically when the auction closes.</span></li>
                  <li className="flex gap-2"><span className="text-[#6c4d39] font-bold">→</span><span><strong className="text-[#241a12]">Email notification:</strong> You'll receive an email confirming your win and the items you've won.</span></li>
                  <li className="flex gap-2"><span className="text-[#6c4d39] font-bold">→</span><span><strong className="text-[#241a12]">My Bids dashboard:</strong> Head to your dashboard to see all your wins, payment status, and pickup details.</span></li>
                  <li className="flex gap-2"><span className="text-[#6c4d39] font-bold">→</span><span><strong className="text-[#241a12]">Schedule your own pickup:</strong> Once payment is confirmed, head to <Link href="/pickup" className="text-[#6c4d39] hover:underline font-medium">Pickup</Link> to choose a location and a time that works for you — no waiting for a call. If your items are at a different location, you can request a transfer there first (transfers usually take about 5–6 days).</span></li>
                </ul>
                <Warn>If your card payment fails, you'll receive a notification and can retry payment from your dashboard. Items may be released to the next bidder if payment isn't completed promptly.</Warn>
              </div>
            </Section>

            {/* ── Payment ── */}
            <Section id="payment" title="Payment" icon={
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2"/>
                <line x1="1" y1="10" x2="23" y2="10"/>
              </svg>
            }>
              <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 space-y-5 text-sm text-[#4a3a2b] leading-relaxed">
                <div>
                  <p className="font-semibold text-[#241a12] mb-2">Adding a card</p>
                  <p>Before your first bid, you'll be asked to add a payment card. This is required to participate. Your card is stored securely via Stripe and is only charged if you win.</p>
                </div>
                <div>
                  <p className="font-semibold text-[#241a12] mb-2">Managing your cards</p>
                  <p>Go to <Link href="/account" className="text-[#6c4d39] hover:underline font-medium">Account → Payment Methods</Link> to see your saved cards. You can add a new card or update your card from there at any time.</p>
                </div>
                <div>
                  <p className="font-semibold text-[#241a12] mb-2">When am I charged?</p>
                  <p>You are only charged when you <strong className="text-[#241a12]">win an item</strong> and the auction closes. Placing a bid does not charge your card. Losing a bid does not charge your card.</p>
                </div>
                <Tip>You can also pay manually from the <Link href="/dashboard" className="text-[#6c4d39] hover:underline font-medium">My Bids</Link> dashboard if auto-charge didn't go through — just tap "Pay Now" next to your won items.</Tip>
              </div>
            </Section>

            {/* ── Bid Bucks ── */}
            <Section id="bid-bucks" title="Bid Bucks (Referrals)" icon={
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="8" width="18" height="12" rx="2"/><path d="M3 12h18M12 8v12"/>
                <path d="M12 8S9 2.5 6.5 4s2 4 5.5 4zM12 8s3-5.5 5.5-4-2 4-5.5 4z"/>
              </svg>
            }>
              <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 space-y-5 text-sm text-[#4a3a2b] leading-relaxed">
                <p>
                  Invite friends and earn <strong className="text-[#241a12]">$5 in Bid Bucks</strong> toward your own bill. Grab your personal invite link on the <Link href="/refer" className="text-[#6c4d39] hover:underline font-medium">Bid Bucks</Link> page and share it.
                </p>
                <div>
                  <p className="font-semibold text-[#241a12] mb-2">How you earn</p>
                  <ul className="space-y-2">
                    <li className="flex gap-2"><span className="text-[#6c4d39] font-bold mt-0.5">→</span><span>A friend signs up through <strong className="text-[#241a12]">your link</strong> (they need to be new to Northwood Bids).</span></li>
                    <li className="flex gap-2"><span className="text-[#6c4d39] font-bold mt-0.5">→</span><span>They <strong className="text-[#241a12]">win an item and their payment goes through</strong> — that's when your $5 unlocks. Signing up or just bidding doesn't count.</span></li>
                    <li className="flex gap-2"><span className="text-[#6c4d39] font-bold mt-0.5">→</span><span>You can earn from up to <strong className="text-[#241a12]">5 friends</strong> — that's $25 in Bid Bucks.</span></li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-[#241a12] mb-2">How it's used</p>
                  <p>$5 comes off your next bill <strong className="text-[#241a12]">automatically</strong> — one credit per bill, on bills of $5 or more. No codes to enter.</p>
                </div>
                <Warn>Self-referrals don't qualify, and neither do accounts that share your phone number or payment card. Bid Bucks have no cash value.</Warn>
              </div>
            </Section>

            {/* ── Account ── */}
            <Section id="account" title="Your Account" icon={
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4"/>
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
            }>
              <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 space-y-5 text-sm text-[#4a3a2b] leading-relaxed">
                <div>
                  <p className="font-semibold text-[#241a12] mb-2">Update your profile</p>
                  <p>Visit <Link href="/account" className="text-[#6c4d39] hover:underline font-medium">Account</Link> to update your name, email address, and phone number. Keeping your phone number current ensures you receive text notifications about your bids.</p>
                </div>
                <div>
                  <p className="font-semibold text-[#241a12] mb-2">Staying in the loop</p>
                  <p>When you register, you're automatically linked to Northwood Bids. This means you'll receive notifications when auctions go live or are ending soon.</p>
                </div>
                <div>
                  <p className="font-semibold text-[#241a12] mb-2">Bid history</p>
                  <p>Your full bid history — active bids, past bids, wins, and payment status — is all available in your <Link href="/dashboard" className="text-[#6c4d39] hover:underline font-medium">Dashboard</Link>.</p>
                </div>
              </div>
            </Section>

            {/* ── Password Reset ── */}
            <Section id="password" title="Password Reset" icon={
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            }>
              <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 space-y-4 text-sm text-[#4a3a2b] leading-relaxed">
                <p>If you've forgotten your password or need to change it:</p>
                <ol className="space-y-3 list-none">
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#6c4d39] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <span>Go to the <Link href="/sign-in" className="text-[#6c4d39] hover:underline font-medium">Sign In</Link> page.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#6c4d39] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <span>Click <strong className="text-[#241a12]">"Forgot password?"</strong> below the sign-in form.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#6c4d39] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <span>Enter your email address. You'll receive a reset link within a minute or two.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#6c4d39] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">4</span>
                    <span>Click the link in the email and choose a new password.</span>
                  </li>
                </ol>
                <Warn>Check your spam/junk folder if you don't see the reset email within a few minutes. The reset link expires after 1 hour.</Warn>
                <p>To change your password while already signed in, use your account settings via the user menu in the top-right corner.</p>
              </div>
            </Section>

            {/* ── FAQ ── */}
            <Section id="faq" title="FAQ" icon={
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            }>
              <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6">
                <Q q="Can I cancel or retract a bid?">
                  No — bids are binding commitments. Once you place a bid, it cannot be cancelled. Make sure you're comfortable paying that amount before confirming.
                </Q>
                <Q q="What happens if there's a tie?">
                  Ties don't happen in practice — bids must meet the minimum increment, so two bids can't land on exactly the same amount simultaneously. The system processes bids in order received.
                </Q>
                <Q q="Can I bid on multiple items in the same auction?">
                  Yes. You can bid on as many items as you'd like across the same or different auctions. If you win multiple items, they may be bundled into a single payment.
                </Q>
                <Q q="Is my Max Bid visible to other bidders?">
                  No. Your Max Bid amount is completely private. Other bidders only see the current displayed bid amount, not your maximum.
                </Q>
                <Q q="What if I'm outbid right before the auction ends?">
                  Auctions close at a fixed time. If you're outbid in the final moments, you won't have time to rebid — which is why setting a Max Bid is a great strategy. The system will automatically defend your position up to your max, even in the final seconds.
                </Q>
                <Q q="Why do I need to add a card before bidding?">
                  A card on file ensures that when you win, payment is instant and seamless — no chasing down winners after the fact. Your card is not charged unless you win.
                </Q>
                <Q q="How do I pick up an item I won?">
                  You schedule it yourself. After payment is confirmed, go to the <Link href="/pickup" className="text-[#6c4d39] hover:underline font-medium">Pickup</Link> page, pick a location, and choose a date and time that works for you. Any items you win before that date are added to the same appointment automatically. If an item is stored at a different location, request a transfer to your pickup location first — transfers usually take about 5–6 days.
                </Q>
                <Q q="Can I bid without creating an account?">
                  No — an account is required to bid. This protects all bidders by ensuring everyone is accountable for their bids and there's a verified way to contact winners.
                </Q>
              </div>
            </Section>

            {/* Footer CTA */}
            <div className="bg-gradient-to-br from-[#6c4d39]/10 to-[#6c4d39]/5 border border-[#6c4d39]/20 rounded-2xl p-6 text-center">
              <p className="font-semibold text-[#241a12] mb-1">Still have questions?</p>
              <p className="text-sm text-[#6f5b46] mb-4">Reach out to the business running the auction you're participating in — they'll have the most specific answers about their event.</p>
              <Link href="/auctions" className="inline-block bg-[#6c4d39] hover:bg-[#563e2c] text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors">
                Browse Open Auctions
              </Link>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
