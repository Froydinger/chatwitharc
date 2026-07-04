import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Sparkles, Zap, ShieldCheck, ExternalLink } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { BOOST_PRICE_ID, BOOST_ANNUAL_PRICE_ID } from "@/lib/stripe";
import { motion } from "framer-motion";

const BOOST_FEATURES = [
  "Unlimited Reasoning (GPT-5.4 Thinking)",
  "Unlimited Deep Reason (GPT-5.5 Deep Think)",
  "Premium Image Generation (GPT-Image-2)",
  "Advanced image editing studio",
  "Publish live web apps to custom links",
  "Unlimited shared chats & rooms",
  "Priority feature & server access",
];

export function UpgradePage() {
  const navigate = useNavigate();
  const { user, loading: authLoading, isAnonymous } = useAuth();
  const { hasBoost, openCheckout, openCustomerPortal, loading: subLoading, currentPeriodEnd } = useSubscription();
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("annual");

  // If auth is done loading and there is no user (or user is guest), redirect or show message
  const isLoggedIn = !!user && !isAnonymous;

  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      // Redirect to welcome/lander
      navigate("/welcome");
      // Trigger the login/auth gate modal immediately
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("auth-gate-feature", {
            detail: { feature: "generic", label: "Sign in to upgrade to Boost" },
          })
        );
      }, 150);
    }
  }, [authLoading, isLoggedIn, navigate]);

  if (authLoading || subLoading || !isLoggedIn) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
        <p className="text-sm text-muted-foreground">Checking account status...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white py-16 px-4 md:px-8 relative overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-white/70 hover:text-white font-medium transition-colors mb-8 bg-white/5 hover:bg-white/10 px-4 py-2 rounded-xl border border-white/5 backdrop-blur-md"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        {hasBoost ? (
          /* Already Upgraded State */
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <GlassCard className="p-8 max-w-2xl mx-auto border-primary/30 bg-primary/[0.02] shadow-[0_0_50px_rgba(var(--primary-rgb),0.05)] text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border border-primary/20 mb-6 animate-pulse">
                <ShieldCheck className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-3xl font-extrabold mb-2 tracking-tight text-white">You're on ArcAI Boost!</h1>
              <p className="text-sm text-primary font-semibold mb-6 flex items-center justify-center gap-1">
                <Sparkles className="h-4 w-4" /> Active Pro Account Plan
              </p>

              <div className="max-w-md mx-auto p-4 rounded-2xl bg-white/[0.03] border border-white/5 text-left space-y-3 mb-8 text-sm">
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">Account:</span>
                  <span className="font-medium text-white">{user?.email}</span>
                </div>
                {currentPeriodEnd && (
                  <div className="flex justify-between items-center py-1 border-t border-white/5">
                    <span className="text-muted-foreground">Renewal Date:</span>
                    <span className="font-medium text-white">
                      {new Date(currentPeriodEnd).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center py-1 border-t border-white/5">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Active
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                <GlassButton
                  onClick={openCustomerPortal}
                  className="w-full sm:w-auto px-6 bg-primary text-primary-foreground hover:bg-primary/95 flex items-center gap-2 font-semibold shadow-lg shadow-primary/20"
                >
                  Manage Subscription <ExternalLink className="h-4 w-4" />
                </GlassButton>
                <Link to="/" className="w-full sm:w-auto">
                  <GlassButton className="w-full sm:w-auto px-6 border-white/10 hover:bg-white/5 text-white/90">
                    Back to Chat
                  </GlassButton>
                </Link>
              </div>
            </GlassCard>
          </motion.div>
        ) : (
          /* Free Account Upgrade Plan Selection */
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-8"
          >
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-3">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-primary">Upgrade Entitlements</span>
              </div>
              <h1 className="text-4xl font-black tracking-tight text-white mb-3">Unlock ArcAI Boost.</h1>
              <p className="text-sm md:text-base text-muted-foreground max-w-md mx-auto">
                Elevate your daily message limits, gain access to high-fidelity GPT-Image-2 models, and publish live code.
              </p>
            </div>

            {/* Billing Toggle */}
            <div className="max-w-md mx-auto">
              {/* Boost Consolidated Upgrade Card */}
              <GlassCard className="p-8 flex flex-col justify-between border-primary relative overflow-hidden bg-primary/5">
                <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-100" />
                <div className="absolute top-4 right-4 bg-primary text-primary-foreground text-[10px] px-2.5 py-1 rounded-full font-bold flex items-center gap-1 shadow-lg shadow-primary/20 animate-pulse">
                  <Sparkles className="h-3 w-3" /> Best Value
                </div>
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <div className="text-sm font-semibold text-primary tracking-wider uppercase">
                      Boost Plan
                    </div>
                    {/* Billing Toggle inside Card */}
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] transition-colors duration-200 ${billingInterval === "monthly" ? "text-white font-semibold" : "text-muted-foreground"}`}>
                        Monthly
                      </span>
                      <button
                        onClick={() => setBillingInterval(billingInterval === "monthly" ? "annual" : "monthly")}
                        className="relative w-8 h-4 rounded-full bg-zinc-800 transition-colors duration-200 p-0.5 border border-white/10 flex items-center"
                      >
                        <div className={`w-3 h-3 rounded-full bg-white transition-transform duration-200 shadow-md ${billingInterval === "annual" ? "translate-x-3.5" : "translate-x-0"}`} />
                      </button>
                      <span className={`text-[11px] transition-colors duration-200 ${billingInterval === "annual" ? "text-white font-semibold" : "text-muted-foreground"} flex items-center gap-1`}>
                        Annual
                        <span className="text-[8px] bg-primary/20 text-primary font-bold px-1 py-0.2 rounded-full">
                          -20%
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-5xl font-black tracking-tight text-white">
                      {billingInterval === "monthly" ? "$10" : "$95"}
                    </span>
                    <span className="text-muted-foreground text-sm font-medium">
                      / {billingInterval === "monthly" ? "month" : "year"}
                    </span>
                  </div>
                  {billingInterval === "annual" && (
                    <p className="text-xs text-primary font-bold mb-5">Equal to just $7.91/month (Save 20%)</p>
                  )}
                  {billingInterval === "monthly" && (
                    <div className="h-4 mb-5" />
                  )}
                  
                  <ul className="space-y-3.5 mb-8">
                    {BOOST_FEATURES.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm text-white/90">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <GlassButton
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/95 font-semibold py-6 rounded-xl shadow-lg shadow-primary/15 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
                  onClick={() => openCheckout(billingInterval === "monthly" ? BOOST_PRICE_ID : BOOST_ANNUAL_PRICE_ID)}
                >
                  Upgrade {billingInterval === "monthly" ? "Monthly" : "Annual"}
                </GlassButton>
              </GlassCard>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
