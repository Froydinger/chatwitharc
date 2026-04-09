import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Crown, MessageCircle, Mic, Image, Brain, Code, Globe, Sparkles, ArrowLeft, X, Music, Pen } from "lucide-react";
import { BackgroundGradients } from "@/components/BackgroundGradients";
import { AuthModal } from "@/components/AuthModal";
import { EmbeddedCheckoutForm } from "@/components/EmbeddedCheckout";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import maestroIcon from "@/assets/maestro-icon.png";
import arcanaLogo from "@/assets/arcana-logo.png";

const features = [
  { name: "Image Analysis", free: true, pro: true, icon: Sparkles },
  { name: "Memory & Context", free: true, pro: true, icon: Brain },
  { name: "Code Generation", free: true, pro: true, icon: Code },
  { name: "Web Search", free: true, pro: true, icon: Globe },
  { name: "AI Chat", free: "30 messages/day", pro: "Unlimited", icon: MessageCircle },
  { name: "Voice Mode", free: "3 sessions/day", pro: "Unlimited", icon: Mic },
  { name: "Unlimited Image Generation", free: "5 images/day", pro: "Unlimited", icon: Image },
  { name: "Choose Your Model (GPT or Gemini)", free: false, pro: true, icon: Sparkles },
  { name: "Maestro's Studio (Music Creation App)", free: false, pro: true, icon: Music },
  { name: "Arcana™ (Enhanced Writing App)", free: false, pro: true, icon: Pen },
];

function AppBundleShowcase() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="mb-16"
    >
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 via-card/60 to-card/60 backdrop-blur-md p-7 sm:p-10 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-purple-500 to-pink-500" />

        <div className="text-center mb-8">
          <span className="text-xs font-bold uppercase tracking-widest text-primary">One Subscription</span>
          <h3 className="text-2xl sm:text-3xl font-bold text-foreground mt-2">
            Three powerful apps.{' '}
            <span className="bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">One price.</span>
          </h3>
          <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
            ArcAI Pro unlocks premium access to every app in the Win The Night™ ecosystem — and every future app too.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-5">
          {/* ArcAI */}
          <div className="rounded-xl bg-background/40 border border-border/50 p-5 text-center space-y-3">
            <img src="/arc-logo-ui.png" alt="ArcAI" className="w-14 h-14 mx-auto rounded-2xl object-cover shadow-lg scale-125" style={{ objectPosition: 'center' }} />
            <h4 className="font-semibold text-foreground">ArcAI Pro</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">Unlimited AI chat, voice mode, image generation, research & more.</p>
          </div>

          {/* Maestro's Studio */}
          <div className="rounded-xl bg-background/40 border border-border/50 p-5 text-center space-y-3">
            <img src={maestroIcon} alt="Maestro's Studio" className="w-14 h-14 mx-auto rounded-2xl object-cover shadow-lg" />
            <h4 className="font-semibold text-foreground">Maestro's Studio</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">A full-featured IDE — build apps and publish them to the web.</p>
          </div>

          {/* Arcana */}
          <div className="rounded-xl bg-background/40 border border-border/50 p-5 text-center space-y-3">
            <img src={arcanaLogo} alt="Arcana" className="w-14 h-14 mx-auto rounded-2xl object-cover shadow-lg" />
            <h4 className="font-semibold text-foreground">Arcana™</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">Write what you love — an AI-enhanced writing app for creators and thinkers.</p>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Plus access to all future Win The Night™ apps — included at no extra cost.
        </p>
      </div>
    </motion.div>
  );
}

