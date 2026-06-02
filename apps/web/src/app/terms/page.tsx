export const metadata = {
  title: 'Terms of Service | Plebs.io',
  description: 'Terms of Service for Plebs.io',
};

export default function TermsOfService() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-gray-300">
      <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
      <p className="text-sm text-gray-500 mb-10">Last updated: May 26, 2026</p>

      <section className="mb-8">
        <p>
          These Terms of Service ("Terms") govern your use of Plebs.io ("Service"), operated by
          Plebs.io ("we," "us," or "our"). By creating an account or using the Service, you agree
          to these Terms. If you do not agree, do not use Plebs.io.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">1. The Service</h2>
        <p>
          Plebs.io is a market intelligence platform that provides AI-generated trading signals,
          market data, congressional trade disclosures, prediction market data, portfolio tracking,
          and related financial information tools. The Service is provided for informational and
          educational purposes only.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">2. Not Financial Advice</h2>
        <p className="font-semibold text-yellow-400">
          IMPORTANT: Plebs.io is not a registered investment advisor. Nothing on this platform
          constitutes financial, investment, legal, or tax advice. All signals, analysis, and
          content are for informational purposes only and should not be relied upon to make
          investment decisions.
        </p>
        <p className="mt-3">
          Trading and investing involve significant risk of loss. Past signal performance does not
          guarantee future results. You are solely responsible for your own investment decisions.
          Always do your own research and consult a qualified financial advisor before making any
          investment.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">3. Accounts</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>You must be at least 18 years old to use Plebs.io.</li>
          <li>You are responsible for maintaining the security of your account credentials.</li>
          <li>You must provide accurate information when creating your account.</li>
          <li>You may not share your account with others or create multiple accounts to abuse trial periods.</li>
          <li>We reserve the right to suspend or terminate accounts that violate these Terms.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">4. Subscriptions & Payments</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Free trial:</strong> New accounts receive a 7-day free trial with full access. No charge during the trial period.</li>
          <li><strong>Billing:</strong> After the trial, your selected plan is billed automatically via Stripe on a monthly, quarterly, or annual basis depending on your selection.</li>
          <li><strong>Lifetime access:</strong> Lifetime Pro purchases are one-time payments that grant perpetual access to Pro features as they exist at time of purchase. We reserve the right to add new features to higher tiers.</li>
          <li><strong>Price changes:</strong> We may change subscription prices with 30 days notice. Existing subscribers on locked-in rates will not be affected.</li>
          <li><strong>Cancellation:</strong> You may cancel your subscription at any time. Access continues until the end of your current billing period.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">5. Refund Policy</h2>
        <p>
          We offer refunds within 7 days of your first charge if you are unsatisfied with the
          Service. After 7 days, all payments are non-refundable. Lifetime purchases are
          non-refundable after 14 days. To request a refund, contact{' '}
          <a href="mailto:support@plebs.io" className="text-blue-400 hover:underline">
            support@plebs.io
          </a>
          .
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">6. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 mt-3 space-y-2">
          <li>Scrape, copy, or redistribute any data or signals from Plebs.io without written permission.</li>
          <li>Use the Service for any unlawful purpose.</li>
          <li>Attempt to reverse engineer, hack, or disrupt the platform.</li>
          <li>Use automated tools to access the Service beyond normal usage.</li>
          <li>Resell or sublicense access to the Service.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">7. Intellectual Property</h2>
        <p>
          All content on Plebs.io, including signals, AI analysis, platform design, and branding,
          is owned by Plebs.io. You may not reproduce or distribute this content without explicit
          written permission. Signal sharing features provided within the platform are permitted
          for personal, non-commercial use.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">8. Disclaimers & Limitation of Liability</h2>
        <p>
          The Service is provided "as is" without warranties of any kind. We do not guarantee
          the accuracy, completeness, or timeliness of any market data or signals. To the maximum
          extent permitted by law, Plebs.io shall not be liable for any trading losses, lost
          profits, or indirect damages arising from your use of the Service.
        </p>
        <p className="mt-3">
          Our total liability to you for any claim arising from use of the Service shall not
          exceed the amount you paid us in the 3 months preceding the claim.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">9. Governing Law</h2>
        <p>
          These Terms are governed by the laws of the State of California, without regard to
          conflict of law principles. Any disputes shall be resolved in the courts of Oakland,
          California.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">10. Changes to These Terms</h2>
        <p>
          We may update these Terms at any time. We will notify you of material changes via email
          or a notice on the platform with at least 14 days notice. Continued use after changes
          take effect constitutes acceptance.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-white mb-3">11. Contact</h2>
        <p>
          Questions about these Terms? Contact us at{' '}
          <a href="mailto:support@plebs.io" className="text-blue-400 hover:underline">
            support@plebs.io
          </a>
          .
        </p>
      </section>
    </main>
  );
}
