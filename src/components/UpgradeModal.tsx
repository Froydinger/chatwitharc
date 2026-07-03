import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { GlassButton } from "@/components/ui/glass-button";
import { Sparkles, Check, X, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { BOOST_PRICE_ID, BOOST_PRICE_DISPLAY, paymentsAvailable } from "@/lib/stripe";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
}

// ArcAI is free forever. This modal pitches the ArcAI Boost upgrade ($7/mo)
// for users who want unlimited image generation and unlimited voice
// conversations. Free quotas: 10 images/day, 10 voice conversations / 30 days.
export function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  const { user } = useAuth();
  const [showCheckout, setShowCheckout] = useState(false);

  const handleClose = () => {
    setShowCheckout(false);
    onClose();
  };

  const canCheckout = paymentsAvailable() && !!user;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg glass-card border-white/10 p-0 overflow-hidden">
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {!showCheckout ? (
          <div className="p-6 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/15 mb-4">
              <Zap className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-1">ArcAI Boost</h2>
            <p className="text-sm text-muted-foreground mb-1">$7/month paid upgrade</p>
            <div className="flex items-baseline justify-center gap-1 my-4">
              <span className="text-4xl font-bold">{BOOST_PRICE_DISPLAY.split('/')[0]}</span>
              <span className="text-muted-foreground">/ month</span>
            </div>

            <ul className="text-left space-y-2.5 mb-6 max-w-sm mx-auto">
              {[
                "Unlimited Smarter (GPT-5.4 Mini) reasoning chats",
                "Generate up to 30 images a day (10 on free)",
                "Publish your code creations and custom sites to the web",
                "Unlimited voice conversations",
                "Unlimited shared chats (up to 6 people each)",
                "Cancel anytime",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="rounded-lg bg-white/5 border border-white/10 p-3 mb-5 text-xs text-muted-foreground">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Sparkles className="h-3 w-3" />
                <span className="font-medium text-foreground">Free forever includes</span>
              </div>
              20 Smarter chats/day · Unlimited Fast chats · 10 images/day · 2 shared chats
            </div>

            {canCheckout ? (
              <GlassButton className="w-full" onClick={() => setShowCheckout(true)}>
                Upgrade to Boost
              </GlassButton>
            ) : (
              <>
                <GlassButton className="w-full" onClick={handleClose}>
                  {user ? "Got it" : "Sign in to upgrade"}
                </GlassButton>
                {!paymentsAvailable() && user && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Checkout coming soon — go-live in progress.
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="p-4">
            <h3 className="text-lg font-semibold mb-3 text-center">Complete your upgrade</h3>
            <div className="bg-white rounded-lg overflow-hidden">
              <StripeEmbeddedCheckout
                priceId={BOOST_PRICE_ID}
                customerEmail={user?.email}
                userId={user?.id}
              />
            </div>
            <button
              onClick={() => setShowCheckout(false)}
              className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center"
            >
              ← Back
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