export function PricingPage() {
  const { user } = useAuth();
  const subscription = useSubscription();
  const [showAuth, setShowAuth] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const pendingUpgrade = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (user && pendingUpgrade.current) {
      pendingUpgrade.current = false;
      setShowAuth(false);
      navigate("/");
      setTimeout(() => window.dispatchEvent(new Event('open-upgrade-modal')), 500);
    }
  }, [user]);

  const handleUpgrade = () => {
    if (!user) {
      pendingUpgrade.current = true;
      setShowAuth(true);
      return;
    }
    setShowCheckout(true);
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-background" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <BackgroundGradients />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {/* Back link */}
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-10">
          <ArrowLeft className="w-4 h-4" />
          Back to ArcAi
        </Link>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-14"
        >
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-3">
            Simple, transparent pricing
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
            Start free with generous limits. Upgrade to unlock three apps for one price.
          </p>
        </motion.div>

        {/* App Bundle Showcase */}
        <AppBundleShowcase />

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <button
            onClick={() => setBillingInterval("monthly")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${billingInterval === "monthly" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingInterval("yearly")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${billingInterval === "yearly" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}
          >
            Yearly
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${billingInterval === "yearly" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/15 text-primary"}`}>
              Save 20%
            </span>
          </button>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-16">
          {/* Free Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="h-full rounded-2xl border border-border bg-card/60 backdrop-blur-md p-7 sm:p-8 flex flex-col">
              <div className="flex-1 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Free</h3>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-foreground">$0</span>
                    <span className="text-muted-foreground text-sm">/forever</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    All core features, with daily limits.
                  </p>
                </div>

                <div className="h-px bg-border/50" />

                <ul className="space-y-3">
                  {[
                    "30 messages per day",
                    "3 voice sessions per day",
                    "5 free images per day",
                    "Memory & personalization",
                    "Code generation & web search",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8">
                {!user ? (
                  <button
                    onClick={() => setShowAuth(true)}
                    className="w-full h-11 rounded-xl border border-border bg-muted/50 hover:bg-muted text-foreground text-sm font-medium transition-colors"
                  >
                    Get Started Free
                  </button>
                ) : (
                  <button
                    disabled
                    className="w-full h-11 rounded-xl border border-border bg-muted/30 text-muted-foreground text-sm font-medium cursor-not-allowed"
                  >
                    {subscription.isSubscribed ? 'Free Plan' : 'Current Plan'}
                  </button>
                )}
              </div>
            </div>
          </motion.div>

          {/* Pro Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="h-full rounded-2xl border-2 border-primary/50 bg-card/60 backdrop-blur-md p-7 sm:p-8 flex flex-col relative overflow-hidden shadow-[0_0_40px_-12px_hsl(var(--primary)/0.3)]">
              {/* Top accent bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-primary to-primary/40" />
              
              {/* Popular badge */}
              <div className="absolute top-4 right-4">
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-primary/15 text-primary border border-primary/30">
                  Best Value
                </span>
              </div>

              <div className="flex-1 space-y-6">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-foreground">Pro</h3>
                    <Crown className="w-4 h-4 text-primary" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    {billingInterval === "yearly" ? (
                      <>
                        <span className="text-4xl font-bold text-foreground">$9.60</span>
                        <span className="text-lg text-muted-foreground line-through">$12</span>
                        <span className="text-muted-foreground text-sm">/month</span>
                      </>
                    ) : (
                      <>
                        <span className="text-4xl font-bold text-foreground">$12</span>
                        <span className="text-muted-foreground text-sm">/month</span>
                      </>
                    )}
                  </div>
                  {billingInterval === "yearly" ? (
                    <p className="text-xs text-primary font-medium mt-1">
                      $115.20 billed today · 20% off annual billing
                    </p>
                  ) : (
                    <p className="text-xs text-primary font-medium mt-1">
                      Start with a 7-day free trial
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground mt-2">
                    Unlimited everything. Three apps included — ArcAI, Maestro's Studio & Arcana™.
                  </p>
                  <p className="text-xs text-primary/80 mt-1.5 flex items-center gap-1">
                    <Crown className="w-3 h-3" />
                    Get listed as a Pro Subscriber on winthenight.org/support
                  </p>
                </div>

                <div className="h-px bg-border/50" />

                {/* Included Apps */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/15">
                  <div className="flex -space-x-2">
                    <img src="/arc-logo-ui.png" alt="ArcAI" className="w-8 h-8 rounded-lg object-contain border-2 border-background z-30" />
                    <img src={maestroIcon} alt="" className="w-8 h-8 rounded-lg object-cover border-2 border-background z-20" />
                    <img src={arcanaLogo} alt="" className="w-8 h-8 rounded-lg object-cover border-2 border-background z-10" />
                  </div>
                  <span className="text-xs font-medium text-foreground">3 apps included</span>
                </div>

                <ul className="space-y-3">
                  {[
                    { text: "Unlimited messages", bold: true },
                    { text: "Unlimited voice sessions", bold: true },
                    { text: "Switch between AI models", bold: true },
                    { text: "Maestro's Studio — build & publish apps", bold: true },
                    { text: "Arcana™ — AI-enhanced writing", bold: true },
                    { text: "Listed as Pro Subscriber on Win The Night™", bold: true },
                    { text: "Everything in Free", bold: false },
                    { text: "Priority support", bold: false },
                  ].map(({ text, bold }) => (
                    <li key={text} className={`flex items-center gap-3 text-sm ${bold ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8">
                {subscription.isSubscribed ? (
                  <button
                    onClick={() => subscription.openCustomerPortal()}
                    className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors"
                  >
                    Manage Subscription
                  </button>
                ) : (
                  <button
                    onClick={handleUpgrade}
                    className="w-full h-11 rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Crown className="w-4 h-4" />
                    Upgrade to Pro
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Feature Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-foreground mb-6 text-center">Feature Comparison</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Feature</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-muted-foreground w-28">Free</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-primary w-28">Pro</th>
                  </tr>
                </thead>
                <tbody>
                  {features.map(({ name, free, pro, icon: Icon }) => (
                    <tr key={name} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-2 text-sm text-foreground">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                          {name}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center text-sm">
                        {typeof free === 'boolean' ? (
                          free ? <Check className="w-4 h-4 text-primary mx-auto" /> : <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">{free}</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center text-sm">
                        {typeof pro === 'boolean' ? (
                          <Check className="w-4 h-4 text-primary mx-auto" />
                        ) : (
                          <span className="text-foreground font-medium text-xs">{pro}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>

        {/* Footer note */}
        <div className="flex flex-col items-center gap-3 mt-10">
          <div className="flex items-center gap-2">
            <img src="/wtn-logo.webp" alt="Win The Night" className="h-5 w-5 object-contain rounded-sm opacity-50" />
            <p className="text-xs text-muted-foreground">
              ArcAi by <a href="https://winthenight.productions" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors underline">Win The Night</a>
            </p>
          </div>
          <p className="text-xs text-muted-foreground text-center">All plans include access to all AI features. Limits reset daily at midnight.</p>
        </div>
      </div>

      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />

      {/* Embedded Checkout Modal */}
      <AnimatePresence>
        {showCheckout && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCheckout(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
              <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl p-8 relative">
                <button
                  onClick={() => setShowCheckout(false)}
                  className="absolute top-4 right-4 p-1.5 rounded-full bg-muted/50 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
                <EmbeddedCheckoutForm interval={billingInterval} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
