import { Link } from "react-router-dom";
import { ArrowLeft, ScrollText } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen text-foreground py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back home
        </Link>

        <div className="glass-card rounded-3xl p-8 md:p-12 border border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/15">
              <ScrollText className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight m-0">Terms of Service</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-10">Last updated: May 22, 2026</p>

          <div className="space-y-8 text-[15px] leading-relaxed text-foreground/90">
            <section>
              <h2 className="text-xl font-semibold mb-2">1. Who we are</h2>
              <p className="text-muted-foreground">
                ArcAI ("ArcAI", "we", "us") is operated by <strong>Win The Night™ Productions</strong> in collaboration
                with <strong>Froydinger™ Design Systems</strong>. Contact:{" "}
                <a href="mailto:arc@froydinger.com" className="text-primary hover:underline">
                  arc@froydinger.com
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">2. Free, forever</h2>
              <p className="text-muted-foreground">
                ArcAI is <strong>free for everyone</strong>. There is no paid plan, no subscription, and no Merchant of
                Record — anything you read elsewhere about billing, refunds, or Pro tiers no longer applies. The only
                soft limit is 10 image generations per day for non-admin accounts so the service stays sustainable for
                all users.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">3. The service</h2>
              <p className="text-muted-foreground">
                ArcAI is an AI assistant accessible via web and an installable PWA. We grant you a non-exclusive,
                non-transferable, revocable license to use the service for personal or internal business use, subject to
                these terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">4. Accounts &amp; sign-in</h2>
              <p className="text-muted-foreground">
                Sign-in is handled by <strong>Supabase Auth</strong> using Google OAuth or email credentials. You must
                provide accurate information and keep your login methods secure. You're responsible for everything that
                happens under your account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">5. Acceptable use</h2>
              <p className="text-muted-foreground mb-3">You agree not to:</p>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                <li>Use the service to violate any law or third-party rights.</li>
                <li>
                  Generate, distribute, or store unlawful, defamatory, harassing, hateful, or sexually exploitative
                  content involving minors.
                </li>
                <li>Attempt to reverse engineer, scrape, overload, or disrupt the service or its infrastructure.</li>
                <li>
                  Use the service to build a competing product, train competing models on outputs, or resell access.
                </li>
                <li>Bypass the daily image limit, authentication, or any other technical guardrail.</li>
              </ul>
              <p className="text-muted-foreground mt-3">
                If you abuse the free, unlimited service, your account may be suspended or terminated. 99.99% of people
                will never have to think about this — you know who you are.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">6. Intellectual property</h2>
              <p className="text-muted-foreground">
                The ArcAI software, branding, and underlying systems are owned by Win The Night Productions and
                Froydinger Design Systems. You retain ownership of inputs you submit and outputs generated for you,
                subject to the rights of the underlying AI model providers. You grant us a limited license to process
                your inputs solely to provide the service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">7. AI output disclaimer</h2>
              <p className="text-muted-foreground">
                AI-generated output may be inaccurate, incomplete, biased, or offensive. You are responsible for
                reviewing output before relying on it. ArcAI is not a substitute for professional advice (medical,
                legal, financial, or otherwise).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">8. Emails we send</h2>
              <p className="text-muted-foreground">
                Supabase may send essential account and security emails, such as verification and password-reset
                messages. Optional service and notification emails are coming soon. We don't send marketing or
                newsletter emails.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">9. Suspension &amp; termination</h2>
              <p className="text-muted-foreground">
                We may suspend or terminate access at any time for breach of these terms, suspected fraud, or to comply
                with law. You may close your account at any time from settings.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">10. Warranty disclaimer</h2>
              <p className="text-muted-foreground">
                The service is provided "as is" without warranties of any kind, express or implied, including
                merchantability, fitness for a particular purpose, and non-infringement.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">11. Limitation of liability</h2>
              <p className="text-muted-foreground">
                Because the service is free, our liability is limited to the maximum extent permitted by law. We are not
                liable for indirect, incidental, special, or consequential damages.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">12. Changes</h2>
              <p className="text-muted-foreground">
                We may update these terms. Material changes will be announced in-app. Continued use after the effective
                date constitutes acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">13. Governing law</h2>
              <p className="text-muted-foreground">
                These terms are governed by the laws of the United States and the state of residence of Win The Night
                Productions, without regard to conflict-of-laws rules.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">14. Contact</h2>
              <p className="text-muted-foreground">
                Questions?{" "}
                <a href="mailto:arc@froydinger.com" className="text-primary hover:underline">
                  arc@froydinger.com
                </a>
              </p>
            </section>
          </div>
        </div>

        <div className="text-center mt-8 space-y-2">
          <Link to="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors block">
            Read the Privacy Notice →
          </Link>
          <p className="text-xs text-muted-foreground/60">
            Some animations by{" "}
            <a
              href="https://github.com/Jakubantalik"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              Jakub Antalik
            </a>
            {" — border-beam & metal-fx components"}
          </p>
        </div>
      </div>
    </div>
  );
}
