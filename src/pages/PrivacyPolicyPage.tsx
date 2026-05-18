export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-6">
      <div className="max-w-3xl mx-auto prose prose-invert">
        <h1>Privacy Notice</h1>
        <p><strong>Last updated:</strong> May 18, 2026</p>

        <h2>1. Data controller</h2>
        <p>
          The data controller for personal data processed through ArcAI is <strong>Win The Night™ Productions | Froydinger™ Design Systems</strong> ("the Seller"). Contact:
          <a href="mailto:support@askarc.chat"> support@askarc.chat</a>.
        </p>

        <h2>2. Personal data we collect</h2>
        <ul>
          <li><strong>Account data:</strong> name, email address, profile photo, authentication identifiers (Google/Apple OAuth sub).</li>
          <li><strong>Content data:</strong> chats, prompts, uploads, generated images and files, voice transcripts, and saved memories you create.</li>
          <li><strong>Usage data:</strong> session metadata, feature usage, device type, browser, IP address, approximate location, and diagnostics/error logs.</li>
          <li><strong>Billing data:</strong> subscription status, plan, billing country, and customer ID (processed by our payment provider; we do not store full card numbers).</li>
          <li><strong>Support data:</strong> ticket contents and attachments you submit.</li>
        </ul>

        <h2>3. How we use your data</h2>
        <ul>
          <li>To provide, maintain, and improve the service.</li>
          <li>To authenticate you and secure your account.</li>
          <li>To process subscriptions, payments, and refunds.</li>
          <li>To respond to support requests and send service-related communications.</li>
          <li>To detect, prevent, and address fraud, abuse, and security incidents.</li>
          <li>To comply with legal obligations.</li>
        </ul>

        <h2>3a. Legal basis for processing</h2>
        <ul>
          <li><strong>Performance of a contract</strong> — to deliver the service you subscribe to (account, content, billing).</li>
          <li><strong>Legitimate interests</strong> — to secure the service, prevent fraud and abuse, improve features, and operate our business.</li>
          <li><strong>Legal obligation</strong> — to keep tax, accounting, and compliance records.</li>
          <li><strong>Consent</strong> — for optional cookies and any marketing communications, where required by law. You can withdraw consent at any time.</li>
        </ul>

        <h2>4. Recipients & sharing</h2>
        <p>We share personal data only with these categories of recipients, acting as processors:</p>
        <ul>
          <li><strong>Paddle.com Market Limited</strong> — Merchant of Record; processes payments, taxes, refunds, and chargebacks.</li>
          <li><strong>Supabase (Lovable Cloud)</strong> — hosting, database, authentication, file storage.</li>
          <li><strong>AI model providers</strong> (Google, OpenAI, and others routed via our AI gateway) — to generate responses to your prompts.</li>
          <li><strong>Resend</strong> — to send transactional emails.</li>
          <li><strong>Replicate, Perplexity, Tavily, Suno</strong> — when you use the corresponding image, search, or audio features.</li>
          <li>Law enforcement or regulators when legally required.</li>
        </ul>

        <h2>5. International transfers</h2>
        <p>
          Your data may be processed in the United States and other countries where our processors
          operate. We rely on appropriate safeguards such as Standard Contractual Clauses where
          required by law.
        </p>

        <h2>6. Retention</h2>
        <p>
          We retain account and content data for as long as your account is active. You can delete
          individual chats, memories, and uploads from your account at any time. When you delete your
          account, we delete your personal data within 30 days, except where retention is required by
          law (e.g., tax records).
        </p>

        <h2>7. Your rights</h2>
        <p>
          Depending on your jurisdiction (GDPR, UK GDPR, CCPA, etc.), you have the right to access,
          correct, delete, port, or restrict processing of your personal data, and to object to
          processing or withdraw consent. To exercise these rights, email
          <a href="mailto:support@askarc.chat"> support@askarc.chat</a>. You also have the right to
          lodge a complaint with your local data protection authority.
        </p>

        <h2>8. Children</h2>
        <p>
          ArcAI is not directed to children under 13 (or under 16 in the EEA/UK). We do not knowingly
          collect personal data from children.
        </p>

        <h2>9. Cookies & local storage</h2>
        <p>
          We use cookies and browser storage to keep you signed in, remember preferences, and measure
          basic usage. You can clear these via your browser at any time.
        </p>

        <h2>10. Security</h2>
        <p>
          We use industry-standard measures (TLS in transit, encrypted at rest, RLS-protected
          database, OAuth-only authentication). No method of transmission is 100% secure.
        </p>

        <h2>11. Changes</h2>
        <p>
          We will post updates to this notice on this page and update the "Last updated" date.
          Material changes will be announced in-app or via email.
        </p>

        <h2>12. Contact</h2>
        <p><a href="mailto:support@askarc.chat">support@askarc.chat</a></p>
      </div>
    </div>
  );
}
