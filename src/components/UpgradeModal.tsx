import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { GlassButton } from "@/components/ui/glass-button";
import { Sparkles, Check, X, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { cn } from "@/lib/utils";
import { 
  BOOST_PRICE_ID, 
  BOOST_PRICE_DISPLAY, 
  BOOST_ANNUAL_PRICE_ID, 
  BOOST_ANNUAL_PRICE_DISPLAY, 
  paymentsAvailable 
} from "@/lib/stripe";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  priceId?: string;
}

export function UpgradeModal({ isOpen, onClose, priceId }: UpgradeModalProps) {
  const { user, isAnonymous } = useAuth();
  const requireAuth = useRequireAuth();
  const [showCheckout, setShowCheckout] = useState(false);
  const [selectedPriceId, setSelectedPriceId] = useState(priceId || BOOST_PRICE_ID);

  useEffect(() => {
    if (isOpen) {
      setSelectedPriceId(priceId || BOOST_PRICE_ID);
      setShowCheckout(false);
    }
  }, [isOpen, priceId]);

  const handleClose = () => {
    setShowCheckout(false);
    onClose();
  };

  const handleSignIn = () => {
    handleClose();
    requireAuth("generic");
  };

  const isAnnual = selectedPriceId === BOOST_ANNUAL_PRICE_ID;
  const priceDisplay = isAnnual ? BOOST_ANNUAL_PRICE_DISPLAY : BOOST_PRICE_DISPLAY;

  const isRealUser = !!user && !isAnonymous;
  const canCheckout = paymentsAvailable() && isRealUser;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent 
        className={cn(
          "max-w-lg border-white/10 p-0 overflow-hidden bg-background/95 backdrop-blur-xl transition-all duration-300",
          showCheckout && "border-none bg-transparent shadow-none backdrop-blur-none overflow-visible [&>button]:hidden"
        )}
      >
        {!showCheckout ? (
          <div className="p-6 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/15 mb-4">
              <Zap className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-1">ArcAI Boost</h2>
            
            {/* Billing Cycle Selector Switch */}
            <div className="flex justify-center my-5">
              <div className="inline-flex items-center gap-0.5 p-1 rounded-full bg-muted/40 border border-border/40 backdrop-blur-xl">
                <button
                  onClick={() => setSelectedPriceId(BOOST_PRICE_ID)}
                  className={cn(
                    "h-8 px-4 rounded-full text-xs font-semibold transition-all duration-200",
                    selectedPriceId === BOOST_PRICE_ID
                      ? "bg-primary/70 text-primary-foreground shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setSelectedPriceId(BOOST_ANNUAL_PRICE_ID)}
                  className={cn(
                    "h-8 px-4 rounded-full text-xs font-semibold transition-all duration-200 relative",
                    selectedPriceId === BOOST_ANNUAL_PRICE_ID
                      ? "bg-primary/70 text-primary-foreground shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Yearly
                  <span className="absolute -top-1.5 -right-2 bg-emerald-500 text-[8px] text-white px-1.5 py-0.5 rounded-full font-bold">
                    Save 22%
                  </span>
                </button>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-1">
              {isAnnual ? "$65/year paid upgrade" : "$10/month paid upgrade"}
            </p>
            <div className="flex items-baseline justify-center gap-1 my-4">
              <span className="text-4xl font-bold">{priceDisplay.split('/')[0]}</span>
              <span className="text-muted-foreground">/ {isAnnual ? "year" : "month"}</span>
            </div>

            <ul className="text-left space-y-2.5 mb-6 max-w-sm mx-auto">
              {[
                "Unlimited GPT-5.4 (Thinking) reasoning chats",
                "Unlimited GPT-5.5 (Deep Think) reasoning chats",
                "20 high-fidelity GPT Image 2 outputs per day",
                "Premium image editing (variations & base image combining)",
                "Publish your code online at a custom arc link",
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
              20 Smarter chats/day · GPT-Image-1 Mini (40/day) · GPT-Image-1 (10/day) · 3 GPT-Image-2/day · 2 shared chats
            </div>

            {canCheckout ? (
              <GlassButton className="w-full" onClick={() => setShowCheckout(true)}>
                Upgrade to Boost
              </GlassButton>
            ) : (
              <>
                <GlassButton className="w-full" onClick={isRealUser ? handleClose : handleSignIn}>
                  {isRealUser ? "Got it" : "Sign in to upgrade"}
                </GlassButton>
                {!paymentsAvailable() && user && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Checkout coming soon, go-live in progress.
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="relative w-full max-h-[90vh] overflow-y-auto rounded-xl p-1 overflow-visible">
            {/* Absolute custom Back/Close button floating outside the Stripe box */}
            <button
              onClick={() => setShowCheckout(false)}
              className="absolute -top-12 right-0 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 p-2 rounded-full transition-all border border-white/10 backdrop-blur-md flex items-center justify-center z-50 shadow-lg hover:scale-105 active:scale-95"
              aria-label="Back"
            >
              <X className="h-4 w-4" />
            </button>
            <StripeEmbeddedCheckout
              priceId={selectedPriceId}
              customerEmail={user?.email}
              userId={user?.id}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
