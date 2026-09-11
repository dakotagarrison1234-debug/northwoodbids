import Link from "next/link";
import { PineRidge, PineMark } from "@/app/components/Illustrations";

export const metadata = {
  title: "Privacy Policy | Northwood Bids",
  description: "Privacy Policy for Northwood Bids.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      {/* Header band */}
      <div className="relative overflow-hidden border-b border-[#e3d6bf]" style={{ background: "linear-gradient(160deg,#241a12 0%,#3a2a1b 60%,#4a3524 100%)" }}>
        <PineRidge className="absolute inset-x-0 bottom-0 w-full h-24 opacity-20 pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-6 sm:px-8 pt-12 pb-14 sm:pt-16 sm:pb-16 text-[#f6ecda]">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#f0a35a] mb-2">Privacy Policy</p>
          <h1 className="font-display text-3xl sm:text-4xl font-black leading-tight max-w-2xl">What we keep, and why</h1>
          <p className="text-[#f6ecda]/80 text-base mt-3 max-w-xl leading-relaxed">We collect what it takes to run an auction and get your winnings to you. Nothing is sold, nothing is shared for ads.</p>
          <p className="text-[#f6ecda]/60 text-xs mt-4 font-semibold">Last updated: June 15, 2026</p>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 sm:px-8 py-10 lg:py-12 lg:grid lg:grid-cols-[220px_1fr] lg:gap-12">
        {/* Contents */}
        <aside className="mb-8 lg:mb-0">
          <nav aria-label="Contents" className="lg:sticky lg:top-24 bg-white border border-[#e3d6bf] rounded-2xl p-4 sm:p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8a7559] mb-2.5 flex items-center gap-1.5"><PineMark className="w-3.5 h-3.5" /> Contents</p>
            <ol className="text-sm space-y-0.5 columns-2 lg:columns-1 gap-x-4">
                <li><a href="#s1" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">01</span><span>Introduction</span></a></li>
                <li><a href="#s2" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">02</span><span>Information We Collect</span></a></li>
                <li><a href="#s3" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">03</span><span>How We Use Your Information</span></a></li>
                <li><a href="#s4" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">04</span><span>How We Share Your Information</span></a></li>
                <li><a href="#s5" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">05</span><span>Data Retention</span></a></li>
                <li><a href="#s6" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">06</span><span>Your Rights and Choices</span></a></li>
                <li><a href="#s7" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">07</span><span>Cookies and Tracking</span></a></li>
                <li><a href="#s8" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">08</span><span>Security</span></a></li>
                <li><a href="#s9" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">09</span><span>Children's Privacy</span></a></li>
                <li><a href="#s10" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">10</span><span>Changes to This Policy</span></a></li>
                <li><a href="#s11" className="flex items-baseline gap-2 text-[#6f5b46] hover:text-[#241a12] transition-colors py-0.5"><span className="text-[10px] font-black tabular-nums text-[#c47b3e] tracking-widest">11</span><span>Contact Us</span></a></li>
            </ol>
          </nav>
        </aside>

        <article className="min-w-0 bg-white border border-[#e3d6bf] rounded-2xl px-5 py-6 sm:px-8 sm:py-8">
        <div className="space-y-9 text-[#4a3a2b] leading-relaxed text-[15px] max-w-[68ch] [&_ul]:marker:text-[#c47b3e] [&_a]:font-semibold">

          <section id="s1" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">01</span>Introduction</h2>
            <p>Northwood Bids ("we," "us," or "our") operates this auction site at northwoodbids.com. This Privacy Policy explains how we collect, use, share, and protect your personal information when you use our Platform. By using Northwood Bids, you agree to the practices described in this policy.</p>
          </section>

          <section id="s2" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">02</span>Information We Collect</h2>
            <p className="mb-3">We collect the following categories of information:</p>

            <h3 className="font-display font-semibold text-[15px] text-[#241a12] mb-2">Information you provide directly</h3>
            <ul className="list-disc pl-5 space-y-1.5 mb-4">
              <li>Name, email address, and phone number when you create an account.</li>
              <li>Payment method details (processed and stored securely by Stripe — we never store raw card numbers).</li>
              <li>Item details, photos, and descriptions related to the auctions we host.</li>
            </ul>

            <h3 className="font-display font-semibold text-[15px] text-[#241a12] mb-2">Information collected automatically</h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Bid history and auction activity associated with your account.</li>
              <li>Device and browser information, IP address, and general location.</li>
              <li>Usage data such as pages visited and features used.</li>
            </ul>
          </section>

          <section id="s3" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">03</span>How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>To operate and maintain the Platform and your account.</li>
              <li>To process bids, payments, and auction transactions.</li>
              <li>To send transactional communications such as bid confirmations, outbid notifications, and payment receipts.</li>
              <li>To communicate with you about your account, auctions, and Platform updates.</li>
              <li>To detect and prevent fraud, abuse, and security incidents.</li>
              <li>To comply with legal obligations.</li>
              <li>To improve the Platform through usage analysis.</li>
            </ul>
          </section>

          <section id="s4" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">04</span>How We Share Your Information</h2>
            <p className="mb-3">We do not sell your personal information. We share information only in the following circumstances:</p>

            <h3 className="font-display font-semibold text-[15px] text-[#241a12] mb-2">When you win an auction</h3>
            <p className="mb-4">When you win an auction, we use your name and contact information to arrange item pickup or delivery.</p>

            <h3 className="font-display font-semibold text-[15px] text-[#241a12] mb-2">With service providers</h3>
            <p className="mb-3">We use the following third-party services to operate the Platform:</p>
            <ul className="list-disc pl-5 space-y-1.5 mb-4">
              <li><strong>Clerk</strong> — authentication and account management.</li>
              <li><strong>Stripe</strong> — payment processing.</li>
              <li><strong>Supabase</strong> — secure database hosting.</li>
              <li><strong>Cloudflare R2</strong> — image and file storage.</li>
              <li><strong>Pusher</strong> — real-time bid updates.</li>
              <li><strong>GoHighLevel (GHL)</strong> — CRM and transactional communications (bid confirmations, auction notifications).</li>
              <li><strong>Vercel</strong> — web hosting and deployment.</li>
            </ul>
            <p>Each provider has its own privacy policy governing how they handle data. We only share the minimum information necessary for each service to function.</p>

            <h3 className="font-display font-semibold text-[15px] text-[#241a12] mt-4 mb-2">For legal reasons</h3>
            <p>We may disclose information if required by law, court order, or to protect the rights, property, or safety of Northwood Bids, our users, or others.</p>
          </section>

          <section id="s5" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">05</span>Data Retention</h2>
            <p>We retain your account information for as long as your account is active. Bid history and transaction records are retained for a minimum of 7 years for financial and legal compliance purposes. You may request deletion of your account at any time; however, transaction records required for legal or tax purposes will be retained as required by law.</p>
          </section>

          <section id="s6" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">06</span>Your Rights and Choices</h2>
            <p className="mb-3">Depending on your location, you may have the right to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Access the personal information we hold about you.</li>
              <li>Correct inaccurate or incomplete information.</li>
              <li>Request deletion of your personal information (subject to legal retention requirements).</li>
              <li>Opt out of non-essential communications.</li>
            </ul>
            <p className="mt-3">To exercise any of these rights, contact us by phone at <a href="tel:+18108181772" className="text-[#6c4d39] hover:underline">(810) 818-1772</a>.</p>
          </section>

          <section id="s7" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">07</span>Cookies and Tracking</h2>
            <p>We use cookies and similar technologies to maintain your session, remember your preferences, and improve the Platform experience. Authentication cookies are essential for the Platform to function. We do not use third-party advertising cookies or tracking pixels.</p>
          </section>

          <section id="s8" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">08</span>Security</h2>
            <p>We implement industry-standard security measures including HTTPS encryption, secure password hashing, and access controls. Payment data is handled entirely by Stripe and is never stored on our servers. While we take security seriously, no system is completely secure and we cannot guarantee absolute security.</p>
          </section>

          <section id="s9" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">09</span>Children's Privacy</h2>
            <p>Northwood Bids is not intended for children under the age of 18. We do not knowingly collect personal information from minors. If you believe a minor has provided us with personal information, please contact us and we will promptly delete it.</p>
          </section>

          <section id="s10" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">10</span>Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of material changes by updating the date at the top of this page. Your continued use of the Platform after changes are posted constitutes acceptance of the updated policy.</p>
          </section>

          <section id="s11" className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-[#241a12] mb-3 flex items-baseline gap-3"><span className="font-sans text-[11px] font-black tabular-nums text-[#c47b3e] tracking-widest">11</span>Contact Us</h2>
            <p>If you have any questions, concerns, or requests regarding this Privacy Policy, please contact us at:</p>
            <div className="mt-3 bg-[#f6ecda] border border-[#6c4d39]/20 rounded-xl p-4">
              <p className="font-semibold text-[#241a12]">Northwood Bids</p>
              <p>Phone: <a href="tel:+18108181772" className="text-[#6c4d39] hover:underline">(810) 818-1772</a></p>
              <p>Website: <a href="https://northwoodbids.com" className="text-[#6c4d39] hover:underline">northwoodbids.com</a></p>
            </div>
          </section>

        </div>
        </article>

        <div className="lg:col-span-2 mt-10 pt-6 border-t border-[#e3d6bf] flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#8a7559]">
          <Link href="/terms" className="font-semibold hover:text-[#6c4d39] transition-colors">Terms of Service</Link>
          <Link href="/help" className="font-semibold hover:text-[#6c4d39] transition-colors">Help &amp; FAQ</Link>
          <Link href="/" className="font-semibold hover:text-[#6c4d39] transition-colors">Home</Link>
          <span className="ml-auto">&copy; {new Date().getFullYear()} Northwood Bids. All rights reserved.</span>
        </div>
      </main>
    </div>
  );
}
