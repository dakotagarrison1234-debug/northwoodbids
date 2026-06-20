import Link from "next/link";

export const metadata = {
  title: "Terms of Service | Northwood Bids",
  description: "Terms of Service for Northwood Bids, operated by For Purpose Life.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#faf8f4] text-[#1a1916]">
      {/* Header */}
      <header className="border-b border-[#e5e0d5] bg-white px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-[#09a7ad] text-lg tracking-tight">Northwood Bids</Link>
        <Link href="/" className="text-sm text-[#6b6659] hover:text-[#1a1916] transition-colors">← Back to home</Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-extrabold text-[#1a1916] mb-2">Terms of Service</h1>
        <p className="text-[#8c8778] text-sm mb-10">Last updated: June 15, 2026</p>

        <div className="space-y-8 text-[#4a4640] leading-relaxed">

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">1. Agreement to Terms</h2>
            <p>These Terms of Service ("Terms") govern your access to and use of Northwood Bids ("Platform"), a service operated by For Purpose Life ("Company," "we," "us," or "our"). By accessing or using Northwood Bids at northwoodbids.com, you agree to be bound by these Terms. If you do not agree, do not use the Platform.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">2. Who We Are</h2>
            <p>Northwood Bids is an online auction platform that enables nonprofit organizations and charitable causes ("Organizations") to host fundraising auctions. Registered users ("Bidders") may participate in those auctions by placing bids on listed items.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">3. Eligibility</h2>
            <p>You must be at least 18 years of age to create an account or place bids. By using the Platform, you represent and warrant that you meet this requirement and that all information you provide is accurate and complete.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">4. Accounts</h2>
            <p>You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You agree to notify us immediately of any unauthorized access. We reserve the right to suspend or terminate accounts that violate these Terms.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">5. Bidding Rules</h2>
            <p className="mb-3">When you place a bid on Northwood Bids, you are entering into a binding commitment to purchase the item at that price if you are the winning bidder. By placing a bid, you:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Confirm you have the intent and ability to pay the bid amount.</li>
              <li>Agree that all bids are final and non-retractable unless permitted by the hosting Organization.</li>
              <li>Acknowledge that Max Bids (proxy bids) are placed on your behalf automatically up to your stated maximum.</li>
              <li>Understand that the minimum bid increment is determined by the current bid amount and may vary.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">6. Payments</h2>
            <p className="mb-3">All payments are processed securely through Stripe. By saving a payment method, you authorize Northwood Bids to charge your card in the event you win an auction. Charges occur automatically when an auction closes.</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Winning bidders are charged the final winning bid amount plus any applicable taxes and platform fees.</li>
              <li>All sales are final. Refunds are at the sole discretion of the hosting Organization.</li>
              <li>If a charge fails, you will be notified and given the opportunity to update your payment method.</li>
              <li>Northwood Bids is not responsible for items not delivered or disputes between Bidders and Organizations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">7. Organizations</h2>
            <p className="mb-3">Organizations that host auctions on Northwood Bids agree to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Provide accurate descriptions and fair retail values for all listed items.</li>
              <li>Fulfill winning bids in a timely and professional manner.</li>
              <li>Comply with all applicable laws and regulations governing charitable fundraising in their jurisdiction.</li>
              <li>Connect a valid Stripe account to receive funds. Northwood Bids processes payments on behalf of Organizations via Stripe Connect.</li>
            </ul>
            <p className="mt-3">For Purpose Life is not responsible for the conduct of Organizations or the fulfillment of auction items. Any disputes regarding item quality, delivery, or misrepresentation are between the Bidder and the Organization.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">8. Prohibited Conduct</h2>
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

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">9. Intellectual Property</h2>
            <p>All content on Northwood Bids — including logos, designs, code, and copy — is owned by For Purpose Life or licensed to us. You may not reproduce, distribute, or create derivative works without our express written permission. Item photos and descriptions uploaded by Organizations remain the property of those Organizations.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">10. Disclaimers</h2>
            <p>The Platform is provided "as is" and "as available" without warranties of any kind, express or implied. We do not guarantee uninterrupted or error-free service. Item descriptions, retail values, and photos are provided by Organizations and we make no representation as to their accuracy.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">11. Limitation of Liability</h2>
            <p>To the fullest extent permitted by law, For Purpose Life shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Platform, including but not limited to lost profits, loss of data, or failure to fulfill auction items. Our total liability to you for any claim shall not exceed the amount you paid to us in the twelve months preceding the claim.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">12. Indemnification</h2>
            <p>You agree to indemnify and hold harmless For Purpose Life, its officers, directors, employees, and agents from any claims, losses, or damages (including attorneys' fees) arising from your use of the Platform, your violation of these Terms, or your violation of any third-party rights.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">13. Termination</h2>
            <p>We reserve the right to suspend or terminate your access to the Platform at any time, with or without notice, for any violation of these Terms or for any other reason at our sole discretion. Upon termination, your right to use the Platform ceases immediately.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">14. Governing Law</h2>
            <p>These Terms are governed by the laws of the State of Texas, without regard to its conflict of law principles. Any disputes shall be resolved exclusively in the state or federal courts located in Texas.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">15. Changes to These Terms</h2>
            <p>We may update these Terms from time to time. We will notify you of material changes by updating the date at the top of this page. Continued use of the Platform after changes take effect constitutes your acceptance of the revised Terms.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1a1916] mb-3">16. Contact</h2>
            <p>If you have any questions about these Terms, please contact us at <a href="mailto:Ryan@for-purpose.com" className="text-[#09a7ad] hover:underline">Ryan@for-purpose.com</a>.</p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-[#e5e0d5] flex flex-wrap gap-4 text-sm text-[#8c8778]">
          <Link href="/privacy" className="hover:text-[#09a7ad] transition-colors">Privacy Policy</Link>
          <Link href="/" className="hover:text-[#09a7ad] transition-colors">Home</Link>
          <span>© {new Date().getFullYear()} For Purpose Life. All rights reserved.</span>
        </div>
      </main>
    </div>
  );
}
