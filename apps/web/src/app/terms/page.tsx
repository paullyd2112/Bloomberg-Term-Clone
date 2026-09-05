export const metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for Plebs.Finance',
  alternates: { canonical: '/terms' },
};

export default function TermsOfService() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-gray-300">
      <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
      <p className="text-sm text-gray-500 mb-10">Last updated: May 26, 2026</p>

      <section className="mb-8">
        <p>
          These Terms of Service (&quot;Terms&quot;) govern your use of Plebs.Finance (&quot;Service&quot;), operated by
          Plebs.Finance (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By creating an account or using the Service, you agree
          to these Terms. If you do not agree, do not use Plebs.Finance.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">1. The Service</h2>
        <p>
          Plebs.Finance is a market intelligence platform that provides AI-generated trading signals,
          market data, prediction market data, portfolio tracking,
          and related financial information tools. The Service is provided for informational and
          educational purposes only.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">2. Not Financial Advice</h2>
        <p className="font-semibold text-yellow-400">
          IMPORTANT: Plebs.Finance is not a registered investment advisor. Nothing on this platform
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
          <li>You must be at least 18 years old to use Plebs.Finance.</li>
          <li>You are responsible for maintaining the security of your account credentials.</li>
          <li>You must provide accurate information when creating your account.</li>
          <li>You may not create multiple accounts to circumvent rate limits or other restrictions.</li>
          <li>We reserve the right to suspend or terminate accounts that violate these Terms.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">4. Access</h2>
        <p>
          Plebs.Finance is free and open source. All features are available to every registered
          user at no cost. We reserve the right to introduce optional paid features in the future,
          which will be clearly communicated.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">6. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 mt-3 space-y-2">
          <li>Scrape, copy, or redistribute any data or signals from Plebs.Finance without written permission.</li>
          <li>Use the Service for any unlawful purpose.</li>
          <li>Attempt to reverse engineer, hack, or disrupt the platform.</li>
          <li>Use automated tools to access the Service beyond normal usage.</li>
          <li>Resell or sublicense access to the Service.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">7. Intellectual Property</h2>
        <p>
          The Plebs.Finance source code is available under the MIT License. The Plebs brand name
          and logo remain the property of Plebs.Finance. AI-generated signals and analysis are
          provided as-is and may be shared freely.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">8. Disclaimers & Limitation of Liability</h2>
        <p>
          The Service is provided &quot;as is&quot; without warranties of any kind. We do not guarantee
          the accuracy, completeness, or timeliness of any market data or signals. To the maximum
          extent permitted by law, Plebs.Finance shall not be liable for any trading losses, lost
          profits, or indirect damages arising from your use of the Service.
        </p>
        <p className="mt-3">
          Our total liability to you for any claim arising from use of the Service shall not
          exceed $100.
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
          <a href="mailto:support@plebs.finance" className="text-blue-400 hover:underline">
            support@plebs.finance
          </a>
          .
        </p>
      </section>
    </main>
  );
}
