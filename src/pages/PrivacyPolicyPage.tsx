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
          <p className="text-sm text-muted-foreground mb-10">Last updated: May 22, 2026</p>

          <div className="space-y-8 text-[15px] leading-relaxed text-foreground/90">
            <section>
              <h2 className="text-xl font-semibold mb-2">Who we are</h2>
              <p className="text-muted-foreground">
                ArcAI is operated by <strong>Win The Night™ Productions</strong> in collaboration with{" "}
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
                There is no subscription, no checkout, and no billing system. We do not collect payment information,
                billing addresses, or anything tied to a paid plan — because there isn't one. The only usage limit is 20
                image generations per day for non-admin accounts.
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
                  memories you create inside Arc's Brain.
                </li>
                <li>
                  <strong>Usage diagnostics:</strong> session metadata, feature usage, device type, and error logs used
                  to keep the service stable.
                </li>
                <li>
                  <strong>Support data:</strong> tickets and attachments you submit through the in-app support flow.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">How we use it</h2>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                <li>To provide, maintain, and improve the service.</li>
                <li>To authenticate you and keep your account secure.</li>
                <li>To respond to support requests and send service-related emails.</li>
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
                  <strong>Email delivery providers</strong> — for account, support, and system messages.
                </li>
                <li>
                  <strong>Web Search, image, and audio providers</strong> — only when you explicitly trigger web search,
                  image, or audio features.
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
                removes your data from our database within 30 days, except where retention is required by law. Deletions
                cannot be reversed — we keep no shadow backups.
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
                TLS in transit, encrypted at rest, row-level security on every table, and OAuth-only authentication. No
                method of transmission is 100% secure, but we hold ourselves to a high bar.
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
              href="https://x.com/Jakubantalik"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              Jakub Antalik (@Jakubantalik)
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
