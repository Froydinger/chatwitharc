import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export default function PrivacyPolicyPage() {
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
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight m-0">Privacy Notice</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-10">Last updated: September 23, 2026</p>

          <div className="space-y-8 text-[15px] leading-relaxed text-foreground/90">
            <section>
              <h2 className="text-xl font-semibold mb-2">Who we are</h2>
              <p className="text-muted-foreground">
                ArcAI is operated by <strong>Win The Night™ Foundation</strong> in collaboration with{" "}
                <strong>Froydinger™ Design Systems</strong>. Questions? Email{" "}
                <a href="mailto:arc@froydinger.com" className="text-primary hover:underline">
                  arc@froydinger.com
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">ArcAI is free for everyone</h2>
              <p className="text-muted-foreground">
                ArcAI has a free tier and an optional Boost subscription. On the website, Boost checkout and recurring
                billing are handled by Stripe. In the Android app, Boost checkout and recurring billing are handled by
                Google Play. ArcAI does not store full payment card numbers. For Android purchases, ArcAI stores the
                Google Play purchase token and subscription status needed to verify and provide Boost access.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">What we store</h2>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                <li>
                  <strong>Account data:</strong> name, email, profile photo, and authentication identifiers.
                </li>
                <li>
                  <strong>Content:</strong> chats, prompts, uploads, generated images and files, voice transcripts, and
                  the living memory summary you create or update with Arc.
                </li>
                <li>
                  <strong>Support data:</strong> tickets and attachments you submit through the in-app support flow.
                </li>
                <li>
                  <strong>Subscription data:</strong> purchase provider, product, purchase token, subscription status,
                  and renewal or expiry information for Boost purchases.
                </li>
                <li>
                  <strong>Desktop link requests:</strong> when you ask us to email a desktop download link, we send the
                  address you enter to our email delivery provider. ArcAI keeps a keyed one-way hash and request time to
                  limit repeat requests and abuse; we do not add that address to marketing lists.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">How we use it</h2>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                <li>To provide, maintain, and improve the service.</li>
                <li>To authenticate you and keep your account secure.</li>
                <li>To respond to support requests and send service-related emails.</li>
                <li>To send a desktop download link when you request one.</li>
                <li>To detect and prevent fraud, abuse, and security incidents.</li>
                <li>To comply with legal obligations.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">Who processes your data for us</h2>
              <p className="text-muted-foreground mb-3">
                We share data only with infrastructure providers acting strictly as processors on our behalf:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                <li>
                  <strong>Supabase</strong> — database, authentication, server-side functions, and file storage.
                </li>
                <li>
                  <strong>AI model providers</strong> such as OpenAI — to generate responses to your prompts.
                </li>
                <li>
                  <strong>Email delivery providers</strong> — for account, support, and system messages, including a
                  desktop download link when you request one.
                </li>
                <li>
                  <strong>Web search and research providers</strong> — your query is sent to <strong>Perplexity</strong>
                  when you run a Deep Search or Ultra Deep Search, and to our web search provider when you trigger an
                  in-chat search. Only the query itself is sent, not your chat history, memories, or files.
                </li>
                <li>
                  <strong>Image and audio providers</strong> — only when you explicitly trigger image or audio
                  features.
                </li>
                <li>
                  <strong>Stripe and Google Play</strong> — process subscription payments through their respective
                  checkout systems. ArcAI receives the subscription information needed to verify your Boost access.
                </li>
                <li>Law enforcement or regulators when legally required.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">Authentication</h2>
              <p className="text-muted-foreground">
                ArcAI supports <strong>Google Sign-In and email authentication</strong> through Supabase Auth. Passwords
                are handled by Supabase and are not stored in ArcAI's application tables.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">Retention &amp; deletion</h2>
              <p className="text-muted-foreground">
                You can delete individual chats, memories, and uploads at any time. Deleting your account permanently
                removes your data from our active systems within 30 days, except where retention is required by law. Deletions
                cannot be reversed. You can request deletion at any time from the app or on our{" "}
                <Link to="/delete-account" className="text-primary underline underline-offset-2">account deletion page</Link>.
                Cancel any active Boost subscription through Google Play or Stripe before deleting your ArcAI account to
                stop future billing; account deletion does not itself cancel a subscription.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">Your rights</h2>
              <p className="text-muted-foreground">
                Depending on your jurisdiction (GDPR, UK GDPR, CCPA, and similar), you have the right to access,
                correct, delete, port, or restrict processing of your data, and to object or withdraw consent. Email{" "}
                <a href="mailto:arc@froydinger.com" className="text-primary hover:underline">
                  arc@froydinger.com
                </a>{" "}
                to exercise any of these rights.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">Children</h2>
              <p className="text-muted-foreground">
                ArcAI is not directed to children under 13 (or under 16 in the EEA/UK), and we do not knowingly collect
                data from them.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">Security</h2>
              <p className="text-muted-foreground">
                We use TLS in transit and access controls, including row-level security on user data. Authentication is
                handled by Supabase, which manages account passwords. No method of transmission is 100% secure.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">Changes</h2>
              <p className="text-muted-foreground">
                We'll update this page and the date above when the policy changes. Material updates will be announced
                in-app.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">Contact</h2>
              <p className="text-muted-foreground">
                <a href="mailto:arc@froydinger.com" className="text-primary hover:underline">
                  arc@froydinger.com
                </a>
              </p>
            </section>
          </div>
        </div>

        <div className="text-center mt-8 space-y-2">
          <Link to="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors block">
            Read the Terms of Service →
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
            {" — border-beam, metal-fx & thinking-orbs components"}
          </p>
        </div>
      </div>
    </div>
  );
}
