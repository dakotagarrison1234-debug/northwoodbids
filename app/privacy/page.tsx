import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Northwood Bids",
  description: "Privacy Policy for Northwood Bids.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#faf8f4] text-[#1a1916]">
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-extrabold text-[#1a1916] mb-2">Privacy Policy</h1>
        <p className="text-[#8c8778] text-sm mb-10">Last updated: June 15, 2026</p>

        <div className="space-y-8 text-[#4a4640] leading-relaxed">

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">1. Introduction</h2>
            <p>Northwood Bids ("we," "us," or "our") operates this auction site at northwoodbids.com. This Privacy Policy explains how we collect, use, share, and protect your personal information when you use our Platform. By using Northwood Bids, you agree to the practices described in this policy.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">2. Information We Collect</h2>
            <p className="mb-3">We collect the following categories of information:</p>

            <h3 className="font-semibold text-[#1a1916] mb-2">Information you provide directly</h3>
            <ul className="list-disc pl-5 space-y-1.5 mb-4">
              <li>Name, email address, and phone number when you create an account.</li>
              <li>Payment method details (processed and stored securely by Stripe — we never store raw card numbers).</li>
              <li>Item details, photos, and descriptions related to the auctions we host.</li>
            </ul>

            <h3 className="font-semibold text-[#1a1916] mb-2">Information collected automatically</h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Bid history and auction activity associated with your account.</li>
              <li>Device and browser information, IP address, and general location.</li>
              <li>Usage data such as pages visited and features used.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">3. How We Use Your Information</h2>
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

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">4. How We Share Your Information</h2>
            <p className="mb-3">We do not sell your personal information. We share information only in the following circumstances:</p>

            <h3 className="font-semibold text-[#1a1916] mb-2">When you win an auction</h3>
            <p className="mb-4">When you win an auction, we use your name and contact information to arrange item pickup or delivery.</p>

            <h3 className="font-semibold text-[#1a1916] mb-2">With service providers</h3>
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

            <h3 className="font-semibold text-[#1a1916] mt-4 mb-2">For legal reasons</h3>
            <p>We may disclose information if required by law, court order, or to protect the rights, property, or safety of Northwood Bids, our users, or others.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">5. Data Retention</h2>
            <p>We retain your account information for as long as your account is active. Bid history and transaction records are retained for a minimum of 7 years for financial and legal compliance purposes. You may request deletion of your account at any time; however, transaction records required for legal or tax purposes will be retained as required by law.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">6. Your Rights and Choices</h2>
            <p className="mb-3">Depending on your location, you may have the right to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Access the personal information we hold about you.</li>
              <li>Correct inaccurate or incomplete information.</li>
              <li>Request deletion of your personal information (subject to legal retention requirements).</li>
              <li>Opt out of non-essential communications.</li>
            </ul>
            <p className="mt-3">To exercise any of these rights, contact us at <a href="mailto:Ryan@for-purpose.com" className="text-[#09a7ad] hover:underline">Ryan@for-purpose.com</a>.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">7. Cookies and Tracking</h2>
            <p>We use cookies and similar technologies to maintain your session, remember your preferences, and improve the Platform experience. Authentication cookies are essential for the Platform to function. We do not use third-party advertising cookies or tracking pixels.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">8. Security</h2>
            <p>We implement industry-standard security measures including HTTPS encryption, secure password hashing, and access controls. Payment data is handled entirely by Stripe and is never stored on our servers. While we take security seriously, no system is completely secure and we cannot guarantee absolute security.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">9. Children's Privacy</h2>
            <p>Northwood Bids is not intended for children under the age of 18. We do not knowingly collect personal information from minors. If you believe a minor has provided us with personal information, please contact us and we will promptly delete it.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">10. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of material changes by updating the date at the top of this page. Your continued use of the Platform after changes are posted constitutes acceptance of the updated policy.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">11. Contact Us</h2>
            <p>If you have any questions, concerns, or requests regarding this Privacy Policy, please contact us at:</p>
            <div className="mt-3 bg-[#f0fafa] border border-[#09a7ad]/20 rounded-xl p-4">
              <p className="font-semibold text-[#1a1916]">Northwood Bids</p>
              <p>Email: <a href="mailto:Ryan@for-purpose.com" className="text-[#09a7ad] hover:underline">Ryan@for-purpose.com</a></p>
              <p>Website: <a href="https://northwoodbids.com" className="text-[#09a7ad] hover:underline">northwoodbids.com</a></p>
            </div>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-[#e5e0d5] flex flex-wrap gap-4 text-sm text-[#8c8778]">
          <Link href="/terms" className="hover:text-[#09a7ad] transition-colors">Terms of Service</Link>
          <Link href="/" className="hover:text-[#09a7ad] transition-colors">Home</Link>
          <span>© {new Date().getFullYear()} Northwood Bids. All rights reserved.</span>
        </div>
      </main>
    </div>
  );
}
