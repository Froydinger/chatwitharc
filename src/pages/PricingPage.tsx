import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, Crown, MessageCircle, Mic, Image, Brain, Code, Globe, Sparkles, ArrowLeft } from "lucide-react";
import { BackgroundGradients } from "@/components/BackgroundGradients";
import { AuthModal } from "@/components/AuthModal";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";

const features = [
  { name: "Image Analysis", free: true, pro: true, icon: Sparkles },
  { name: "Memory & Context", free: true, pro: true, icon: Brain },
  { name: "Code Generation", free: true, pro: true, icon: Code },
  { name: "Web Search", free: true, pro: true, icon: Globe },
  { name: "AI Chat", free: "30 messages/day", pro: "Unlimited", icon: MessageCircle },
  { name: "Voice Mode", free: "3 sessions/day", pro: "Unlimited", icon: Mic },
  { name: "Unlimited Image Generation", free: "5 images/day", pro: "Unlimited", icon: Image },
  { name: "Choose Your Model (GPT or Gemini)", free: false, pro: true, icon: Sparkles },
];

export function PricingPage() {
  const { user } = useAuth();
  const subscription = useSubscription();
  const [showAuth, setShowAuth] = useState(false);

  const handleUpgrade = () => {
    if (!user) {
      setShowAuth(true);
      return;
    }
    subscription.openCheckout();
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <BackgroundGradients />

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-12">
        {/* Back link */}
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" />
          Back to ArcAi
        </Link>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Start free with generous limits. Upgrade when you need more.
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {/* Free Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <GlassCard variant="bubble" className="p-8 h-full">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-foreground">Free</h3>
                  <div className="mt-2">
                    <span className="text-4xl font-bold text-foreground">$0</span>
                    <span className="text-muted-foreground">/forever</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    All core features, with daily limits.
                  </p>
                </div>

                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>30 messages per day</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>3 voice sessions per day</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>5 free images per day</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>Memory & personalization</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>Code generation & web search</span>
                  </li>
                </ul>

                {!user ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowAuth(true)}
                  >
                    Get Started Free
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>
                    {subscription.isSubscribed ? 'Free Plan' : 'Current Plan'}
                  </Button>
                )}
              </div>
            </GlassCard>
          </motion.div>

          {/* Pro Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <GlassCard variant="bubble" glow className="p-8 h-full relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-primary/60" />
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-foreground">Pro</h3>
                    <Crown className="w-5 h-5 text-primary" />
                  </div>
                  <div className="mt-2">
                    <span className="text-4xl font-bold text-foreground">$8</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Unlimited everything. No limits, ever.
                  </p>
                </div>

                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-sm text-foreground font-medium">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>Unlimited messages</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-foreground font-medium">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>Unlimited voice sessions</span>
                  </li>
                   <li className="flex items-center gap-3 text-sm text-foreground font-medium">
                     <Check className="w-4 h-4 text-primary shrink-0" />
                     <span>Switch between AI models</span>
                   </li>
                   <li className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>Everything in Free</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>Priority support</span>
                  </li>
                </ul>

                {subscription.isSubscribed ? (
                  <Button
                    className="w-full"
                    onClick={() => subscription.openCustomerPortal()}
                  >
                    Manage Subscription
                  </Button>
                ) : (
                  <Button
                    className="w-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground"
                    onClick={handleUpgrade}
                  >
                    <Crown className="w-4 h-4 mr-2" />
                    Upgrade to Pro
                  </Button>
                )}
              </div>
            </GlassCard>
          </motion.div>
        </div>

        {/* Feature Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <GlassCard variant="bubble" className="p-8">
            <h3 className="text-lg font-bold text-foreground mb-6 text-center">Feature Comparison</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-left py-3 text-sm font-medium text-muted-foreground">Feature</th>
                    <th className="text-center py-3 text-sm font-medium text-muted-foreground">Free</th>
                    <th className="text-center py-3 text-sm font-medium text-primary">Pro</th>
                  </tr>
                </thead>
                <tbody>
                  {features.map(({ name, free, pro, icon: Icon }) => (
                    <tr key={name} className="border-b border-border/10">
                      <td className="py-3 text-sm text-foreground flex items-center gap-2">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        {name}
                      </td>
                      <td className="py-3 text-center text-sm">
                        {typeof free === 'boolean' ? (
                          free ? <Check className="w-4 h-4 text-primary mx-auto" /> : <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="text-muted-foreground">{free}</span>
                        )}
                      </td>
                      <td className="py-3 text-center text-sm">
                        {typeof pro === 'boolean' ? (
                          <Check className="w-4 h-4 text-primary mx-auto" />
                        ) : (
                          <span className="text-foreground font-medium">{pro}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </motion.div>

        {/* Footer note */}
        <div className="flex flex-col items-center gap-3 mt-8">
          <div className="flex items-center gap-2">
            <img src="/wtn-logo.webp" alt="Win The Night" className="h-6 w-6 object-contain rounded-sm opacity-50" />
            <p className="text-xs text-muted-foreground">
              ArcAi by <a href="https://winthenight.productions" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors underline">Win The Night</a>
            </p>
          </div>
          <p className="text-xs text-muted-foreground">All plans include access to all AI features. Limits reset daily at midnight.</p>
        </div>
      </div>

      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </div>
  );
}
