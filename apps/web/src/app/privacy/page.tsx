export const metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for Plebs.Finance',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPolicy() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-gray-300">
      <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-10">Last updated: May 26, 2026</p>

      <section className="mb-8">
        <p>
          Plebs.Finance (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the Plebs.Finance platform, a market intelligence
          and trading signals service. This Privacy Policy explains how we collect, use, and
          protect your information when you use our service.
        </p>
        <p className="mt-4">
          By using Plebs.Finance you agree to the collection and use of information as described here.
          If you are a California resident, additional rights apply under the California Consumer
          Privacy Act (CCPA) — see the section below.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">Information We Collect</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Account information:</strong> name, email address, and password when you register.</li>
          <li><strong>Wallet information:</strong> public wallet addresses you connect for Polymarket trading. We never access private keys.</li>
          <li><strong>Usage data:</strong> pages visited, features used, signals viewed, watchlist items, portfolio positions, and alerts you create.</li>
          <li><strong>Communications:</strong> messages you send to our AI assistant (Pleby) and support inquiries sent to support@plebs.finance.</li>
          <li><strong>Device data:</strong> IP address, browser type, and operating system for security and analytics purposes.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">How We Use Your Information</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>To provide and maintain the Plebs.Finance service.</li>
          <li>To deliver signals, alerts, and briefings you have opted into.</li>
          <li>To send daily briefings, alerts, and product updates you have opted into.</li>
          <li>To personalize your experience and improve our signal generation.</li>
          <li>To detect and prevent fraud or unauthorized access.</li>
          <li>To comply with legal obligations.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">Third-Party Services</h2>
        <p>We use the following third-party services to operate Plebs.Finance:</p>
        <ul className="list-disc pl-5 mt-3 space-y-2">
          <li><strong>Supabase</strong> — database and authentication</li>
          <li><strong>Polymarket</strong> — prediction market data and non-custodial trading</li>
          <li><strong>Anthropic</strong> — AI assistant (Pleby) and signal analysis</li>
          <li><strong>Resend</strong> — transactional email delivery</li>
          <li><strong>Vercel</strong> — hosting and infrastructure</li>
          <li><strong>Sentry</strong> — error monitoring</li>
        </ul>
        <p className="mt-3">
          Each of these services has their own privacy policies governing their use of your data.
          We do not sell your personal information to third parties.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">Data Retention</h2>
        <p>
          We retain your account data for as long as your account is active. If you delete your
          account, we will delete your personal data within 30 days, except where retention is
          required by law.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">Security</h2>
        <p>
          We use industry-standard security practices including encrypted connections (HTTPS),
          row-level security on our database, and secure key management. No method of transmission
          over the internet is 100% secure, and we cannot guarantee absolute security.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">California Residents — CCPA Rights</h2>
        <p>If you are a California resident, you have the right to:</p>
        <ul className="list-disc pl-5 mt-3 space-y-2">
          <li>Know what personal information we collect about you.</li>
          <li>Request deletion of your personal information.</li>
          <li>Opt out of the sale of your personal information (we do not sell your data).</li>
          <li>Non-discrimination for exercising your privacy rights.</li>
        </ul>
        <p className="mt-3">
          To exercise any of these rights, contact us at <strong>support@plebs.finance</strong>.
          We will respond within 45 days.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of significant
          changes via email or a notice on the platform. Continued use of Plebs.Finance after changes
          constitutes acceptance of the updated policy.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-white mb-3">Contact</h2>
        <p>
          Questions about this Privacy Policy? Contact us at{' '}
          <a href="mailto:support@plebs.finance" className="text-blue-400 hover:underline">
            support@plebs.finance
          </a>
          .
        </p>
      </section>
    </main>
  );
}
