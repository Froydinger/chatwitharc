import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Sparkles, Zap } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import {
  BOOST_ANNUAL_PRICE_AMOUNT,
  BOOST_ANNUAL_REGULAR_PRICE_AMOUNT,
  BOOST_ANNUAL_REGULAR_PRICE_DISPLAY,
  BOOST_ANNUAL_RENEWAL_DISPLAY,
  BOOST_ANNUAL_SAVINGS_DISPLAY,
  BOOST_ANNUAL_OFFER_BADGE,
  BOOST_ANNUAL_PRICE_ID,
  BOOST_MONTHLY_PRICE_AMOUNT,
  BOOST_PRICE_ID,
  BOOST_TRIAL_DISPLAY,
  BOOST_TRIAL_NOTE,
} from "@/lib/stripe";
import { BOOST_PLAN_FEATURES, FREE_PLAN_FEATURES } from "@/lib/planCopy";

export function PricingPage() {
  const { user } = useAuth();
  const { hasBoost, openCheckout, openCustomerPortal } = useSubscription();
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("monthly");

  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-foreground/80 hover:text-primary font-medium transition-colors mb-8">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-card mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground/90">ArcAI Pricing Plans</span>
          </div>
          <h1 className="text-5xl font-bold mb-4 text-foreground">Choose your reasoning tier.</h1>
          <p className="text-lg text-foreground/75 max-w-xl mx-auto">
            Arc Matrix™ is ArcAI’s intelligence engine, powered by GPT-6. Start free with Ava and Maya, or get River with Boost.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 items-stretch mb-8 max-w-3xl mx-auto">
          {/* Free Tier */}
          <GlassCard className="p-8 flex flex-col justify-between border-white/5 relative">
            <div>
              <div className="text-sm font-semibold text-muted-foreground tracking-wider uppercase mb-2">Free Plan</div>
              <div className="flex items-baseline gap-2 mb-6">
                <span className="text-5xl font-bold">$0</span>
                <span className="text-muted-foreground">/ forever</span>
              </div>
              <ul className="space-y-3 mb-8">
                {FREE_PLAN_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            <GlassButton className="w-full mt-auto" disabled={true}>
              {user ? (hasBoost ? "Basic Access" : "Active Plan") : "Free Tier"}
            </GlassButton>
          </GlassCard>

          {/* Boost Plan */}
          <GlassCard className="p-8 flex flex-col justify-between border-primary relative overflow-hidden bg-primary/5">
            <div>
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm font-semibold text-primary tracking-wider uppercase">
                  Boost Plan
                </div>
                {/* Billing Toggle inside Boost Card */}
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] transition-colors duration-200 ${billingInterval === "monthly" ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
                    Monthly
                  </span>
                  <button
                    onClick={() => setBillingInterval(billingInterval === "monthly" ? "annual" : "monthly")}
                    className="relative w-8 h-4 rounded-full bg-zinc-800 transition-colors duration-200 p-0.5 border border-white/10 flex items-center"
                  >
                    <div className={`w-3 h-3 rounded-full bg-white transition-transform duration-200 shadow-md ${billingInterval === "annual" ? "translate-x-3.5" : "translate-x-0"}`} />
                  </button>
                  <span className={`text-[11px] transition-colors duration-200 ${billingInterval === "annual" ? "text-foreground font-semibold" : "text-muted-foreground"} flex items-center gap-1`}>
                    Annual
                    <span className="text-[8px] bg-primary/20 text-primary font-bold px-1 py-0.2 rounded-full">
                      {BOOST_ANNUAL_SAVINGS_DISPLAY}
                    </span>
                  </span>
                </div>
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                {billingInterval === "annual" && (
                  <span className="text-lg text-muted-foreground/70 line-through" aria-label={`Regular price ${BOOST_ANNUAL_REGULAR_PRICE_DISPLAY}`}>
                    {BOOST_ANNUAL_REGULAR_PRICE_AMOUNT}
                  </span>
                )}
                <span className="text-5xl font-bold">
                  {billingInterval === "monthly" ? BOOST_MONTHLY_PRICE_AMOUNT : BOOST_ANNUAL_PRICE_AMOUNT}
                </span>
                <span className="text-muted-foreground">
                  / {billingInterval === "monthly" ? "month" : "year"}
                </span>
              </div>
              <div className="mb-5 space-y-1">
                <p className="text-xs text-primary font-semibold">{BOOST_TRIAL_DISPLAY} · {BOOST_TRIAL_NOTE}</p>
                {billingInterval === "annual" && (
                  <>
                    <p className="text-xs text-primary font-semibold">{BOOST_ANNUAL_OFFER_BADGE} · Equal to just $7.92/month ({BOOST_ANNUAL_SAVINGS_DISPLAY} vs. {BOOST_ANNUAL_REGULAR_PRICE_DISPLAY})</p>
                    <p className="text-[11px] text-muted-foreground">{BOOST_ANNUAL_RENEWAL_DISPLAY}</p>
                  </>
                )}
              </div>
              <ul className="space-y-3 mb-8">
                    {BOOST_PLAN_FEATURES.map((feature) => (
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
              <GlassButton 
                className="w-full bg-primary text-primary-foreground hover:bg-primary/95 font-semibold py-5 rounded-xl shadow-lg shadow-primary/15 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]" 
                onClick={() => openCheckout(billingInterval === "monthly" ? BOOST_PRICE_ID : BOOST_ANNUAL_PRICE_ID)}
              >
                Start 7-day trial
              </GlassButton>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
