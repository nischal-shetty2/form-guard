export default function Privacy() {
  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", padding: "2rem 1rem", fontFamily: "system-ui, sans-serif", lineHeight: 1.7 }}>
      <h1>Privacy Policy</h1>
      <p><strong>FormGuard</strong> — Contact Form Spam Blocker</p>
      <p><em>Last updated: March 2026</em></p>

      <h2>What we collect</h2>
      <p>
        FormGuard collects <strong>anonymous spam event data</strong> only. When a contact form
        submission is checked, we record whether it was flagged as spam or valid, and the reason
        (honeypot, timing, or keyword match). No personal information from the form
        (name, email, phone, message content) is stored.
      </p>

      <h2>Merchant data</h2>
      <p>
        Merchants can configure a list of blocked keywords through the admin dashboard.
        These keywords are stored in a database scoped to each individual store.
        We also store a simple on/off preference for spam protection.
      </p>

      <h2>Customer data</h2>
      <p>
        FormGuard does <strong>not</strong> collect, store, or process any customer personal data.
        No names, emails, IP addresses, or form contents are saved. The spam check runs
        entirely in the browser and only an anonymous pass/fail result is sent to our server.
      </p>

      <h2>Data sharing</h2>
      <p>
        We do not sell, share, or transfer any data to third parties.
      </p>

      <h2>Data retention</h2>
      <p>
        Anonymous spam event records are retained indefinitely for analytics purposes.
        When a merchant uninstalls the app, all their data (keywords, settings, and spam events)
        is permanently deleted.
      </p>

      <h2>GDPR compliance</h2>
      <p>
        FormGuard responds to all mandatory Shopify GDPR webhooks:
      </p>
      <ul>
        <li><strong>Customer data request</strong> — No customer data to export.</li>
        <li><strong>Customer data erasure</strong> — No customer data to delete.</li>
        <li><strong>Shop data erasure</strong> — All store data is permanently deleted.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        For questions about this privacy policy, contact us at{" "}
        <a href="mailto:shettynick2@gmail.com">shettynick2@gmail.com</a>.
      </p>
    </div>
  );
}
