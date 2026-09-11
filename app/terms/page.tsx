import Link from "next/link";
import { PineRidge, PineMark } from "@/app/components/Illustrations";

export const metadata = {
  title: "Terms of Service | Northwood Bids",
  description: "Terms of Service for Northwood Bids.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      {/* Header band */}
      <div className="relative overflow-hidden border-b border-[#e3d6bf]" style={{ background: "linear-gradient(160deg,#241a12 0%,#3a2a1b 60%,#4a3524 100%)" }}>
        <PineRidge className="absolute inset-x-0 bottom-0 w-full h-24 opacity-20 pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-6 sm:px-8 pt-12 pb-14 sm:pt-16 sm:pb-16 text-[#f6ecda]">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#f0a35a] mb-2">Terms of Service</p>
          <h1 className="font-display text-3xl sm:text-4xl font-black leading-tight max-w-2xl">The handshake, in writing</h1>
          <p className="text-[#f6ecda]/80 text-base mt-3 max-w-xl leading-relaxed">The rules of the room. Bids are binding, the hammer is final, and here is exactly what that means.</p>
          <p className="text-[#f6ecda]/60 text-xs mt-4 font-semibold">Last updated: June 15, 2026</p>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 sm:px-8 py-10 lg:py-12 lg:grid lg:grid-cols-[220px_1fr] lg:gap-12">
        {/* Contents */}
        <aside className="mb-8 lg:mb-0">
          <nav aria-label="Contents" className="lg:sticky lg:top-24 bg-white border border-[#e3d6bf] rounded-2xl p-4 sm:p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8a7559] mb-2.5 flex items-center gap-1.5"><PineMark className="w-3.5 h-3.5" /> Contents</p>
            <ol className="text-sm space-y-0.5 columns-2 lg:columns-1 gap-x-4">
                <li><a href="#s1" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">01</span><span>Agreement to Terms</span></a></li>
                <li><a href="#s2" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">02</span><span>Who We Are</span></a></li>
                <li><a href="#s3" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">03</span><span>Eligibility</span></a></li>
                <li><a href="#s4" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">04</span><span>Accounts</span></a></li>
                <li><a href="#s5" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">05</span><span>Bidding Rules</span></a></li>
                <li><a href="#s6" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">06</span><span>Payments</span></a></li>
                <li><a href="#s7" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">07</span><span>Auction Items</span></a></li>
                <li><a href="#s8" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">08</span><span>Prohibited Conduct</span></a></li>
                <li><a href="#s9" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">09</span><span>Intellectual Property</span></a></li>
                <li><a href="#s10" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">10</span><span>Disclaimers</span></a></li>
                <li><a href="#s11" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">11</span><span>Limitation of Liability</span></a></li>
                <li><a href="#s12" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">12</span><span>Indemnification</span></a></li>
                <li><a href="#s13" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">13</span><span>Termination</span></a></li>
                <li><a href="#s14" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">14</span><span>Governing Law</span></a></li>
                <li><a href="#s15" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">15</span><span>Changes to These Terms</span></a></li>
                <li><a href="#s16" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">16</span><span>Contact</span></a></li>
            </ol>
          </nav>
        </aside>

        <article className="min-w-0 bg-white border border-[#e3d6bf] rounded-2xl px-5 py-6 sm:px-8 sm:py-8">
        <div className="space-y-9 text-[#4a3a2b] leading-relaxed text-[15px] max-w-[68ch] [&_ul]:marker:text-[#c47b3e] [&_a]:font-semibold">

          <section id="s1" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">01</span>Agreement to Terms</h2>
            <p>These Terms of Service ("Terms") govern your access to and use of Northwood Bids ("Platform," "Company," "we," "us," or "our"). By accessing or using Northwood Bids at northwoodbids.com, you agree to be bound by these Terms. If you do not agree, do not use the Platform.</p>
          </section>

          <section id="s2" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">02</span>Who We Are</h2>
            <p>Northwood Bids is an online auction site operated by us to host fundraising auctions. Registered users ("Bidders") may participate in those auctions by placing bids on listed items.</p>
          </section>

          <section id="s3" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">03</span>Eligibility</h2>
            <p>You must be at least 18 years of age to create an account or place bids. By using the Platform, you represent and warrant that you meet this requirement and that all information you provide is accurate and complete.</p>
          </section>

          <section id="s4" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">04</span>Accounts</h2>
            <p>You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You agree to notify us immediately of any unauthorized access. We reserve the right to suspend or terminate accounts that violate these Terms.</p>
          </section>

          <section id="s5" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">05</span>Bidding Rules</h2>
            <p className="mb-3">When you place a bid on Northwood Bids, you are entering into a binding commitment to purchase the item at that price if you are the winning bidder. By placing a bid, you:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Confirm you have the intent and ability to pay the bid amount.</li>
              <li>Agree that all bids are final and non-retractable unless permitted by us.</li>
              <li>Acknowledge that Max Bids (proxy bids) are placed on your behalf automatically up to your stated maximum.</li>
              <li>Understand that the minimum bid increment is determined by the current bid amount and may vary.</li>
            </ul>
          </section>

          <section id="s6" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">06</span>Payments</h2>
            <p className="mb-3">All payments are processed securely through Stripe by Northwood Bids. By saving a payment method, you authorize Northwood Bids to charge your card in the event you win an auction. Charges occur automatically when an auction closes.</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Winning bidders are charged the final winning bid amount plus any applicable taxes.</li>
              <li>All sales are final. Refunds are at our sole discretion.</li>
              <li>If a charge fails, you will be notified and given the opportunity to update your payment method.</li>
            </ul>
          </section>

          <section id="s7" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">07</span>Auction Items</h2>
            <p className="mb-3">For the auctions we host on Northwood Bids, we aim to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Provide accurate descriptions and fair retail values for all listed items.</li>
              <li>Fulfill winning bids in a timely and professional manner.</li>
              <li>Comply with all applicable laws and regulations governing charitable fundraising in our jurisdiction.</li>
              <li>Process payments securely through our own Stripe account.</li>
            </ul>
            <p className="mt-3">While we make reasonable efforts to describe and fulfill auction items accurately, items are provided "as is." Please contact us with any questions about item quality or delivery.</p>
          </section>

          <section id="s8" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">08</span>Prohibited Conduct</h2>
            <p className="mb-3">You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Place bids you do not intend to honor ("shill bidding").</li>
              <li>Use the Platform for any unlawful purpose.</li>
              <li>Attempt to manipulate auction outcomes through fraudulent means.</li>
              <li>Impersonate any person or organization.</li>
              <li>Use automated tools to place bids outside of the Platform's built-in Max Bid feature.</li>
              <li>Interfere with or disrupt the integrity or performance of the Platform.</li>
            </ul>
          </section>

          <section id="s9" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">09</span>Intellectual Property</h2>
            <p>All content on Northwood Bids — including logos, designs, code, copy, item photos, and descriptions — is owned by Northwood Bids or licensed to us. You may not reproduce, distribute, or create derivative works without our express written permission.</p>
          </section>

          <section id="s10" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">10</span>Disclaimers</h2>
            <p>The Platform is provided "as is" and "as available" without warranties of any kind, express or implied. We do not guarantee uninterrupted or error-free service, and we make no representation as to the accuracy of item descriptions, retail values, and photos.</p>
          </section>

          <section id="s11" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">11</span>Limitation of Liability</h2>
            <p>To the fullest extent permitted by law, Northwood Bids shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Platform, including but not limited to lost profits, loss of data, or failure to fulfill auction items. Our total liability to you for any claim shall not exceed the amount you paid to us in the twelve months preceding the claim.</p>
          </section>

          <section id="s12" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">12</span>Indemnification</h2>
            <p>You agree to indemnify and hold harmless Northwood Bids, its officers, directors, employees, and agents from any claims, losses, or damages (including attorneys' fees) arising from your use of the Platform, your violation of these Terms, or your violation of any third-party rights.</p>
          </section>

          <section id="s13" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">13</span>Termination</h2>
            <p>We reserve the right to suspend or terminate your access to the Platform at any time, with or without notice, for any violation of these Terms or for any other reason at our sole discretion. Upon termination, your right to use the Platform ceases immediately.</p>
          </section>

          <section id="s14" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">14</span>Governing Law</h2>
            <p>These Terms are governed by the laws of the State of Michigan, without regard to its conflict of law principles. Any disputes shall be resolved exclusively in the state or federal courts located in Michigan.</p>
          </section>

          <section id="s15" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">15</span>Changes to These Terms</h2>
            <p>We may update these Terms from time to time. We will notify you of material changes by updating the date at the top of this page. Continued use of the Platform after changes take effect constitutes your acceptance of the revised Terms.</p>
          </section>

          <section id="s16" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">16</span>Contact</h2>
            <p>If you have any questions about these Terms, please contact us by phone at <a href="tel:+18108181772" className="text-[#6c4d39] hover:underline">(810) 818-1772</a>.</p>
          </section>

        </div>
        </article>

        <div className="lg:col-span-2 mt-10 pt-6 border-t border-[#e3d6bf] flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#8a7559]">
          <Link href="/privacy" className="font-semibold hover:text-[#6c4d39] transition-colors">Privacy Policy</Link>
          <Link href="/help" className="font-semibold hover:text-[#6c4d39] transition-colors">Help &amp; FAQ</Link>
          <Link href="/" className="font-semibold hover:text-[#6c4d39] transition-colors">Home</Link>
          <span className="ml-auto">&copy; {new Date().getFullYear()} Northwood Bids. All rights reserved.</span>
        </div>
      </main>
    </div>
  );
}
