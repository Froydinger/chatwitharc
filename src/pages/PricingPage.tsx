import { Link } from "react-router-dom";
import { ArrowLeft, Check, Sparkles, Zap } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { BOOST_PRICE_ID, BOOST_ANNUAL_PRICE_ID } from "@/lib/stripe";

const FREE_FEATURES = [
  "Unlimited Fast (GPT-5.4 Nano) chats",
  "GPT-Image-1 Mini (40 outputs/day) & GPT-Image-1 (10 outputs/day)",
  "3 free daily GPT-Image-2 premium outputs",
  "Deep Search with summaries and citations",
  "File uploads, document analysis, memory, and canvases",
  "2 shared chats (up to 6 people each)",
  "Create reminders and scheduled tasks",
];

const BOOST_FEATURES = [
  "Unlimited GPT-5.4 (Thinking) reasoning chats",
  "Unlimited GPT-5.5 (Deep Think) reasoning chats",
  "20 premium GPT Image 2 outputs per day",
  "Full image editing (combining & variations of base images)",
  "Publish your code online at a custom arc link",
  "Unlimited voice conversations",
  "Unlimited shared chats (up to 6 people each)",
  "Priority features and server access",
];

export function PricingPage() {
  const { user } = useAuth();
  const { hasBoost, openCheckout, openCustomerPortal } = useSubscription();

  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-foreground/80 hover:text-primary font-medium transition-colors mb-8">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-card mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground/90">ArcAI Pricing Plans</span>
          </div>
          <h1 className="text-5xl font-bold mb-4 text-foreground">Choose your reasoning tier.</h1>
          <p className="text-lg text-foreground/75 max-w-xl mx-auto">
            Get started with our robust free tier or upgrade to Boost for custom web publishing and elevated quotas.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-stretch mb-8">
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

          {/* Boost Monthly */}
          <GlassCard className="p-8 flex flex-col justify-between border-primary/40 relative overflow-hidden bg-primary/5">
            <div className="absolute top-4 right-4 bg-primary/20 text-primary text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1">
              <Zap className="h-3 w-3" /> Most Popular
            </div>
            <div>
              <div className="text-sm font-semibold text-primary tracking-wider uppercase mb-2">Boost Monthly</div>
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
              <GlassButton className="w-full bg-primary text-primary-foreground hover:bg-primary/95" onClick={() => openCheckout(BOOST_PRICE_ID)}>
                Upgrade Monthly
              </GlassButton>
            )}
          </GlassCard>

          {/* Boost Annual */}
          <GlassCard className="p-8 flex flex-col justify-between border-primary relative overflow-hidden bg-primary/10">
            <div className="absolute top-4 right-4 bg-primary text-primary-foreground text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1 shadow-lg shadow-primary/20 animate-pulse">
              <Sparkles className="h-3 w-3" /> Best Value
            </div>
            <div>
              <div className="text-sm font-semibold text-primary tracking-wider uppercase mb-2">Boost Annual</div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-5xl font-bold">$65</span>
                <span className="text-muted-foreground">/ year</span>
              </div>
              <p className="text-xs text-primary font-medium mb-6">Save 22% compared to monthly plan</p>
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
              <GlassButton className="w-full bg-primary text-primary-foreground hover:bg-primary/95" onClick={() => openCheckout(BOOST_ANNUAL_PRICE_ID)}>
                Upgrade Annual
              </GlassButton>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
