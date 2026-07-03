import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, Sparkles, ArrowLeft, Zap, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
  email: z.string().trim().email("Invalid email").max(255, "Email too long"),
  message: z.string().trim().min(1, "Message is required").max(1000, "Message too long"),
});

export function PricingPage() {
  const { toast } = useToast();
  const { user, isAnonymous } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Force pure-dark theme on the pricing page regardless of user preference.
  useEffect(() => {
    const root = document.documentElement;
    const hadLight = root.classList.contains("light");
    root.classList.remove("light");
    root.classList.add("dark");
    return () => {
      if (hadLight) {
        root.classList.remove("dark");
        root.classList.add("light");
      }
    };
  }, []);

  const openBoost = () => {
    window.dispatchEvent(new CustomEvent("open-upgrade-modal"));
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = contactSchema.safeParse({ name, email, message });
    if (!parsed.success) {
      toast({
        title: "Check the form",
        description: parsed.error.issues[0]?.message ?? "Invalid input",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      if (!user || isAnonymous) {
        window.dispatchEvent(new CustomEvent("auth-gate-feature", { detail: { feature: "generic" } }));
        toast({
          title: "Sign in to send",
          description: "Create a free account so we can reply to your request.",
        });
        return;
      }
      const subject = `Pricing contact — ${parsed.data.name}`;
      const body = `From: ${parsed.data.name} <${parsed.data.email}>\n\n${parsed.data.message}`;

      if (!user || isAnonymous) {
        // Anonymous path: no ticket record, admin gets an email with reply-to = user's email.
        const { error: eErr } = await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "ticket-opened",
            idempotencyKey: `pricing-anon-${crypto.randomUUID()}`,
            templateData: {
              subject,
              userEmail: parsed.data.email,
              userName: parsed.data.name,
              priority: "normal",
              messagePreview: parsed.data.message,
              anonymous: true,
            },
          },
        });
        if (eErr) throw eErr;
      } else {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData?.session?.user?.id;
        if (!uid) throw new Error("no-session");

        const ticketId = crypto.randomUUID();
        const { error: tErr } = await supabase.from("support_tickets").insert({
          id: ticketId,
          user_id: uid,
          subject,
        });
        if (tErr) throw tErr;

        const { error: mErr } = await supabase.from("ticket_messages").insert({
          ticket_id: ticketId,
          sender_id: uid,
          content: body,
          is_admin_reply: false,
        });
        if (mErr) throw mErr;

        supabase.functions
          .invoke("send-transactional-email", {
            body: {
              templateName: "ticket-opened",
              idempotencyKey: `pricing-contact-${ticketId}`,
              templateData: {
                subject,
                userEmail: parsed.data.email,
                userName: parsed.data.name,
                priority: "normal",
              },
            },
          })
          .catch(() => {});
      }

      toast({
        title: "Message sent",
        description: (!user || isAnonymous)
          ? "Thanks — we'll reply to your email shortly."
          : "Thanks — we'll get back to you soon.",
      });
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      console.error("pricing contact submit failed", err);
      toast({
        title: "Couldn't send",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-6">
      <div className="max-w-5xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-card mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Free Forever · Boost Upgrade</span>
          </div>
          <h1 className="text-5xl font-bold mb-4">ArcAI is free for everyone.</h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Want more? <br /> Upgrade to Boost for unlimited image and voice generation & publish your code creations to
            the web.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Free */}
          <GlassCard className="p-8">
            <div className="text-sm font-medium text-muted-foreground mb-2">Free</div>
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-5xl font-bold">$0</span>
              <span className="text-muted-foreground">/ forever</span>
            </div>
            <ul className="space-y-3 mb-8">
              {[
                "Unlimited chats with every model",
                "Unlimited reminders & scheduled tasks",
                "Create up to 2 shared chats (owner + up to 5 others, 6 total)",
                "10 voice conversations every 30 days",
                "10 image generations per day",
                "File uploads & document analysis",
                "Memory & canvases",
                "Code generation & execution",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link to="/">
              <GlassButton className="w-full">Start using ArcAI</GlassButton>
            </Link>
          </GlassCard>

          {/* Boost — paid upgrade */}
          <GlassCard className="p-8 border-primary/40 shadow-[0_0_30px_hsl(var(--primary)/0.15)]">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">Paid Upgrade · ArcAI Boost</span>
            </div>
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-5xl font-bold">$7</span>
              <span className="text-muted-foreground">/ month</span>
            </div>
            <ul className="space-y-3 mb-6">
              {[
                "Everything in Free",
                "Unlimited image generations",
                "Unlimited voice conversations",
                "Deep Search™ — web search with AI summaries & citations",
                "Create unlimited shared chats (still up to 6 people per chat)",
                "Publish code creations to the web (yourname.froydingermedia.online)",
                "Cancel anytime — no contracts",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <GlassButton className="w-full" onClick={openBoost}>
              Get Boost
            </GlassButton>
            <p className="text-xs text-muted-foreground text-center mt-3">
              ArcAI is free forever. Boost is a $7/month paid upgrade.
            </p>
          </GlassCard>
        </div>

        {/* Contact / Support */}
        <div className="max-w-2xl mx-auto mt-12">
          <GlassCard className="p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Need a hand?</h2>
                <p className="text-xs text-muted-foreground">
                  Signed in?{" "}
                  <Link to="/support" className="underline hover:text-foreground">
                    Open a support ticket
                  </Link>
                  . Not signed in? Drop us a note below — we'll reply to your email.
                </p>
              </div>
            </div>

            <form onSubmit={handleContactSubmit} className="space-y-3 mt-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  maxLength={100}
                  required
                />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email"
                  maxLength={255}
                  required
                />
              </div>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="How can we help?"
                rows={4}
                maxLength={1000}
                required
              />
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[11px] text-muted-foreground">
                  Sent straight to the ArcAI team — no email app needed.
                </p>
                <GlassButton type="submit" disabled={submitting}>
                  {submitting ? "Sending…" : "Send message"}
                </GlassButton>
              </div>
            </form>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

export default PricingPage;
