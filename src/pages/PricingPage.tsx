import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Check, Sparkles, ArrowLeft, Zap } from "lucide-react";
import { Link } from "react-router-dom";

export function PricingPage() {
  const openBoost = () => {
    window.dispatchEvent(new CustomEvent("open-upgrade-modal"));
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-6">
      <div className="max-w-5xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-card mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Free Forever · Boost Upgrade</span>
          </div>
          <h1 className="text-5xl font-bold mb-4">ArcAI is free for everyone.</h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Want more? Upgrade to Boost for unlimited image and voice generation.
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
                "10 voice conversations every 30 days",
                "10 image generations per day",
                "Web search, file uploads, document analysis",
                "Memory, canvases, code generation, app builder",
                "All future features at no cost",
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
              <span className="text-sm font-medium text-primary">Paid Upgrade · ArcAi Boost</span>
            </div>
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-5xl font-bold">$7</span>
              <span className="text-muted-foreground">/ month</span>
            </div>
            <ul className="space-y-3 mb-8">
              {[
                "Everything in Free",
                "Unlimited image generations",
                "Unlimited voice conversations",
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

        <p className="text-center text-sm text-muted-foreground mt-8">
          Questions? <Link to="/support" className="underline">Contact support</Link>.
        </p>
      </div>
    </div>
  );
}

export default PricingPage;
