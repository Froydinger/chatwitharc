import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Check, Sparkles, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-card mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">100% Free Forever</span>
          </div>
          <h1 className="text-5xl font-bold mb-4">ArcAI is free for everyone.</h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            No subscriptions. No credit card. No paywalls. Just sign in and start creating.
          </p>
        </div>

        <GlassCard className="p-8 max-w-xl mx-auto">
          <div className="flex items-baseline gap-2 mb-6">
            <span className="text-5xl font-bold">$0</span>
            <span className="text-muted-foreground">/ forever</span>
          </div>
          <ul className="space-y-3 mb-8">
            {[
              "Unlimited chats with every model",
              "Unlimited voice mode sessions",
              "10 image generations per day",
              "Web search, file uploads, document analysis",
              "Memory, canvases, code generation, and app builder",
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

        <p className="text-center text-sm text-muted-foreground mt-8">
          Need more images? <Link to="/support" className="underline">Contact support</Link>.
        </p>
      </div>
    </div>
  );
}

export default PricingPage;
