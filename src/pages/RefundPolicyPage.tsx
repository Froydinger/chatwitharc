export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-6">
      <div className="max-w-3xl mx-auto prose prose-invert">
        <h1>Refund Policy</h1>
        <p><strong>Last updated:</strong> May 18, 2026</p>

        <h2>30-day refund window</h2>
        <p>
          We offer a <strong>30-day refund</strong> on ArcAI Pro subscriptions. If you are not
          satisfied with the service, contact us within 30 days of your initial purchase or renewal
          and we will issue a full refund for that billing period.
        </p>

        <h2>How to request a refund</h2>
        <p>
          Email <a href="mailto:support@askarc.chat">support@askarc.chat</a> from the address
          associated with your account, including your order ID or the email used at checkout. Most
          refunds are processed within 5–10 business days back to your original payment method.
        </p>

        <h2>Merchant of Record</h2>
        <p>
          Refunds are processed by Paddle.com Market Limited, our Merchant of Record. Paddle may
          contact you directly to complete the refund.
        </p>

        <h2>Cancellation vs. refund</h2>
        <p>
          You can cancel your subscription anytime from your account settings to prevent future
          renewals. Cancellation alone does not trigger a refund — you must explicitly request one
          within the 30-day window.
        </p>

        <h2>Exceptions</h2>
        <p>
          We may decline refund requests in cases of fraud, abuse, or violations of our
          <a href="/terms"> Terms & Conditions</a> (for example, accounts suspended for misuse).
        </p>

        <h2>Contact</h2>
        <p><a href="mailto:support@askarc.chat">support@askarc.chat</a></p>
      </div>
    </div>
  );
}
