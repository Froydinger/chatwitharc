import { Link } from "react-router-dom";
import { ArrowLeft, Check, Sparkles, Zap } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";

const FREE_FEATURES = [
  "20 daily Smarter (GPT-5.4 Mini) reasoning chats",
  "Unlimited Fast (GPT-5.4 Nano) chats",
  "10 generated or edited image outputs per UTC day",
  "Deep Search with summaries and citations",
  "File uploads, document analysis, memory, and canvases",
  "2 shared chats (up to 6 people each)",
  "Create reminders and scheduled tasks",
];

const BOOST_FEATURES = [
  "Unlimited Smarter (GPT-5.4 Mini) reasoning chats",
  "Generate up to 30 images a day (10 on free)",
  "Publish your code online at a custom arc link",
  "Unlimited voice conversations",
  "Unlimited shared chats (up to 6 people each)",
  "Priority features and server access",
];

export function PricingPage() {
  const { user } = useAuth();
  const { hasBoost, openCheckout, openCustomerPortal } = useSubscription();

  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-6">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-card mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">ArcAI Pricing Plans</span>
          </div>
          <h1 className="text-5xl font-bold mb-4">Choose your reasoning tier.</h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Get started with our robust free tier or upgrade to Boost for custom web publishing and elevated quotas.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 items-stretch mb-8">
          {/* Free Tier */}
          <GlassCard className="p-8 flex flex-col justify-between border-white/5 relative">
            <div>
              <div className="text-sm font-semibold text-muted-foreground tracking-wider uppercase mb-2">Free Plan</div>
              <div className="flex items-baseline gap-2 mb-6">
                <span className="text-5xl font-bold">$0</span>
                <span className="text-muted-foreground">/ forever</span>
              </div>
              <ul className="space-y-3 mb-8">
                {FREE_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            <GlassButton className="w-full mt-auto" disabled={!user || !hasBoost}>
              {user ? (hasBoost ? "Current Plan: Free" : "Active Plan") : "Free Tier"}
            </GlassButton>
          </GlassCard>

          {/* Boost Tier */}
          <GlassCard className="p-8 flex flex-col justify-between border-primary/40 relative overflow-hidden bg-primary/5">
            <div className="absolute top-4 right-4 bg-primary/20 text-primary text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1">
              <Zap className="h-3 w-3" /> popular
            </div>
            <div>
              <div className="text-sm font-semibold text-primary tracking-wider uppercase mb-2">ArcAI Boost</div>
              <div className="flex items-baseline gap-2 mb-6">
                <span className="text-5xl font-bold">$7</span>
                <span className="text-muted-foreground">/ month</span>
              </div>
              <ul className="space-y-3 mb-8">
                {BOOST_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span className="font-medium text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {hasBoost ? (
              <GlassButton className="w-full border-primary/50 text-primary hover:bg-primary/10" onClick={openCustomerPortal}>
                Manage Billing Portal
              </GlassButton>
            ) : (
              <GlassButton className="w-full bg-primary text-primary-foreground hover:bg-primary/95" onClick={openCheckout}>
                Upgrade to Boost
              </GlassButton>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
