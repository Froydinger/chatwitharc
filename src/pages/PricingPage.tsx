import { Link } from "react-router-dom";
import { ArrowLeft, Check, Coffee, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { SUPPORT_URL } from "@/lib/support";

const FREE_FEATURES = [
  "Unlimited chats with every available model",
  "Unlimited real-time voice conversations",
  "Deep Search with summaries and citations",
  "File uploads, document analysis, memory, and canvases",
  "Shared chats and one-tap web publishing",
  "Code generation, execution, and custom fonts",
  "20 generated or edited image outputs per UTC day",
];

export function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-card mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Free forever · No paid tier</span>
          </div>
          <h1 className="text-5xl font-bold mb-4">Everything in ArcAI is free.</h1>
          <p className="text-lg text-muted-foreground">
            No checkout, subscription, or feature paywall. Images and edits are limited to 20 outputs per account per day.
          </p>
        </div>

        <GlassCard className="p-8 mb-6 border-primary/30">
          <div className="flex items-baseline gap-2 mb-6">
            <span className="text-5xl font-bold">$0</span>
            <span className="text-muted-foreground">/ forever</span>
          </div>
          <ul className="space-y-3">
            {FREE_FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <Check className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard className="p-8 text-center">
          <Coffee className="h-8 w-8 text-primary mx-auto mb-3" />
          <h2 className="text-xl font-semibold mb-2">Want to support ArcAI?</h2>
          <p className="text-sm text-muted-foreground mb-5">
            ArcAI stays free whether you contribute or not. If it helps you, you can support Win The Night voluntarily.
          </p>
          <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
            <GlassButton>Buy us a coffee</GlassButton>
          </a>
        </GlassCard>
      </div>
    </div>
  );
}
